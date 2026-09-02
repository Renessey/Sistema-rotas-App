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
import { OfflineRoutingEngine } from './OfflineRoutingEngine';
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
 * RoutingService — Motor de Roteamento Híbrido (Online Mapbox Directions v5 + Offline OSM Nativo).
 *
 * Garante que quando offline (ou sem internet), as rotas sigam exatamente as ruas do mapa OSM.
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
   * Calcula rota completa entre todos os waypoints via Mapbox Directions API v5 ou Motor Offline OSM.
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

    // 2. Motor de Roteamento Offline Nativo baseado no Grafo Viário OSM
    if (OfflineRoutingEngine.isAvailable()) {
      try {
        console.log('[RoutingService] Calculando rota curva a curva via Motor Offline OSM 🛣️');
        const offlineResult = await OfflineRoutingEngine.route(waypoints, { costing });
        if (
          offlineResult &&
          offlineResult.geojson.features[0]?.geometry.coordinates.length >= 2
        ) {
          console.log(
            `[RoutingService] Rota offline calculada com sucesso ✓ (${offlineResult.distance}m, ${offlineResult.geojson.features[0].geometry.coordinates.length} nós viários)`,
          );
          return offlineResult;
        }
      } catch (offErr) {
        console.warn('[RoutingService] Motor offline falhou, usando contingência:', offErr);
      }
    }

    // 3. Fallback de contingência matemática caso o grafo não esteja carregado
    console.warn('[RoutingService] Gerando traçado local de segurança.');
    return RoutingService.calculateLocalRoute(waypoints, costing);
  }

  /**
   * Alinha um ponto de entrega/GPS ao eixo da via mais próxima (Mapbox ou Motor Offline).
   */
  static async snapPoint(
    point: LngLat,
    options: SnapOptions & { costing?: Costing } = {},
  ): Promise<SnappedPoint> {
    if (!RoutingService.forceOffline && MapboxService.isConfigured()) {
      try {
        const snapped = await MapboxService.snap(point, options);
        if (snapped && snapped.snapped) {
          return snapped;
        }
      } catch (e) {
        console.warn('[RoutingService] Mapbox snapPoint falhou:', e);
      }
    }

    // Snap viário offline via grid do grafo OSM
    if (OfflineRoutingEngine.isAvailable()) {
      try {
        return OfflineRoutingEngine.locate(point, options);
      } catch {
        // ignore
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
   * Alinha múltiplos pontos de entrega ao eixo da via mais próxima.
   */
  static async snapBatch(
    points: LngLat[],
    options: SnapOptions & { costing?: Costing } = {},
  ): Promise<SnappedPoint[]> {
    if (points.length === 0) return [];

    if (!RoutingService.forceOffline && MapboxService.isConfigured()) {
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

    // Snap viário em lote offline
    if (OfflineRoutingEngine.isAvailable()) {
      return points.map((p) => OfflineRoutingEngine.locate(p, options));
    }

    return points.map((p) => ({
      original: p,
      snapped: p,
      distanceToRoad: 0,
      matched: false,
    }));
  }

  /**
   * Calcula matriz de distâncias e durações para otimização de paradas (TSP).
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

    // Matriz viária calculada pelo grafo OSM Offline
    if (OfflineRoutingEngine.isAvailable()) {
      try {
        const offMatrix = await OfflineRoutingEngine.matrix(origins, destinations, { costing });
        console.log('[RoutingService] Matriz viária calculada com sucesso via Grafo Offline OSM ✓');
        return offMatrix;
      } catch (mErr) {
        console.warn('[RoutingService] Matriz offline falhou, usando aproximação:', mErr);
      }
    }

    // Fallback matemático haversine local se sem grafo
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

  // ─── Métodos de status e metadados ──────────────────────────────────────────

  static isNativeAvailable(): boolean {
    return OfflineRoutingEngine.isAvailable();
  }

  static async tilesReady(): Promise<{ installed: boolean; region?: string }> {
    const avail = OfflineRoutingEngine.isAvailable();
    return {
      installed: avail,
      region: avail ? OfflineRoutingEngine.getRegionMetadata().region : undefined,
    };
  }

  static getRegionMetadata() {
    if (OfflineRoutingEngine.isAvailable()) {
      const meta = OfflineRoutingEngine.getRegionMetadata();
      return {
        regionId: 'osm-pbf-offline-graph',
        municipalities: [meta.region],
        bounds: {
          west: meta.bounds[0],
          south: meta.bounds[1],
          east: meta.bounds[2],
          north: meta.bounds[3],
        },
        center: [
          (meta.bounds[0] + meta.bounds[2]) / 2,
          (meta.bounds[1] + meta.bounds[3]) / 2,
        ] as LngLat,
        version: meta.version,
      };
    }

    return {
      regionId: 'mapbox-directions-v5',
      municipalities: ['Online via Mapbox Directions API v5'],
      bounds: { west: -180, south: -90, east: 180, north: 90 },
      center: [-42.98, -22.85] as LngLat,
      version: '5.0.0',
    };
  }
}

