import type {
  Costing,
  GeoJSONFeatureCollection,
  LngLat,
  MatrixResult,
  RouteResult,
  SnappedPoint,
  SnapOptions,
} from '../../types/geo';
import { MapboxService } from './MapboxService';
import { haversine } from '../../utils/geo';

const SPEED_CONFIG: Record<Costing, number> = {
  auto: 11.11,       // ~40 km/h
  motorcycle: 13.33, // ~48 km/h
  truck: 8.88,       // ~32 km/h
  bicycle: 5.0,      // ~18 km/h
  pedestrian: 1.4,   // ~5 km/h
  bus: 8.33,         // ~30 km/h
};

/**
 * RoutingService — Motor de Roteamento EXCLUSIVO Mapbox (Directions API v5, Matrix API & Map Matching).
 *
 * Garante que 100% das rotas, matrizes de otimização e alinhamentos viários utilizem unicamente o Mapbox.
 */
export class RoutingService {
  private static forceOffline = false;

  static setForceOffline(offline: boolean) {
    RoutingService.forceOffline = offline;
  }

  static isForcedOffline(): boolean {
    return RoutingService.forceOffline;
  }

  /**
   * Calcula rota completa entre todos os waypoints via Mapbox Directions API v5 (ou motor local se offline).
   * waypoints[0] DEVE ser a posição GPS atual do usuário para ancoragem first-mile.
   */
  static async route(
    waypoints: LngLat[],
    options: { costing?: Costing; heading?: number | null; useTraffic?: boolean } = {},
  ): Promise<RouteResult> {
    if (waypoints.length < 2) {
      throw new Error('[RoutingService] Ao menos 2 pontos são necessários.');
    }

    const costing = options.costing ?? 'auto';

    // 1. Se NÃO estiver em modo offline forçado, tenta Mapbox Directions API v5
    if (!RoutingService.forceOffline && MapboxService.isConfigured()) {
      try {
        const mapboxResult = await MapboxService.route(waypoints, {
          costing,
          heading: options.heading,
          useTraffic: options.useTraffic,
        });
        if (
          mapboxResult &&
          mapboxResult.geojson.features[0]?.geometry.coordinates.length >= 2
        ) {
          console.log('[RoutingService] Rota calculada com sucesso via Mapbox Directions v5 ✓');
          return mapboxResult;
        }
      } catch (e) {
        console.warn('[RoutingService] Mapbox Directions falhou:', e);
      }
    }

    // 2. Fallback de segurança local em caso de falta de conexão com internet
    console.warn('[RoutingService] Sem conexão Mapbox, gerando traçado local de segurança.');
    return RoutingService.calculateLocalRoute(waypoints, costing);
  }

  /**
   * Alinha um ponto de entrega/GPS ao eixo da via mais próxima exclusivamente via Mapbox Map Matching.
   */
  static async snapPoint(
    point: LngLat,
    options: SnapOptions & { costing?: Costing } = {},
  ): Promise<SnappedPoint> {
    if (MapboxService.isConfigured()) {
      try {
        const snapped = await MapboxService.snap(point, options);
        if (snapped && snapped.snapped) {
          return snapped;
        }
      } catch (e) {
        console.warn('[RoutingService] Mapbox snapPoint falhou:', e);
      }
    }

    return {
      original: point,
      snapped: point,
      distanceToRoad: 0,
      matched: false,
    };
  }

  /**
   * Alinha múltiplos pontos de entrega ao eixo da via mais próxima exclusivamente via Mapbox Map Matching em lote.
   */
  static async snapBatch(
    points: LngLat[],
    options: SnapOptions & { costing?: Costing } = {},
  ): Promise<SnappedPoint[]> {
    if (points.length === 0) return [];

    if (MapboxService.isConfigured()) {
      try {
        const batchResults = await MapboxService.snapBatch(points, options);
        if (
          batchResults &&
          batchResults.length === points.length &&
          batchResults.some((r) => r && r.matched)
        ) {
          return batchResults.map(
            (r, i) =>
              r ?? {
                original: points[i],
                snapped: points[i],
                distanceToRoad: 0,
                matched: false,
              },
          );
        }
      } catch (e) {
        console.warn('[RoutingService] Mapbox snapBatch falhou:', e);
      }
    }

    return points.map((p) => ({
      original: p,
      snapped: p,
      distanceToRoad: 0,
      matched: false,
    }));
  }

  /**
   * Calcula matriz de distâncias e durações para otimização de paradas (TSP) exclusivamente via Mapbox Matrix API.
   */
  static async matrix(
    origins: LngLat[],
    destinations: LngLat[],
    options: { costing?: Costing } = {},
  ): Promise<MatrixResult> {
    const costing = options.costing ?? 'auto';

    if (!RoutingService.forceOffline && MapboxService.isConfigured() && origins.length + destinations.length <= 25) {
      try {
        const mapboxMatrix = await MapboxService.matrix(origins, destinations, { costing });
        if (mapboxMatrix) {
          console.log('[RoutingService] Matriz calculada com sucesso via Mapbox Matrix API ✓');
          return mapboxMatrix;
        }
      } catch (e) {
        console.warn('[RoutingService] Mapbox Matrix falhou:', e);
      }
    }

    // Fallback matemático haversine local se offline
    const speed = SPEED_CONFIG[costing] ?? SPEED_CONFIG.auto;
    const durations: number[][] = [];
    const distances: number[][] = [];

    for (const orig of origins) {
      const distRow: number[] = [];
      const durRow: number[] = [];
      for (const dest of destinations) {
        if (orig[0] === dest[0] && orig[1] === dest[1]) {
          distRow.push(0);
          durRow.push(0);
        } else {
          const d = haversine(orig, dest);
          const roadDist = Math.round(d * 1.25);
          distRow.push(roadDist);
          durRow.push(Math.round(roadDist / speed));
        }
      }
      distances.push(distRow);
      durations.push(durRow);
    }

    return { durations, distances, fromRoadNetwork: false };
  }

  private static calculateLocalRoute(waypoints: LngLat[], costing: Costing): RouteResult {
    const speed = SPEED_CONFIG[costing] ?? SPEED_CONFIG.auto;
    const pathCoordinates: LngLat[] = [];
    let totalDistance = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const segmentDist = haversine(from, to);
      totalDistance += segmentDist;

      if (i === 0) pathCoordinates.push(from);
      const steps = Math.min(Math.max(Math.floor(segmentDist / 400), 1), 10);
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        pathCoordinates.push([from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]);
      }
    }

    const duration = Math.round(totalDistance / speed);
    const geojson: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { distance: totalDistance, duration, provider: 'local_fallback' },
          geometry: { type: 'LineString', coordinates: pathCoordinates },
        },
      ],
    };

    return { geojson, distance: Math.round(totalDistance), duration, fromRoadNetwork: false };
  }

  // ─── Métodos de compatibilidade (mantidos para Diagnostics / UI) ───────────

  static isNativeAvailable(): boolean {
    return false;
  }

  static async tilesReady(): Promise<{ installed: boolean; region?: string }> {
    return { installed: false };
  }

  static getRegionMetadata() {
    return {
      regionId: 'mapbox-directions-v5',
      municipalities: ['Online via Mapbox Directions API v5'],
      bounds: { west: -180, south: -90, east: 180, north: 90 },
      center: [-42.98, -22.85] as LngLat,
      version: '5.0.0',
    };
  }
}
