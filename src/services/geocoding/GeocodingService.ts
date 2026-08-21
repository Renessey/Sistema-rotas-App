import type { DeliveryEntity, GeocodeResult } from '../../types/geo';
import { DatabaseService } from '../../storage/DatabaseService';
import {
  buildGeocodingQuery,
  expandAbbreviations,
  stripComplementNoise,
  normalizeForSearch,
  extractCep,
} from '../../utils/addressParser';

const MAPTILER_API_KEY = 'gK1k9hgPpqK3yZo3UbrJ';

/**
 * GeocodingService — Motor de Geocodificação em Cascata de Alta Precisão.
 *
 * Estratégia de Geocodificação (em ordem de precisão):
 *   0. Cache local SQLite (0ms, offline)
 *   1. Coordenadas exatas já presentes na planilha (se válidas)
 *   2. MapTiler Geocoding API — alta precisão com suporte a números prediais,
 *      resolução fonética e grafias brasileiras.
 *   3. Nominatim (OpenStreetMap) — busca estruturada e por texto livre
 *   4. Photon (Komoot) — busca tolerante a erros com foco Brasil
 *   5. ViaCEP — enriquece nomes de ruas oficiais para reconsulta
 *   6. BrasilAPI — fallback por centroide do CEP (apenas quando não há rua)
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
        confidence: 'high',
        provider: 'spreadsheet',
      };
    }
    return null;
  }

  /** Passo 2: MapTiler Geocoding API (Alta precisão) */
  private static async maptilerGeocode(query: string): Promise<GeocodeResult | null> {
    if (!query || query.trim().length === 0) return null;
    try {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_API_KEY}&country=br&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data = await res.json() as {
        features?: Array<{
          center?: [number, number];
          place_name?: string;
          relevance?: number;
          properties?: { kind?: string };
        }>;
      };
      const feat = data.features?.[0];
      if (!feat?.center || feat.center.length < 2) return null;

      const [lon, lat] = feat.center;
      if (isNaN(lat) || isNaN(lon)) return null;

      const relevance = feat.relevance ?? 0.5;
      return {
        latitude: lat,
        longitude: lon,
        confidence: relevance >= 0.6 ? 'high' : 'medium',
        provider: 'maptiler',
        formattedAddress: feat.place_name,
      };
    } catch (e) {
      console.warn('[GeocodingService] MapTiler failed', e);
      return null;
    }
  }

  /** Passo 3: Nominatim (OpenStreetMap) */
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

  /** Helper Nominatim */
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

  /** Passo 4: Photon (Komoot) */
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
          properties?: { country?: string; name?: string; street?: string };
        }>;
      };
      const feat = data.features?.[0];
      if (!feat?.geometry?.coordinates) return null;
      if (feat.properties?.country && feat.properties.country !== 'Brasil' && feat.properties.country !== 'Brazil') {
        return null;
      }
      const [lon, lat] = feat.geometry.coordinates;
      return {
        latitude: lat,
        longitude: lon,
        confidence: 'low',
        provider: 'photon',
        formattedAddress: [feat.properties?.street || feat.properties?.name, city, 'Brasil'].filter(Boolean).join(', '),
      };
    } catch (e) {
      console.warn('[GeocodingService] Photon failed', e);
      return null;
    }
  }

  /** Passo 5: Enriquecimento via ViaCEP + Reconsulta no MapTiler/Nominatim */
  private static async viaCepEnrichAndGeocode(
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
      if (data.erro || !data.logradouro) return null;

      const street = expandAbbreviations(data.logradouro);
      const query = [
        street,
        houseNumber ? `nº ${houseNumber}` : '',
        data.bairro,
        data.localidade,
        data.uf,
        data.cep,
      ].filter(Boolean).join(', ');

      // Tenta MapTiler primeiro com os dados do ViaCEP
      const maptilerRes = await GeocodingService.maptilerGeocode(query);
      if (maptilerRes) {
        return { ...maptilerRes, provider: 'viacep+nominatim' };
      }

      // Tenta Nominatim
      const nomRes = await GeocodingService.nominatimQuery(encodeURIComponent(query), 'viacep+nominatim');
      if (nomRes) return nomRes;
    } catch (e) {
      console.warn('[GeocodingService] ViaCEP failed', e);
    }
    return null;
  }

  /** Passo 6: Fallback BrasilAPI v2 (somente se não há rua informada) */
  private static async viaApiCep(cep: string): Promise<GeocodeResult | null> {
    const raw = cep.replace(/\D/g, '');
    if (raw.length !== 8) return null;
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${raw}`, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
        signal: AbortSignal.timeout(5000),
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
          confidence: 'low',
          provider: 'brasilapi',
          formattedAddress: [data.street, data.neighborhood, data.city, data.state].filter(Boolean).join(', '),
        };
      }
    } catch (e) {
      console.warn('[GeocodingService] BrasilAPI failed', e);
    }
    return null;
  }

  /**
   * Geocodifica uma entrega usando a cascata completa de alta precisão.
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

    // 0. Cache SQLite
    const cached = GeocodingService.checkCache(cacheKey);
    if (cached) return cached;

    const cleanCep = row.cep ? extractCep(row.cep.replace(/\D/g, '').padStart(8, '0').slice(0, 8)) : null;
    const hasStreet = row.address && row.address.trim().length > 2;

    let result: GeocodeResult | null = null;

    // 1. Constrói query otimizada
    const primaryQuery = buildGeocodingQuery({
      address: row.address,
      number: row.number,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      cep: cleanCep ?? undefined,
    });

    // 2. MapTiler Geocoding (Melhor precisão para Brasil)
    if (primaryQuery) {
      result = await GeocodingService.maptilerGeocode(primaryQuery);
    }

    // 3. Nominatim Estruturado
    if (!result || result.confidence === 'low') {
      const nomRes = await GeocodingService.nominatimStructured(row);
      if (nomRes && (!result || nomRes.confidence === 'high')) {
        result = nomRes;
      }
    }

    // 4. Photon Fallback
    if (!result) {
      const queryPhoton = `${row.address}${row.number ? ', ' + row.number : ''}`;
      result = await GeocodingService.photon(queryPhoton, row.city);
    }

    // 5. ViaCEP para descobrir rua oficial caso tenha falhado
    if (!result && cleanCep) {
      result = await GeocodingService.viaCepEnrichAndGeocode(cleanCep, row.number);
    }

    // 6. BrasilAPI CEP (Somente quando não temos rua ou nada mais funcionou)
    if (!result && cleanCep && !hasStreet) {
      result = await GeocodingService.viaApiCep(cleanCep);
    }

    if (result) {
      GeocodingService.saveCache(cacheKey, result);
    }

    return result;
  }

  /** Geocodifica uma query de texto livre (para barra de busca) */
  static async geocodeQuery(query: string): Promise<GeocodeResult | null> {
    const cacheKey = `query|${normalizeForSearch(query).toLowerCase()}`;
    const cached = GeocodingService.checkCache(cacheKey);
    if (cached) return cached;

    // 1. Tenta MapTiler
    let result = await GeocodingService.maptilerGeocode(query);

    // 2. Tenta Nominatim
    if (!result) {
      result = await GeocodingService.nominatimQuery(encodeURIComponent(query + ', Brasil'), 'nominatim');
    }

    // 3. Fallback Photon
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
