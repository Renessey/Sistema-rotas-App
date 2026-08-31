import type { DeliveryEntity, GeocodeResult } from '../../types/geo';
import { DatabaseService } from '../../storage/DatabaseService';
import { RoutingService } from '../routing/RoutingService';
import { MapboxQuota } from '../routing/MapboxQuota';
import { getMapboxAccessToken } from '../../config/env';
import {
  buildAddressQuery,
  normalizeForSearch,
  extractCep,
} from '../../utils/addressParser';

interface MapboxGeocodeFeature {
  id: string;
  type: string;
  place_type: string[];
  relevance: number;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  address?: string;
}

interface MapboxGeocodeApiResponse {
  type: string;
  features: MapboxGeocodeFeature[];
  attribution: string;
}

/**
 * GeocodingService — Motor de Geocodificação Oficial Mapbox Geocoding API v5.
 *
 * Estratégia de Geocodificação:
 *   0. Cache local SQLite / Memória (0ms, offline, economiza cota da API)
 *   1. Coordenadas já preenchidas na planilha (se válidas, 0 chamadas)
 *   2. Mapbox Geocoding API v5 — Alta precisão viária, busca estruturada e cota integrada
 *   3. Enriquecimento por CEP (ViaCEP / BrasilAPI) quando necessário
 */
export class GeocodingService {
  private static memCache = new Map<string, GeocodeResult>();
  private static forceOffline = false;

  static setForceOffline(offline: boolean) {
    GeocodingService.forceOffline = offline;
  }

  static isForcedOffline(): boolean {
    return GeocodingService.forceOffline;
  }

  /** Retorna o cacheKey canônico para um endereço */
  private static key(params: {
    address?: string;
    number?: string;
    city?: string;
    cep?: string;
  }): string {
    const cep = params.cep ? params.cep.replace(/\D/g, '') : '';
    const addr = normalizeForSearch(params.address ?? '').toLowerCase();
    const num = (params.number ?? '').trim();
    const city = normalizeForSearch(params.city ?? '').toLowerCase();
    return `${cep}|${addr}|${num}|${city}`;
  }

  /** Passo 0: Verifica cache em memória e SQLite */
  private static checkCache(cacheKey: string): GeocodeResult | null {
    const mem = GeocodingService.memCache.get(cacheKey);
    if (mem) return mem;

    const db = DatabaseService.getGeocodingCache(cacheKey);
    if (db) {
      const result: GeocodeResult = {
        latitude: db.latitude,
        longitude: db.longitude,
        confidence: db.confidence as GeocodeResult['confidence'],
        provider: 'cache',
        formattedAddress: db.formattedAddress,
      };
      GeocodingService.memCache.set(cacheKey, result);
      return result;
    }
    return null;
  }

  private static saveCache(cacheKey: string, result: GeocodeResult): void {
    GeocodingService.memCache.set(cacheKey, result);
    try {
      DatabaseService.saveGeocodingCache(cacheKey, {
        latitude: result.latitude,
        longitude: result.longitude,
        confidence: result.confidence,
        provider: result.provider,
        formattedAddress: result.formattedAddress,
      });
    } catch {
      // Cache is best-effort
    }
  }

  /** Passo 1: Usa coordenadas da planilha quando já existirem e forem válidas */
  static resolveFromRow(row: Omit<DeliveryEntity, 'id'>): GeocodeResult | null {
    if (
      row.latitude !== null &&
      row.longitude !== null &&
      row.latitude !== undefined &&
      row.longitude !== undefined &&
      row.latitude >= -90 && row.latitude <= 90 &&
      row.longitude >= -180 && row.longitude <= 180 &&
      (row.latitude !== 0 || row.longitude !== 0)
    ) {
      return {
        latitude: row.latitude,
        longitude: row.longitude,
        confidence: 'exact',
        provider: 'spreadsheet',
        formattedAddress: row.destination,
      };
    }
    return null;
  }

