import type { DeliveryEntity, GeocodeResult } from '../../types/geo';
import { DatabaseService } from '../../storage/DatabaseService';
import {
  buildGeocodingQuery,
  expandAbbreviations,
  stripComplementNoise,
  normalizeForSearch,
  extractCep,
} from '../../utils/addressParser';

/**
 * GeocodingService — Motor de Geocodificação em Cascata.
 *
 * Estratégia (em ordem de prioridade):
 *   0. Cache local SQLite (0ms, funciona offline)
 *   1. Coordenadas já presentes na planilha
 *   2. BrasilAPI v2 por CEP — retorna coords + logradouro padronizado
 *   3. ViaCEP por CEP → dados estruturados → Nominatim estruturado
 *   4. Nominatim com query construída de campos individuais
 *   5. Photon (Komoot) — busca tolerante a erros, foco Brasil
 *   6. Null (→ entregador resolve manualmente no mapa)
 *
 * NOTA: Valhalla é o ENGINE DE ROTEAMENTO e NÃO é usado para geocodificação.
 */
export class GeocodingService {
  private static memCache = new Map<string, GeocodeResult>();

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

  /** Passo 1: Usa coords da planilha quando já existirem e forem válidas */
  static resolveFromRow(row: Omit<DeliveryEntity, 'id'>): GeocodeResult | null {
    if (
      row.latitude !== null &&
      row.longitude !== null &&
      row.latitude !== undefined &&
      row.longitude !== undefined &&
      row.latitude >= -90 && row.latitude <= 90 &&
      row.longitude >= -180 && row.longitude <= 180
    ) {
      return {
        latitude: row.latitude,
        longitude: row.longitude,
        confidence: 'high',
        provider: 'spreadsheet',
      };
    }
    return null;
  }

