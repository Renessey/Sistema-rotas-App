import { NativeModules } from 'react-native';
import type {
  GeoJSONFeatureCollection,
  LngLat,
  MatrixResult,
  RouteResult,
  SnappedPoint,
  SnapOptions,
  Costing,
} from '../../types/geo';
import { haversine, estimateDurationMeters, decodePolyline } from '../../utils/geo';
import { OSRMService } from './OSRMService';

interface ValhallaNative {
  isAvailable(): Promise<boolean>;
  tilesReady(): Promise<{ installed: boolean; region?: string; version?: string }>;
  route(
    waypointsJson: string,
    optionsJson: string,
  ): Promise<{ geojson: string; distance: number; duration: number }>;
  matrix(originsJson: string, destinationsJson: string): Promise<{ durations: number[][]; distances: number[][] }>;
  locate(lat: number, lon: number, radius: number, bearing: number | null): Promise<string>;
  optimizedRoute(
    waypointsJson: string,
    optionsJson: string,
  ): Promise<{ geojson: string; distance: number; duration: number; order: number[] }>;
}

interface ValhallaHttpOptions {
  costing?: Costing;
}

/**
 * ValhallaService — Phase 5.
 *
 * React Native
 *      ↓
 * ValhallaService
 *      ↓
 * (1) Native Android Bridge (ValhallaNativeModule)  → embedded Valhalla + tiles OSM
 * (2) HTTP Valhalla server (serverBaseUrl)          → road network over the internet
 * (3) Straight-line fallback                        → only when offline & no engine
 *
 * MapLibre is NEVER the routing engine — it only renders the GeoJSON produced here.
 */
export class ValhallaService {
  private static native: ValhallaNative | null = (NativeModules as Record<string, unknown>)
    ?.ValhallaModule as ValhallaNative | null;

  /**
   * Remote Valhalla server used while the embedded engine is not linked.
   * Public demo server: https://valhalla1.openstreetmap.de
   * Set to '' to disable HTTP routing entirely.
   */
  static serverBaseUrl = 'https://valhalla1.openstreetmap.de';

  /** True when the embedded native Valhalla is available */
  static isNativeAvailable(): boolean {
    return !!ValhallaService.native;
  }

  /** Checks whether the native engine has tiles installed for the region */
  static async tilesReady(): Promise<{ installed: boolean; region?: string; version?: string }> {
    if (!ValhallaService.native) return { installed: false };
    try {
      return await ValhallaService.native.tilesReady();
    } catch {
      return { installed: false };
    }
  }

  /**
   * Computes a route between waypoints (Phase 16).
   * Returns GeoJSON ready to render on MapLibre.
   *
   * Priority: embedded native Valhalla → HTTP Valhalla → straight-line fallback.
   */
  static async route(
    waypoints: LngLat[],
    options: ValhallaHttpOptions = {},
  ): Promise<RouteResult> {
    if (waypoints.length < 2) {
      throw new Error('[Valhalla] at least 2 waypoints are required');
    }

    // 1) Embedded native Valhalla (offline engine + OSM tiles)
    if (ValhallaService.native) {
      try {
        const result = await ValhallaService.native.route(
          JSON.stringify(waypoints),
          JSON.stringify({ costing: options.costing ?? 'auto' }),
        );
        return {
          geojson: JSON.parse(result.geojson) as GeoJSONFeatureCollection,
          distance: result.distance,
          duration: result.duration,
          fromRoadNetwork: true,
        };
      } catch (error) {
        console.warn('[Valhalla] native route failed, trying HTTP', error);
      }
    }

    // 2) HTTP Valhalla server (real road network, requires internet)
    if (ValhallaService.serverBaseUrl) {
      try {
        const result = await ValhallaService.httpRoute(waypoints, options);
        if (result) return result;
      } catch (error) {
        console.warn('[Valhalla] HTTP route failed, trying OSRM', error);
      }
    }

    // 3) OSRM fallback (public demo, real road network)
    try {
      const osrmResult = await OSRMService.route(waypoints);
      if (osrmResult) return osrmResult;
    } catch (error) {
      console.warn('[Valhalla] OSRM route failed, using straight-line', error);
    }

    // 4) Straight-line fallback (no road data available)
    return ValhallaService.straightRoute(waypoints);
  }

