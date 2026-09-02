import type { DeliveryEntity, GeocodeResult } from '../../types/geo';
import { DatabaseService } from '../../storage/DatabaseService';
import { RoutingService } from '../routing/RoutingService';
import {
  buildAddressQuery,
  normalizeForSearch,
  extractCep,
} from '../../utils/addressParser';

interface PhotonFeature {
  geometry: {
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    postcode?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

/**
 * GeocodingService — Motor de Geocodificação Offline-First & Gratuito.
 *
 * Estratégia de Geocodificação:
 *   1. Coordenadas preenchidas na planilha (0ms, 100% offline, exato)
 *   2. Histórico permanente de pinos ajustados e confirmados no SQLite (0ms, offline)
 *   3. Cache local SQLite (0ms, offline)
 *   4. Geocodificador aberto Photon (OpenStreetMap) + ViaCEP (100% gratuito e sem limite de API)
 */
export class GeocodingService {
  private static memCache = new Map<string, GeocodeResult>();
  private static forceOffline = true;

  static setForceOffline(_offline: boolean) {
    GeocodingService.forceOffline = true;
  }

  static isForcedOffline(): boolean {
    return true;
  }

  static async mapboxGeocode(query: string): Promise<GeocodeResult | null> {
    return GeocodingService.photonGeocode(query);
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
   * Geocodificação aberta via Photon (OpenStreetMap) — Gratuita e pública
   */
  static async photonGeocode(query: string): Promise<GeocodeResult | null> {
    if (!query || query.trim().length < 3) return null;

    try {
      const encoded = encodeURIComponent(query.trim());
      // Foca na região do Brasil / Rio de Janeiro
      const url = `https://photon.komoot.io/api/?q=${encoded}&limit=1&lat=-22.9&lon=-43.0`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return null;
      const data = (await res.json()) as PhotonResponse;

      if (!data.features || data.features.length === 0) return null;

      const first = data.features[0];
      const [lng, lat] = first.geometry.coordinates;

      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return null;
      }

      const p = first.properties;
      const formatted = [p.name || p.street, p.housenumber, p.city, p.state]
        .filter(Boolean)
        .join(', ');

      return {
        latitude: lat,
        longitude: lng,
        confidence: 'high',
        provider: 'osm_photon',
        formattedAddress: formatted || query,
      };
    } catch {
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
   * Geocodifica uma entrega completa usando histórico local, cache e provedores abertos.
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

    // 2. Geocodificação aberta via Photon OSM
    let result = await GeocodingService.photonGeocode(query);

    // 3. Se falhou e tem CEP, tenta expandir o CEP via ViaCEP
    if (!result && cep) {
      const expandedStreet = await GeocodingService.viaCepLookup(cep);
      if (expandedStreet) {
        const fullQuery = row.number ? `${expandedStreet}, ${row.number}` : expandedStreet;
        result = await GeocodingService.photonGeocode(fullQuery);
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

    // Se coordenadas forem nulas ou inválidas, executa busca no Geocoding
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

    // Alinha o ponto à malha viária real usando Snap do motor offline
    const snapped = await RoutingService.snapPoint([lon, lat]);
    const snappedLon = snapped.snapped ? snapped.snapped[0] : lon;
    const snappedLat = snapped.snapped ? snapped.snapped[1] : lat;

    return {
      latitude: lat,
      longitude: lon,
      snappedLatitude: snappedLat,
      snappedLongitude: snappedLon,
      provider: snapped.matched ? `${provider}+osm_snap` : provider,
      formattedAddress,
    };
  }

  /**
   * Geocodifica uma string de busca direta usando o histórico local e o Photon OSM.
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
    return this.photonGeocode(query);
  }

  static clearCache(): void {
    GeocodingService.memCache.clear();
  }
}