  /** Passo 2: BrasilAPI v2 — retorna coords diretas quando disponíveis */
  private static async viaApiCep(cep: string): Promise<GeocodeResult | null> {
    const raw = cep.replace(/\D/g, '');
    if (raw.length !== 8) return null;
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${raw}`, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data = await res.json() as {
        latitude?: number | string | null;
        longitude?: number | string | null;
        street?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
      };
      const lat = typeof data.latitude === 'string' ? parseFloat(data.latitude) : data.latitude;
      const lon = typeof data.longitude === 'string' ? parseFloat(data.longitude) : data.longitude;
      if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
        return {
          latitude: lat,
          longitude: lon,
          confidence: 'high',
          provider: 'brasilapi',
          formattedAddress: [data.street, data.neighborhood, data.city, data.state].filter(Boolean).join(', '),
        };
      }
    } catch (e) {
      console.warn('[GeocodingService] BrasilAPI failed', e);
    }
    return null;
  }

  /** Passo 3: ViaCEP → Nominatim estruturado */
  private static async viaCepThenNominatim(
    cep: string,
    houseNumber?: string,
  ): Promise<GeocodeResult | null> {
    const raw = cep.replace(/\D/g, '');
    if (raw.length !== 8) return null;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = await res.json() as {
        erro?: boolean;
        logradouro?: string;
        complemento?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
        cep?: string;
      };
      if (data.erro) return null;

      // Build structured Nominatim query from ViaCEP response
      const street = expandAbbreviations(data.logradouro ?? '');
      const query = encodeURIComponent(`${street}${houseNumber ? ', ' + houseNumber : ''}, ${data.bairro ?? ''}, ${data.localidade ?? ''}, ${data.uf ?? ''}, Brasil`);
      const geocoded = await GeocodingService.nominatimQuery(query, 'viacep+nominatim');
      return geocoded;
    } catch (e) {
      console.warn('[GeocodingService] ViaCEP failed', e);
    }
    return null;
  }

  /** Passo 4: Nominatim com query de endereço construída dos campos da entrega */
  private static async nominatimStructured(
    row: Pick<DeliveryEntity, 'address' | 'number' | 'neighborhood' | 'city' | 'state' | 'cep'>,
  ): Promise<GeocodeResult | null> {
    const q = buildGeocodingQuery({
      address: row.address,
      number: row.number,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      cep: row.cep,
    });
    return GeocodingService.nominatimQuery(encodeURIComponent(q), 'nominatim');
  }

  /** Helper: chama Nominatim com a query e retorna GeocodeResult */
  private static async nominatimQuery(
    encodedQuery: string,
    provider: GeocodeResult['provider'],
  ): Promise<GeocodeResult | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodedQuery}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json() as Array<{
        lat: string; lon: string; type?: string; display_name?: string;
      }>;
      if (!data.length) return null;
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        confidence: data[0].type === 'house' ? 'high' : 'medium',
        provider,
        formattedAddress: data[0].display_name,
      };
    } catch (e) {
      console.warn('[GeocodingService] Nominatim failed', e);
      return null;
    }
  }

  /** Passo 5: Photon (Komoot) — tolerante a erros de digitação */
  private static async photon(
    address: string,
    city?: string,
  ): Promise<GeocodeResult | null> {
    const clean = stripComplementNoise(expandAbbreviations(address));
    const q = encodeURIComponent(`${clean}${city ? ', ' + city : ''}, Brasil`);
    try {
      const url = `https://photon.komoot.io/api/?q=${q}&limit=1&lang=pt`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json() as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: { country?: string };
        }>;
      };
      const feat = data.features?.[0];
      if (!feat?.geometry?.coordinates) return null;
      // Filter by country (Brazil)
      if (feat.properties?.country && feat.properties.country !== 'Brasil' && feat.properties.country !== 'Brazil') {
        return null;
      }
      const [lon, lat] = feat.geometry.coordinates;
      return {
        latitude: lat,
        longitude: lon,
        confidence: 'low',
        provider: 'photon',
      };
    } catch (e) {
      console.warn('[GeocodingService] Photon failed', e);
      return null;
    }
  }

  /**
   * Geocodifica uma entrega usando a cascata completa.
   * Retorna null somente quando nenhum provedor encontrou o endereço.
   */
  static async geocodeDelivery(
    row: Pick<DeliveryEntity, 'address' | 'number' | 'neighborhood' | 'city' | 'state' | 'cep'>,
  ): Promise<GeocodeResult | null> {
    const cacheKey = GeocodingService.key({
      address: row.address,
      number: row.number,
      city: row.city,
      cep: row.cep,
    });

    // 0. Cache
    const cached = GeocodingService.checkCache(cacheKey);
    if (cached) return cached;

    // Extract CEP
    const cleanCep = row.cep ? extractCep(row.cep.replace(/\D/g, '').padStart(8, '0').slice(0, 8)) : null;

    let result: GeocodeResult | null = null;

    // 2. BrasilAPI
    if (cleanCep) {
      result = await GeocodingService.viaApiCep(cleanCep);
    }

    // 3. ViaCEP + Nominatim
    if (!result && cleanCep) {
      result = await GeocodingService.viaCepThenNominatim(cleanCep, row.number);
    }

    // 4. Nominatim estruturado
    if (!result) {
      result = await GeocodingService.nominatimStructured(row);
    }

    // 5. Photon fallback
    if (!result || result.confidence === 'low') {
      const photonResult = await GeocodingService.photon(
        `${row.address}${row.number ? ', ' + row.number : ''}`,
        row.city,
      );
      if (photonResult && (!result || photonResult.confidence > result.confidence)) {
        result = photonResult;
      }
    }

    if (result) {
      GeocodingService.saveCache(cacheKey, result);
    }

    return result;
  }

  /** Geocodifica uma query de texto livre (para busca manual) */
  static async geocodeQuery(query: string): Promise<GeocodeResult | null> {
    const cacheKey = `query|${normalizeForSearch(query).toLowerCase()}`;
    const cached = GeocodingService.checkCache(cacheKey);
    if (cached) return cached;

    // Tenta Nominatim
    let result = await GeocodingService.nominatimQuery(encodeURIComponent(query + ', Brasil'), 'nominatim');

    // Fallback Photon
    if (!result) {
      result = await GeocodingService.photon(query);
    }

    if (result) GeocodingService.saveCache(cacheKey, result);
    return result;
  }

  /** Compatibilidade retroativa */
  static async geocode(
    address: string,
    city = 'Maricá',
    state = 'RJ',
  ): Promise<GeocodeResult | null> {
    return GeocodingService.geocodeDelivery({ address, number: '', neighborhood: '', city, state, cep: '' });
  }

  static clearCache(): void {
    GeocodingService.memCache.clear();
  }
}
