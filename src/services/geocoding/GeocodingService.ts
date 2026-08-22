import type { DeliveryEntity, GeocodeResult } from '../../types/geo';
import { DatabaseService } from '../../storage/DatabaseService';
import {
  buildGoogleGeocodingQuery,
  expandAbbreviations,
  stripComplementNoise,
  normalizeForSearch,
  extractCep,
} from '../../utils/addressParser';
import { GoogleQuotaManager, QuotaExceededError } from './GoogleQuotaManager';
import { getGoogleMapsApiKey } from '../../config/env';

interface GoogleGeocodeApiResponse {
  results?: Array<{
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
      location_type: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';
    };
    types: string[];
    place_id: string;
  }>;
  status:
    | 'OK'
    | 'ZERO_RESULTS'
    | 'OVER_QUERY_LIMIT'
    | 'REQUEST_DENIED'
    | 'INVALID_REQUEST'
    | 'UNKNOWN_ERROR';
  error_message?: string;
}

/**
 * GeocodingService — Motor de Geocodificação em Cascata com Google Geocoding API.
 *
 * Estratégia de Geocodificação:
 *   0. Cache local SQLite / Memória (0ms, offline, economiza cota da API)
 *   1. Coordenadas já preenchidas na planilha (se válidas)
 *   2. Google Geocoding API — Alta precisão (ROOFTOP/RANGE_INTERPOLATED), controle de cota diária (300 req/dia)
 *   3. Nominatim (OpenStreetMap) — Fallback gratuito estruturado
 *   4. Photon (Komoot) — Fallback tolerante a erros
 *   5. ViaCEP — Enriquece nome de rua oficial para nova consulta
 *   6. BrasilAPI — Fallback final por centroide de CEP (quando não há rua)
 */
export interface SearchLocationResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  placeName?: string;
  matchType?: 'exact_place' | 'exact_address' | 'none';
  provider?: string;
  warningMessage?: string;
}

export class GeocodingService {
  private static memCache = new Map<string, GeocodeResult>();

  /**
   * Busca combinada inteligente por Nome e Endereço.
   * Se ambos ou o endereço forem localizados no Google, retorna com sucesso e coordenadas.
   * Se não encontrar nenhum dos dois, retorna com aviso claro e detalhado.
   */
  static async searchByNameAndAddress(params: {
    name?: string;
    address: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    cep?: string;
  }): Promise<SearchLocationResult> {
    const rawName = (params.name ?? '').trim();
    const rawAddress = (params.address ?? '').trim();

    if (!rawAddress && !params.cep && !rawName) {
      return {
        success: false,
        matchType: 'none',
        warningMessage: 'Informe o nome do local ou cliente e o endereço para realizar a busca.',
      };
    }

    const cleanCep = params.cep
      ? extractCep(params.cep.replace(/\D/g, '').padStart(8, '0').slice(0, 8))
      : null;

    const addressQuery = buildGoogleGeocodingQuery({
      address: rawAddress,
      number: params.number,
      neighborhood: params.neighborhood,
      city: params.city,
      state: params.state,
      cep: cleanCep ?? undefined,
    });

    const isGenericName = !rawName || rawName === 'Cliente sem nome' || rawName.startsWith('Entrega #');

    // 1. Tenta busca de estabelecimento (Nome + Endereço/Bairro) via Google Places
    if (!isGenericName && (addressQuery || rawAddress)) {
      const combinedPlaceQuery = `${rawName}, ${addressQuery || rawAddress}`;
      try {
        const placeResult = await GeocodingService.googlePlacesSearch(combinedPlaceQuery);
        if (placeResult) {
          return {
            success: true,
            latitude: placeResult.latitude,
            longitude: placeResult.longitude,
            formattedAddress: placeResult.formattedAddress,
            placeName: rawName,
            matchType: 'exact_place',
            provider: 'Google Places',
          };
        }
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
      }
    }

    // 2. Tenta Google Geocoding pelo endereço completo
    if (addressQuery) {
      try {
        const geoResult = await GeocodingService.googleGeocode(addressQuery);
        if (geoResult) {
          return {
            success: true,
            latitude: geoResult.latitude,
            longitude: geoResult.longitude,
            formattedAddress: geoResult.formattedAddress,
            placeName: rawName || undefined,
            matchType: 'exact_address',
            provider: 'Google Maps',
          };
        }
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
      }
    }

    // 3. Fallback pela cascata de geocodificação
    try {
      const fallbackResult = await GeocodingService.geocodeDelivery({
        name: rawName,
        address: rawAddress,
        number: params.number || '',
        neighborhood: params.neighborhood || '',
        city: params.city || '',
        state: params.state || '',
        cep: params.cep || '',
      } as any);

      if (fallbackResult) {
        return {
          success: true,
          latitude: fallbackResult.latitude,
          longitude: fallbackResult.longitude,
          formattedAddress: fallbackResult.formattedAddress,
          placeName: rawName || undefined,
          matchType: 'exact_address',
          provider: fallbackResult.provider,
        };
      }
    } catch {
      // ignore
    }

    // 4. Se não encontrar, retorna aviso detalhado
    const terms = [
      rawName && !isGenericName ? `Nome: "${rawName}"` : '',
      rawAddress ? `Endereço: "${rawAddress}"` : '',
      params.city ? `Cidade: "${params.city}"` : '',
    ].filter(Boolean).join(' e ');

    return {
      success: false,
      matchType: 'none',
      warningMessage: `⚠️ Não foi possível localizar o ponto com ${terms || 'os dados informados'}. Verifique se o nome do local ou o endereço estão corretos.`,
    };
  }