  /**
   * Computes the time/distance matrix (Phase 14) using the real road network.
   */
  static async matrix(origins: LngLat[], destinations: LngLat[]): Promise<MatrixResult> {
    // 1) Embedded native Valhalla
    if (ValhallaService.native) {
      try {
        const result = await ValhallaService.native.matrix(
          JSON.stringify(origins),
          JSON.stringify(destinations),
        );
        return {
          durations: result.durations,
          distances: result.distances,
          fromRoadNetwork: true,
        };
      } catch (error) {
        console.warn('[Valhalla] native matrix failed, trying HTTP', error);
      }
    }

    // 2) HTTP Valhalla server
    if (ValhallaService.serverBaseUrl) {
      try {
        const result = await ValhallaService.httpMatrix(origins, destinations);
        if (result) return result;
      } catch (error) {
        console.warn('[Valhalla] HTTP matrix failed, trying OSRM', error);
      }
    }

    // 3) OSRM matrix fallback
    try {
      const osrmResult = await OSRMService.matrix(origins, destinations);
      if (osrmResult) return osrmResult;
    } catch (error) {
      console.warn('[Valhalla] OSRM matrix failed, using haversine', error);
    }

    // 4) Haversine fallback
    const durations: number[][] = [];
    const distances: number[][] = [];
    for (const origin of origins) {
      const dRow: number[] = [];
      const mRow: number[] = [];
      for (const dest of destinations) {
        const d = haversine(origin, dest);
        mRow.push(Math.round(d));
        dRow.push(Math.round(estimateDurationMeters(d)));
      }
      durations.push(dRow);
      distances.push(mRow);
    }

    return { durations, distances, fromRoadNetwork: false };
  }

  /**
   * Snaps a coordinate onto the road network (Phase 6/7).
   * Keeps the original coordinate and returns the snapped one plus distance.
   */
  static async locate(point: LngLat, options: SnapOptions = {}): Promise<SnappedPoint> {
    // 1) Embedded native Valhalla
    if (ValhallaService.native) {
      try {
        const resultJson = await ValhallaService.native.locate(
          point[1],
          point[0],
          options.radius ?? 50,
          options.bearing ?? null,
        );
        const result = JSON.parse(resultJson) as {
          lat: number;
          lon: number;
          distance: number;
          wayId?: number;
        };
        return {
          original: point,
          snapped: [result.lon, result.lat],
          distanceToRoad: result.distance,
          matched: true,
          wayId: result.wayId,
        };
      } catch (error) {
        console.warn('[Valhalla] native locate failed, trying HTTP', error);
      }
    }

    // 2) HTTP Valhalla /locate
    if (ValhallaService.serverBaseUrl) {
      try {
        const result = await ValhallaService.httpLocate(point, options);
        if (result) return result;
      } catch (error) {
        console.warn('[Valhalla] HTTP locate failed', error);
      }
    }

    // 3) Cannot snap without road data — return original
    return {
      original: point,
      snapped: point,
      distanceToRoad: null,
      matched: false,
      wayId: null,
    };
  }

  /**
   * Optimizes the stop order (Phase 15) and returns the final route.
   */
  static async optimizedRoute(
    start: LngLat,
    stops: LngLat[],
    options: { costing?: Costing; destination?: LngLat | null } = {},
  ): Promise<{ result: RouteResult; order: number[] }> {
    if (ValhallaService.native) {
      try {
        const nativeResult = await ValhallaService.native.optimizedRoute(
          JSON.stringify([start, ...stops]),
          JSON.stringify({ costing: options.costing ?? 'auto' }),
        );
        return {
          result: {
            geojson: JSON.parse(nativeResult.geojson) as GeoJSONFeatureCollection,
            distance: nativeResult.distance,
            duration: nativeResult.duration,
            fromRoadNetwork: true,
          },
          order: nativeResult.order,
        };
      } catch (error) {
        console.warn('[Valhalla] native optimizedRoute failed, using fallback', error);
      }
    }

    // Optimize locally (route/matrix use native/HTTP road network when available)
    const { RouteOptimizationService } = await import('./RouteOptimizationService');
    const optimization = await RouteOptimizationService.optimize(start, stops, {
      destination: options.destination ?? undefined,
    });
    const orderedWaypoints = [start, ...optimization.order.map((idx) => stops[idx])];
    if (options.destination) orderedWaypoints.push(options.destination);

    const result = await ValhallaService.route(orderedWaypoints, {
      costing: options.costing,
    });

    return { result, order: optimization.order };
  }

  /* ------------------------------ HTTP Valhalla ------------------------------ */

