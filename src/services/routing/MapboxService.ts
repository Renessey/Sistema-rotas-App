import type {
  Costing,
  GeoJSONFeatureCollection,
  LngLat,
  MatrixResult,
  RouteResult,
  SnappedPoint,
  SnapOptions,
} from '../../types/geo';
import { MAPBOX_ACCESS_TOKEN } from '../../config/env';
import { MapboxQuota } from './MapboxQuota';
import { RouteCache } from './RouteCache';

const MAX_WAYPOINTS_PER_MAPBOX_CALL = 25;

const PROFILE_MAP: Record<Costing, string> = {
  auto: 'mapbox/driving-traffic',
  motorcycle: 'mapbox/driving',
  truck: 'mapbox/driving',
  bus: 'mapbox/driving',
  bicycle: 'mapbox/cycling',
  pedestrian: 'mapbox/walking',
};

/**
 * MapboxService — Integração Oficial com o Mapbox Directions API v5, Matrix API e Map Matching.
 * Documentação: https://docs.mapbox.com/api/navigation/directions/
 */
export class MapboxService {
  private static getAccessToken(): string {
    const rawToken = MAPBOX_ACCESS_TOKEN || '';
    return rawToken.trim();
  }

  static isConfigured(): boolean {
    const token = this.getAccessToken();
    return Boolean(token && token.startsWith('pk.') && token.length > 20);
  }

  /**
   * Calcula a rota curva a curva de alta resolução viária via Mapbox Directions API v5.
   * Utiliza geometries=geojson e overview=full para máxima precisão viária (sem cortes de quarteirões).
   */
  static async route(
    waypoints: LngLat[],
    options: { costing?: Costing; heading?: number | null; useTraffic?: boolean } = {},
  ): Promise<RouteResult | null> {
    if (waypoints.length < 2) return null;
    const token = this.getAccessToken();
    if (!token) return null;

    const costing = options.costing ?? 'auto';
    let profile = PROFILE_MAP[costing] ?? 'mapbox/driving-traffic';
    if (options.useTraffic === false && profile === 'mapbox/driving-traffic') {
      profile = 'mapbox/driving';
    }

    // 1. Verifica cache local de rotas antes de consumir a cota da API
    const cached = RouteCache.get(waypoints, profile);
    if (cached) {
      console.log('[MapboxService] Rota recuperada do cache local (0 reqs consumidas) ✓');
      return cached;
    }

    // 2. Verifica limite de cota diária (3000 req/dia)
    const canRequest = await MapboxQuota.canMakeRequest();
    if (!canRequest) {
      console.warn(
        '[MapboxService] Limite diário de 3.000 requisições atingido. Redirecionando para contingência.',
      );
      return null;
    }

    console.log(
      '[MapboxService] route() chamado com',
      waypoints.length,
      'waypoints | perfil:',
      profile,
      '| partida GPS:',
      waypoints[0],
    );

    try {
      const allCoordinates: LngLat[] = [];
      let totalDistanceMeters = 0;
      let totalDurationSeconds = 0;

      const chunkSize = MAX_WAYPOINTS_PER_MAPBOX_CALL;

      for (let i = 0; i < waypoints.length - 1; i += chunkSize - 1) {
        const chunk = waypoints.slice(i, Math.min(i + chunkSize, waypoints.length));
        if (chunk.length < 2) break;

        if (i > 0) {
          // Pequena pausa entre lotes se necessário
          await new Promise<void>((resolve) => setTimeout(resolve, 150));
        }

        const coordsParam = chunk
          .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
          .join(';');

        // Configuração de bearing (vetor de direção do veículo) no primeiro lote
        let bearingsParam = '';
        if (i === 0 && options.heading !== null && options.heading !== undefined && options.heading >= 0) {
          const headingDeg = Math.round(options.heading);
          bearingsParam = `&bearings=${headingDeg},45` + ';'.repeat(chunk.length - 1);
        }

        const url = `https://api.mapbox.com/directions/v5/${profile}/${coordsParam}?geometries=geojson&overview=full&steps=false&access_token=${token}${bearingsParam}`;

        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.warn('[MapboxService] HTTP error', res.status, errText);
          return null;
        }

        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
          console.warn('[MapboxService] Nenhuma rota retornada pelo Mapbox:', data.code, data.message);
          return null;
        }

        // Registra uso na cota diária persistente
        await MapboxQuota.recordRequest(1);

        const primaryRoute = data.routes[0];
        totalDistanceMeters += primaryRoute.distance ?? 0;
        totalDurationSeconds += primaryRoute.duration ?? 0;

        const coords = primaryRoute.geometry?.coordinates as LngLat[];
        if (coords && coords.length > 0) {
          if (allCoordinates.length > 0) {
            allCoordinates.push(...coords.slice(1));
          } else {
            allCoordinates.push(...coords);
          }
        }
      }

