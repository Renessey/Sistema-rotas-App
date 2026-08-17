import type { DeliveryEntity } from '../../types/geo';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * GeocodingService — converts textual addresses to coordinates.
 *
 * Strategy (Phase 11):
 * 1. Prioritize coordinates already present in the spreadsheet.
 * 2. Geocode addresses without coordinates.
 * 3. Store the result with a confidence level.
 * 4. Optimization never starts while any address lacks a valid location.
 *
 * NOTE: Valhalla is the ROUTING engine and is NOT used as the primary geocoder.
 * This service uses an online geocoder (Nominatim) and caches results.
 */
export class GeocodingService {
  private static cache = new Map<string, GeocodeResult>();

  /** Returns the stored coordinates, prioritizing spreadsheet values */
  static resolveFromRow(row: Omit<DeliveryEntity, 'id'>): GeocodeResult | null {
    if (
      row.latitude !== null &&
      row.longitude !== null &&
      row.latitude !== undefined &&
      row.longitude !== undefined
    ) {
      return {
        latitude: row.latitude,
        longitude: row.longitude,
        confidence: 'high',
      };
    }
    return null;
  }

  /** Geocodes an address string, with caching */
  static async geocode(
    address: string,
    city = 'Maricá',
    state = 'RJ',
  ): Promise<GeocodeResult | null> {
    const cacheKey = `${address}|${city}|${state}`.toLowerCase();
    if (GeocodingService.cache.has(cacheKey)) {
      return GeocodingService.cache.get(cacheKey)!;
    }

    try {
      const query = encodeURIComponent(`${address}, ${city}, ${state}, Brazil`);
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/1.0' },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as Array<{
        lat: string;
        lon: string;
        type?: string;
      }>;

      if (!data.length) return null;

      const result: GeocodeResult = {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        confidence: data[0].type === 'house_number' ? 'high' : 'medium',
      };

      GeocodingService.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.warn('[GeocodingService] geocode failed', error);
      return null;
    }
  }

  static clearCache(): void {
    GeocodingService.cache.clear();
  }
}
