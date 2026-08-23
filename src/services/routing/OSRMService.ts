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
  private static MAX_CHUNK_SIZE = 70;

  /**
   * Calcula uma rota entre waypoints usando OSRM.
   * Divide em lotes seguros para suportar mais de 100 paradas sem estourar limites.
   * Retorna GeoJSON pronto para renderizar no MapLibre.
   */
  static async route(waypoints: LngLat[]): Promise<RouteResult | null> {
    if (waypoints.length < 2) return null;

    try {
      const allCoords: [number, number][] = [];
      let totalDistance = 0;
      let totalDuration = 0;

      const chunkSize = OSRMService.MAX_CHUNK_SIZE;
      for (let i = 0; i < waypoints.length - 1; i += (chunkSize - 1)) {
        const chunk = waypoints.slice(i, Math.min(i + chunkSize, waypoints.length));
        if (chunk.length < 2) break;

        // Se houver mais de 1 lote, aguarda 300ms para respeitar a taxa do servidor
        if (i > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 300));
        }

        const coords = chunk
          .map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
          .join(';');
        const url = `${OSRMService.baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;

        const res = await fetch(url, {
          headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
          signal: AbortSignal.timeout(12000),
        });

        if (!res.ok) return null;

        const data = (await res.json()) as {
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
        totalDistance += route.distance ?? 0;
        totalDuration += route.duration ?? 0;

        const segmentCoords = route.geometry?.coordinates ?? (chunk as [number, number][]);
        if (allCoords.length > 0) {
          allCoords.push(...segmentCoords.slice(1));
        } else {
          allCoords.push(...segmentCoords);
        }
      }

      if (allCoords.length < 2) return null;

      // Ancoragem: garante que a linha comece exatamente na coordenada do usuário
      const firstRaw = waypoints[0];
      const firstRoad = allCoords[0];
      if (firstRaw[0] !== firstRoad[0] || firstRaw[1] !== firstRoad[1]) {
        allCoords.unshift(firstRaw as [number, number]);
      }

      const geojson: GeoJSONFeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              distance: Math.round(totalDistance),
              duration: Math.round(totalDuration),
            },
            geometry: {
              type: 'LineString',
              coordinates: allCoords,
            },
          },
        ],
      };

      return {
        geojson,
        distance: totalDistance,
        duration: totalDuration,
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

    // Se a matriz for muito grande (> 70 nós), usa cálculo local rápido
    if (origins.length + destinations.length > 70) {
      return null;
    }

    try {
      const allPoints = [...origins, ...destinations];
      const coords = allPoints
        .map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
        .join(';');
      const srcIdxs = origins.map((_, i) => i).join(';');
      const dstIdxs = destinations.map((_, i) => origins.length + i).join(';');

      const url = `${OSRMService.baseUrl}/table/v1/driving/${coords}?sources=${srcIdxs}&destinations=${dstIdxs}&annotations=duration,distance`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'RoutesDeliveryApp/2.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as {
        code?: string;
        durations?: (number | null)[][];
        distances?: (number | null)[][];
      };

      if (data.code !== 'Ok') return null;

      // Replace nulls (unreachable) with haversine fallback
      const durations: number[][] = (data.durations ?? []).map((row, i) =>
        row.map((v, j) => {
          if (origins[i][0] === destinations[j][0] && origins[i][1] === destinations[j][1]) {
            return 0;
          }
          if (v !== null && v !== undefined) return Math.round(v);
          const d = haversine(origins[i], destinations[j]);
          return Math.round(estimateDurationMeters(d));
        }),
      );

      const distances: number[][] = (data.distances ?? []).map((row, i) =>
        row.map((v, j) => {
          if (origins[i][0] === destinations[j][0] && origins[i][1] === destinations[j][1]) {
            return 0;
          }
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