  /** Google Places API — Text Search para estabelecimentos e POIs */
  static async googlePlacesSearch(query: string): Promise<GeocodeResult | null> {
    if (!query || query.trim().length === 0) return null;

    try {
      const apiKey = getGoogleMapsApiKey();
      const encodedQuery = encodeURIComponent(query);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodedQuery}&region=br&language=pt-BR&key=${apiKey}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        status: string;
        results?: Array<{
          geometry: { location: { lat: number; lng: number } };
          formatted_address?: string;
          name?: string;
          place_id?: string;
        }>;
      };

      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const place = data.results[0];
        const { lat, lng } = place.geometry.location;
        if (typeof lat === 'number' && typeof lng === 'number') {
          return {
            latitude: lat,
            longitude: lng,
            confidence: 'high',
            provider: 'google',
            formattedAddress: place.formatted_address || place.name,
          };
        }
      }
    } catch (e) {
      console.warn('[GeocodingService] Google Places TextSearch failed', e);
    }
    return null;
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
        confidence: 'high',
        provider: 'spreadsheet',
      };
    }
    return null;
  }

  /**
   * Passo 2: Google Geocoding API (Alta precisão + controle de cota diária)
   *
   * Formato de chamada:
   * https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${API_KEY}
   */
  static async googleGeocode(query: string): Promise<GeocodeResult | null> {
    if (!query || query.trim().length === 0) return null;

    // Incrementa e valida a cota diária local (máx 300 req/dia)
    await GoogleQuotaManager.increment();

    try {
      const apiKey = getGoogleMapsApiKey();
      const encodedQuery = encodeURIComponent(query);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedQuery}&region=br&language=pt-BR&key=${apiKey}`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`[GeocodingService] Google Geocoding HTTP error ${res.status}`);
        return null;
      }

      const data = (await res.json()) as GoogleGeocodeApiResponse;

      if (data.status !== 'OK') {
        console.warn(
          `[GeocodingService] Google Geocoding response for query "${query}": status = "${data.status}", error_message = "${data.error_message || 'N/A'}". Full payload:`,
          JSON.stringify(data),
        );
      }

      if (data.status === 'ZERO_RESULTS') {
        return null;
      }

      if (data.status === 'OVER_QUERY_LIMIT') {
        throw new QuotaExceededError('Cota de requisições do Google Geocoding excedida na API.');
      }

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return null;
      }

      const first = data.results[0];
      const { lat, lng } = first.geometry.location;

      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return null;
      }

      const locType = first.geometry.location_type;
      const confidence: GeocodeResult['confidence'] =
        locType === 'ROOFTOP' || locType === 'RANGE_INTERPOLATED' ? 'high' : locType === 'GEOMETRIC_CENTER' ? 'medium' : 'low';

      return {
        latitude: lat,
        longitude: lng,
        confidence,
        provider: 'google',
        formattedAddress: first.formatted_address,
      };
    } catch (e: unknown) {
      if (e instanceof QuotaExceededError) {
        throw e;
      }
      console.warn('[GeocodingService] Google Geocoding request failed', e);
      return null;
    }
  }

  /** Passo 3: Nominatim (OpenStreetMap) */
  private static async nominatimStructured(
    row: Pick<DeliveryEntity, 'address' | 'number' | 'neighborhood' | 'city' | 'state' | 'cep'>,
  ): Promise<GeocodeResult | null> {
    const q = buildGoogleGeocodingQuery({
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
      const data = (await res.json()) as Array<{
        lat: string;
        lon: string;
        type?: string;
        display_name?: string;
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
      const data = (await res.json()) as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: { country?: string; name?: string; street?: string };
        }>;
      };
      const feat = data.features?.[0];
      if (!feat?.geometry?.coordinates) return null;
      if (
        feat.properties?.country &&
        feat.properties.country !== 'Brasil' &&
        feat.properties.country !== 'Brazil'
      ) {
        return null;
      }
      const [lon, lat] = feat.geometry.coordinates;
      return {
        latitude: lat,
        longitude: lon,
        confidence: 'low',
        provider: 'photon',
        formattedAddress: [
          feat.properties?.street || feat.properties?.name,
          city,
          'Brasil',
        ]
          .filter(Boolean)
          .join(', '),
      };
    } catch (e) {
      console.warn('[GeocodingService] Photon failed', e);
      return null;
    }
  }

  /** Passo 5: Enriquecimento via ViaCEP + Reconsulta no Google/Nominatim */
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
      const data = (await res.json()) as {
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
      ]
        .filter(Boolean)
        .join(', ');

      // Tenta Google Geocoding primeiro com os dados oficiais do ViaCEP
      try {
        const googleRes = await GeocodingService.googleGeocode(query);
        if (googleRes) {
          return { ...googleRes, provider: 'viacep+nominatim' };
        }
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
      }

      // Tenta Nominatim
      const nomRes = await GeocodingService.nominatimQuery(
        encodeURIComponent(query),
        'viacep+nominatim',
      );
      if (nomRes) return nomRes;
    } catch (e) {
      if (e instanceof QuotaExceededError) throw e;
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
      const data = (await res.json()) as {
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
          formattedAddress: [data.street, data.neighborhood, data.city, data.state]
            .filter(Boolean)
            .join(', '),
        };
      }
    } catch (e) {
      console.warn('[GeocodingService] BrasilAPI failed', e);
    }
    return null;
  }

  /**
   * Geocodifica uma entrega usando a cascata completa com Google Geocoding.
   */
  static async geocodeDelivery(
    row: Pick<DeliveryEntity, 'address' | 'number' | 'neighborhood' | 'city' | 'state' | 'cep'>,
  ): Promise<GeocodeResult | null> {
    const cleanCep = row.cep
      ? extractCep(row.cep.replace(/\D/g, '').padStart(8, '0').slice(0, 8))
      : null;
    const hasStreet = row.address && row.address.trim().length > 2;

    let result: GeocodeResult | null = null;

    // 1. Constrói query otimizada no formato hierárquico
    const primaryQuery = buildGoogleGeocodingQuery({
      address: row.address,
      number: row.number,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      cep: cleanCep ?? undefined,
    });

    // 2. Google Geocoding API (Melhor precisão para Brasil)
    if (primaryQuery) {
      try {
        result = await GeocodingService.googleGeocode(primaryQuery);
      } catch (e) {
        if (e instanceof QuotaExceededError) {
          throw e; // Repassa para o fluxo de importação tratar o limite diário
        }
      }
    }

    // 3. Nominatim Estruturado (Fallback)
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

    return result;
  }

  /** Geocodifica uma query de texto livre (para barra de busca) */
  static async geocodeQuery(query: string): Promise<GeocodeResult | null> {
    // 1. Tenta Google Geocoding
    let result: GeocodeResult | null = null;
    try {
      result = await GeocodingService.googleGeocode(query);
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        console.warn('[GeocodingService] Quota exceeded on geocodeQuery');
      }
    }

    // 2. Tenta Nominatim
    if (!result) {
      result = await GeocodingService.nominatimQuery(
        encodeURIComponent(query + ', Brasil'),
        'nominatim',
      );
    }

    // 3. Fallback Photon
    if (!result) {
      result = await GeocodingService.photon(query);
    }

    return result;
  }

  /** Compatibilidade retroativa */
  static async geocode(
    address: string,
    city = 'Maricá',
    state = 'RJ',
  ): Promise<GeocodeResult | null> {
    return GeocodingService.geocodeDelivery({
      address,
      number: '',
      neighborhood: '',
      city,
      state,
      cep: '',
    });
  }

  static clearCache(): void {
    GeocodingService.memCache.clear();
  }
}
