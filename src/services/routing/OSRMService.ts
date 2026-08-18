import type { LngLat, RouteResult, MatrixResult, GeoJSONFeatureCollection } from '../../types/geo';
import { haversine, estimateDurationMeters, decodePolyline } from '../../utils/geo';

/**
 * OSRMService — Fallback de roteirização usando o servidor público OSRM.
 *
 * Usado quando o Valhalla (nativo ou HTTP) não está disponível.
 * Demo API: https://router.project-osrm.org (OpenStreetMap)
 */
export class OSRMService {
  static baseUrl = 'https://router.project-osrm.org';

  /**
   * Calcula uma rota entre waypoints usando OSRM.
   * Retorna GeoJSON pronto para renderizar no MapLibre.
   */
  static async route(waypoints: LngLat[]): Promise<RouteResult | null> {
    if (waypoints.length < 2) return null;

    try {
      const coords = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';');
      const url = `${OSRMService.baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return null;

      const data = await res.json() as {
        code?: string;
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: {
            type: string;
            coordinates: [number, number][];
          };
        }>;
      };

      if (data.code !== 'Ok' || !data.routes?.length) return null;

      const route = data.routes[0];
      const geojson: GeoJSONFeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: route.geometry?.coordinates ?? (waypoints as [number, number][]),
            },
          },
        ],
      };

      return {
        geojson,
        distance: route.distance ?? 0,
        duration: route.duration ?? 0,
        fromRoadNetwork: true,
      };
    } catch (e) {
      console.warn('[OSRMService] route failed', e);
      return null;
    }
  }

  /**
   * Matriz de distâncias OSRM (para otimização de rotas).
   */
  static async matrix(origins: LngLat[], destinations: LngLat[]): Promise<MatrixResult | null> {
    if (origins.length === 0 || destinations.length === 0) return null;

    try {
      // OSRM table API works with a single coordinate list
      const allPoints = [...origins, ...destinations];
      const coords = allPoints.map(([lon, lat]) => `${lon},${lat}`).join(';');
      const srcIdxs = origins.map((_, i) => i).join(';');
      const dstIdxs = destinations.map((_, i) => origins.length + i).join(';');

      const url = `${OSRMService.baseUrl}/table/v1/driving/${coords}?sources=${srcIdxs}&destinations=${dstIdxs}&annotations=duration,distance`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return null;

      const data = await res.json() as {
        code?: string;
        durations?: (number | null)[][];
        distances?: (number | null)[][];
      };

      if (data.code !== 'Ok') return null;

      // Replace nulls (unreachable) with haversine fallback
      const durations: number[][] = (data.durations ?? []).map((row, i) =>
        row.map((v, j) => {
          if (v !== null && v !== undefined) return Math.round(v);
          const d = haversine(origins[i], destinations[j]);
          return Math.round(estimateDurationMeters(d));
        }),
      );

      const distances: number[][] = (data.distances ?? []).map((row, i) =>
        row.map((v, j) => {
          if (v !== null && v !== undefined) return Math.round(v);
          return Math.round(haversine(origins[i], destinations[j]));
        }),
      );

      return { durations, distances, fromRoadNetwork: true };
    } catch (e) {
      console.warn('[OSRMService] matrix failed', e);
      return null;
    }
  }
}