  private static async httpRoute(
    waypoints: LngLat[],
    options: ValhallaHttpOptions,
  ): Promise<RouteResult | null> {
    const body = {
      locations: waypoints.map(([lon, lat]) => ({ lon, lat })),
      costing: options.costing ?? 'auto',
      format: 'geojson',
    };

    const response = await fetch(`${ValhallaService.serverBaseUrl}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;

    const data = await response.json();

    // --- Response format A: GeoJSON (format: geojson) ---
    const asGeoJSON = data as GeoJSONFeatureCollection & {
      features?: Array<{
        properties?: { legs?: Array<{ summary?: { length?: number; time?: number } }> };
      }>;
    };
    if (Array.isArray(asGeoJSON.features) && asGeoJSON.features.length > 0) {
      const feature = asGeoJSON.features[0];
      let distance = 0;
      let duration = 0;
      if (feature.properties?.legs) {
        for (const leg of feature.properties.legs) {
          distance += (leg.summary?.length ?? 0) * 1000; // km → m
          duration += leg.summary?.time ?? 0;
        }
      }
      return {
        geojson: asGeoJSON as GeoJSONFeatureCollection,
        distance,
        duration,
        fromRoadNetwork: true,
      };
    }

    // --- Response format B: trip with encoded polyline (older/standard servers) ---
    const asTrip = data as {
      trip?: {
        legs?: Array<{
          shape?: string;
          summary?: { length?: number; time?: number };
        }>;
      };
    };
    if (asTrip.trip?.legs) {
      const coordinates: LngLat[] = [];
      let distance = 0;
      let duration = 0;

      asTrip.trip.legs.forEach((leg, index) => {
        const points = decodePolyline(leg.shape ?? '');
        // Skip the first point of subsequent legs (duplicate junction)
        const slice = index === 0 ? points : points.slice(1);
        coordinates.push(...slice);
        distance += (leg.summary?.length ?? 0) * 1000; // km → m
        duration += leg.summary?.time ?? 0;
      });

      if (coordinates.length < 2) return null;

      return {
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates },
            },
          ],
        },
        distance,
        duration,
        fromRoadNetwork: true,
      };
    }

    return null;
  }

  private static async httpMatrix(
    origins: LngLat[],
    destinations: LngLat[],
  ): Promise<MatrixResult | null> {
    const body = {
      sources: origins.map(([lon, lat]) => ({ lon, lat })),
      targets: destinations.map(([lon, lat]) => ({ lon, lat })),
      costing: 'auto',
    };

    const response = await fetch(`${ValhallaService.serverBaseUrl}/sources_to_targets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      sources_to_targets?: Array<
        Array<{
          time?: number;
          distance?: number;
          status?: number;
        }>
      >;
    };

    const rows = data.sources_to_targets ?? [];
    const durations: number[][] = [];
    const distances: number[][] = [];

    for (let i = 0; i < origins.length; i++) {
      const dRow: number[] = [];
      const mRow: number[] = [];
      for (let j = 0; j < destinations.length; j++) {
        const entry = rows[i]?.[j];
        if (entry && (entry.status === undefined || entry.status === 0)) {
          mRow.push(Math.round((entry.distance ?? 0) * 1000)); // km → m
          dRow.push(Math.round(entry.time ?? 0));
        } else {
          // Unreachable / not routed: fallback to haversine
          const d = haversine(origins[i], destinations[j]);
          mRow.push(Math.round(d));
          dRow.push(Math.round(estimateDurationMeters(d)));
        }
      }
      durations.push(dRow);
      distances.push(mRow);
    }

    return { durations, distances, fromRoadNetwork: true };
  }

  private static async httpLocate(
    point: LngLat,
    options: SnapOptions,
  ): Promise<SnappedPoint | null> {
    const body = {
      locations: [
        {
          lat: point[1],
          lon: point[0],
          radius: options.radius ?? 50,
          ...(options.bearing != null
            ? { bearing: options.bearing, bearing_tolerance: options.bearingTolerance ?? 30 }
            : {}),
        },
      ],
      costing: 'auto',
    };

    const response = await fetch(`${ValhallaService.serverBaseUrl}/locate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as Array<{
      input_lat?: number;
      input_lon?: number;
      edges?: Array<{
        way_id?: number;
        correlated_lat?: number;
        correlated_lon?: number;
      }>;
    }>;

    const first = data?.[0];
    const edge = first?.edges?.[0];
    if (!edge || edge.correlated_lat === undefined || edge.correlated_lon === undefined) {
      return null;
    }

    const snapped: LngLat = [edge.correlated_lon, edge.correlated_lat];
    const distanceToRoad = haversine(point, snapped);

    return {
      original: point,
      snapped,
      distanceToRoad,
      matched: true,
      wayId: edge.way_id ?? null,
    };
  }

  /* ------------------------------ Fallback ------------------------------ */

  private static straightRoute(waypoints: LngLat[]): RouteResult {
    const geojson: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: waypoints },
        },
      ],
    };

    let distance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      distance += haversine(waypoints[i], waypoints[i + 1]);
    }

    return {
      geojson,
      distance,
      duration: estimateDurationMeters(distance),
      fromRoadNetwork: false,
    };
  }
}