  /**
   * Passo 2: Mapbox Geocoding API v5
   * Endpoint: https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json
   */
  static async mapboxGeocode(query: string): Promise<GeocodeResult | null> {
    if (GeocodingService.forceOffline || !query || query.trim().length < 3) return null;

    const canRequest = await MapboxQuota.canMakeRequest();
    if (!canRequest) {
      console.warn('[GeocodingService] Limite diário de requisições Mapbox atingido.');
      return null;
    }

    try {
      const token = getMapboxAccessToken();
      const encodedQuery = encodeURIComponent(query.trim());
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?country=BR&types=address,poi,place&language=pt&access_token=${token}`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`[GeocodingService] Mapbox Geocoding HTTP error ${res.status}`);
        return null;
      }

      await MapboxQuota.recordRequest(1);
      const data = (await res.json()) as MapboxGeocodeApiResponse;

      if (!data.features || data.features.length === 0) {
        return null;
      }

      const first = data.features[0];
      const [lng, lat] = first.center;

      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return null;
      }

      const confidence: GeocodeResult['confidence'] =
        first.relevance >= 0.8 ? 'high' : first.relevance >= 0.5 ? 'medium' : 'low';

      return {
        latitude: lat,
        longitude: lng,
        confidence,
        provider: 'mapbox',
        formattedAddress: first.place_name,
      };
    } catch (e) {
      console.warn('[GeocodingService] Mapbox Geocoding request failed', e);
      return null;
    }
  }

  /** Fallback por CEP (ViaCEP / BrasilAPI) */
  private static async viaCepLookup(cep: string): Promise<string | null> {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return null;

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.erro) return null;
      return `${data.logradouro}, ${data.bairro}, ${data.localidade}, ${data.uf}`;
    } catch {
      return null;
    }
  }

  /**
   * Geocodifica uma entrega completa usando exclusivamente o Mapbox com cache local.
   */
  static async geocodeDelivery(
    row: Pick<DeliveryEntity, 'address' | 'number' | 'neighborhood' | 'city' | 'state' | 'cep'>,
  ): Promise<GeocodeResult | null> {
    const rawAddress = row.address ?? '';
    const cep = row.cep ? extractCep(row.cep) : extractCep(rawAddress);

    const cacheKey = GeocodingService.key({
      address: rawAddress,
      number: row.number,
      city: row.city,
      cep: cep ?? undefined,
    });

    // 0. Verifica histórico permanente de pinos ajustados/confirmados (0ms, offline)
    const hist = DatabaseService.findAddressHistory({
      address: rawAddress,
      number: row.number,
      bairro: row.neighborhood,
      city: row.city,
      zipCode: row.cep,
    });
    if (hist) {
      return {
        latitude: hist.latitude,
        longitude: hist.longitude,
        confidence: 'high',
        provider: `history_${hist.source}`,
        formattedAddress: hist.rawAddress || rawAddress,
      };
    }

    // 0.1 Cache em memória e SQLite
    const cached = GeocodingService.checkCache(cacheKey);
    if (cached) return cached;

    // 1. Constrói query otimizada
    const query = buildAddressQuery({
      address: rawAddress,
      number: row.number,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      cep: cep ?? undefined,
    });

    // 2. Mapbox Geocoding
    let result = await GeocodingService.mapboxGeocode(query);

    // 3. Se falhou e tem CEP, tenta expandir o CEP via ViaCEP e consulta Mapbox novamente
    if (!result && cep) {
      const expandedStreet = await GeocodingService.viaCepLookup(cep);
      if (expandedStreet) {
        const fullQuery = row.number ? `${expandedStreet}, ${row.number}` : expandedStreet;
        result = await GeocodingService.mapboxGeocode(fullQuery);
      }
    }

    if (result) {
      GeocodingService.saveCache(cacheKey, result);
    }

    return result;
  }

  /**
   * Geocodifica e alinha à via (Snap) uma linha de entrega importada.
   */
  static async geocodeAndSnapDelivery(
    row: Partial<DeliveryEntity> & { destination?: string; bairro?: string },
  ): Promise<{
    latitude: number;
    longitude: number;
    snappedLatitude: number;
    snappedLongitude: number;
    provider: string;
    formattedAddress?: string;
  } | null> {
    let lat = row.latitude ?? null;
    let lon = row.longitude ?? null;
    let provider = 'spreadsheet';
    let formattedAddress = row.destination || row.address || row.name;

    // Se coordenadas forem nulas ou inválidas, executa busca no Mapbox Geocoding
    if (lat === null || lon === null || isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
      const geo = await GeocodingService.geocodeDelivery({
        address: row.destination || row.address || row.name || '',
        number: row.number,
        neighborhood: row.bairro || row.neighborhood || undefined,
        city: row.city || '',
        state: row.state || undefined,
        cep: row.zipCode || row.cep || undefined,
      });

      if (!geo) return null;
      lat = geo.latitude;
      lon = geo.longitude;
      provider = geo.provider;
      formattedAddress = geo.formattedAddress || formattedAddress;
    }

    // Alinha o ponto à malha viária real usando Mapbox Snap
    const snapped = await RoutingService.snapPoint([lon, lat]);
    const snappedLon = snapped.snapped ? snapped.snapped[0] : lon;
    const snappedLat = snapped.snapped ? snapped.snapped[1] : lat;

    return {
      latitude: lat,
      longitude: lon,
      snappedLatitude: snappedLat,
      snappedLongitude: snappedLon,
      provider: snapped.matched ? `${provider}+mapbox_snap` : provider,
      formattedAddress,
    };
  }

  /**
   * Geocodifica uma string de busca direta usando o histórico local e o Mapbox Places API.
   */
  static async geocodeQuery(query: string): Promise<GeocodeResult | null> {
    const hist = DatabaseService.findAddressHistory({ address: query });
    if (hist) {
      return {
        latitude: hist.latitude,
        longitude: hist.longitude,
        confidence: 'high',
        provider: `history_${hist.source}`,
        formattedAddress: hist.rawAddress || query,
      };
    }
    return this.mapboxGeocode(query);
  }

  static clearCache(): void {
    GeocodingService.memCache.clear();
  }
}