      if (allCoordinates.length < 2) {
        return null;
      }

      // First-Mile Ancoragem: Conecta com precisão o ponto GPS de partida
      const startGps = waypoints[0];
      if (allCoordinates[0][0] !== startGps[0] || allCoordinates[0][1] !== startGps[1]) {
        allCoordinates.unshift(startGps);
      }

      // Last-Mile Ancoragem: Conecta perfeitamente a última entrega
      const lastStop = waypoints[waypoints.length - 1];
      const lastCoord = allCoordinates[allCoordinates.length - 1];
      if (lastCoord[0] !== lastStop[0] || lastCoord[1] !== lastStop[1]) {
        allCoordinates.push(lastStop);
      }

      const geojson: GeoJSONFeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              distance: Math.round(totalDistanceMeters),
              duration: Math.round(totalDurationSeconds),
              provider: 'mapbox',
            },
            geometry: {
              type: 'LineString',
              coordinates: allCoordinates,
            },
          },
        ],
      };

      const result: RouteResult = {
        geojson,
        distance: Math.round(totalDistanceMeters),
        duration: Math.round(totalDurationSeconds),
        fromRoadNetwork: true,
      };

      // Armazena no cache local
      RouteCache.set(waypoints, profile, result);

      return result;
    } catch (e) {
      console.warn('[MapboxService] Erro ao calcular rota:', e);
      return null;
    }
  }

  /**
   * Calcula matriz de distâncias e durações para otimização de paradas (TSP).
   * Documentação: https://docs.mapbox.com/api/navigation/matrix/
   */
  static async matrix(
    origins: LngLat[],
    destinations: LngLat[],
    options: { costing?: Costing } = {},
  ): Promise<MatrixResult | null> {
    if (origins.length === 0 || destinations.length === 0) return null;
    const token = this.getAccessToken();
    if (!token) return null;

    const canRequest = await MapboxQuota.canMakeRequest();
    if (!canRequest) return null;

    const allLocations = [...origins, ...destinations];
    if (allLocations.length > 25) {
      // Limite do endpoint gratuito por requisição única do Mapbox Matrix
      return null;
    }

    const costing = options.costing ?? 'auto';
    const profile = PROFILE_MAP[costing] ?? 'mapbox/driving';

    try {
      const coordsParam = allLocations
        .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
        .join(';');

      const sourcesParam = origins.map((_, i) => i).join(';');
      const destinationsParam = destinations.map((_, i) => origins.length + i).join(';');

      const url = `https://api.mapbox.com/directions-matrix/v1/${profile}/${coordsParam}?sources=${sourcesParam}&destinations=${destinationsParam}&annotations=duration,distance&access_token=${token}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data.code !== 'Ok' || !data.durations || !data.distances) return null;

      await MapboxQuota.recordRequest(1);

      return {
        durations: data.durations.map((row: (number | null)[]) =>
          row.map((val) => (val === null || val === undefined ? 999999 : Math.round(val))),
        ),
        distances: data.distances.map((row: (number | null)[]) =>
          row.map((val) => (val === null || val === undefined ? 999999 : Math.round(val))),
        ),
        fromRoadNetwork: true,
      };
    } catch {
      return null;
    }
  }

  /**
   * Snap to road: alinha coordenada ao eixo da via mais próxima utilizando Mapbox Map Matching.
   */
  static async snap(
    point: LngLat,
    options: SnapOptions & { costing?: Costing } = {},
  ): Promise<SnappedPoint | null> {
    const results = await this.snapBatch([point], options);
    return results[0] ?? null;
  }

  /**
   * Snap to road em lote: alinha múltiplos pontos ao eixo da via mais próxima via Mapbox Map Matching.
   * Documentação: https://docs.mapbox.com/api/navigation/map-matching/
   */
  static async snapBatch(
    points: LngLat[],
    options: SnapOptions & { costing?: Costing } = {},
  ): Promise<(SnappedPoint | null)[]> {
    if (points.length === 0) return [];
    const token = this.getAccessToken();
    if (!token) return points.map(() => null);

    const canRequest = await MapboxQuota.canMakeRequest();
    if (!canRequest) return points.map(() => null);

    const costing = options.costing ?? 'auto';
    const profile = PROFILE_MAP[costing] ?? 'mapbox/driving';
    const radius = options.radius ?? 50;

    const allResults: (SnappedPoint | null)[] = [];
    const batchSize = 25;

    for (let i = 0; i < points.length; i += batchSize) {
      const chunk = points.slice(i, i + batchSize);
      if (chunk.length < 2) {
        // Map matching precisa de ao menos 2 coordenadas; duplicamos com micro offset se for único
        const single = chunk[0];
        const dummy: LngLat = [single[0] + 0.00001, single[1] + 0.00001];
        const pair = [single, dummy];

        try {
          const coordsParam = pair
            .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
            .join(';');
          const radiusesParam = `${radius};${radius}`;
          const url = `https://api.mapbox.com/matching/v5/${profile}/${coordsParam}?radiuses=${radiusesParam}&geometries=geojson&access_token=${token}`;

          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) {
            allResults.push(null);
            continue;
          }

          const data = await res.json();
          if (data.code === 'Ok' && data.tracepoints && data.tracepoints[0]) {
            await MapboxQuota.recordRequest(1);
            const tp = data.tracepoints[0];
            const snappedCoords = tp.location as [number, number];
            allResults.push({
              original: single,
              snapped: snappedCoords,
              distanceToRoad: tp.distance ?? 0,
              matched: true,
            });
          } else {
            allResults.push({
              original: single,
              snapped: single,
              distanceToRoad: 0,
              matched: false,
            });
          }
        } catch {
          allResults.push(null);
        }
        continue;
      }

      try {
        const coordsParam = chunk
          .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
          .join(';');
        const radiusesParam = chunk.map(() => radius).join(';');
        const url = `https://api.mapbox.com/matching/v5/${profile}/${coordsParam}?radiuses=${radiusesParam}&geometries=geojson&access_token=${token}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
          allResults.push(...chunk.map(() => null));
          continue;
        }

        const data = await res.json();
        if (data.code !== 'Ok' || !data.tracepoints) {
          allResults.push(...chunk.map(() => null));
          continue;
        }

        await MapboxQuota.recordRequest(1);

        data.tracepoints.forEach((tp: any, idx: number) => {
          const orig = chunk[idx];
          if (tp && tp.location && Array.isArray(tp.location) && tp.location.length >= 2) {
            allResults.push({
              original: orig,
              snapped: [tp.location[0], tp.location[1]] as LngLat,
              distanceToRoad: tp.distance ?? 0,
              matched: true,
            });
          } else {
            allResults.push({
              original: orig,
              snapped: orig,
              distanceToRoad: 0,
              matched: false,
            });
          }
        });
      } catch (err) {
        console.warn('[MapboxService] snapBatch error:', err);
        allResults.push(...chunk.map(() => null));
      }
    }

    return allResults;
  }
}
