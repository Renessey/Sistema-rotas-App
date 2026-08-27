import { RoutingService } from '../src/services/routing/RoutingService';
import { RouteOptimizationService } from '../src/services/routing/RouteOptimizationService';
import type { LngLat } from '../src/types/geo';

describe('RoutingService — Mapbox Directions v5 (100% Mapbox)', () => {
  const maricaCenter: LngLat = [-42.8188, -22.9192];
  const niteroiCenter: LngLat = [-43.1189, -22.8832];
  const saoGoncaloCenter: LngLat = [-43.0534, -22.8268];

  describe('Metadados do Motor de Roteamento', () => {
    it('retorna metadados do RoutingService', () => {
      const meta = RoutingService.getRegionMetadata();
      expect(meta.regionId).toBeDefined();
      expect(meta.municipalities.length).toBeGreaterThan(0);
    });
  });

  describe('Cálculo de Rota via Mapbox Directions API', () => {
    it('calcula rota entre Maricá e Niterói', async () => {
      const result = await RoutingService.route([maricaCenter, niteroiCenter]);

      expect(result).toBeDefined();
      expect(result.distance).toBeGreaterThan(15000); // > 15 km
      expect(result.duration).toBeGreaterThan(600);   // > 10 min
      expect(result.geojson.type).toBe('FeatureCollection');
      expect(result.geojson.features.length).toBeGreaterThan(0);

      const feature = result.geojson.features[0];
      expect(feature.geometry.type).toBe('LineString');
      expect(feature.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    });

    it('calcula matriz de distâncias e tempos', async () => {
      const origins: LngLat[] = [maricaCenter, niteroiCenter];
      const destinations: LngLat[] = [saoGoncaloCenter, maricaCenter];

      const matrix = await RoutingService.matrix(origins, destinations);
      expect(matrix.durations.length).toBe(2);
      expect(matrix.durations[0].length).toBe(2);
      expect(matrix.distances.length).toBe(2);
      expect(matrix.distances[0].length).toBe(2);
    });
  });

  describe('Otimização de Paradas (RouteOptimizationService)', () => {
    it('otimiza a ordem de visitação das paradas', async () => {
      const depot: LngLat = maricaCenter;
      const stops: LngLat[] = [
        [-42.825, -22.92],
        niteroiCenter,
        saoGoncaloCenter,
        [-42.81, -22.91],
      ];

      const opt = await RouteOptimizationService.optimize(depot, stops);
      expect(opt.order).toHaveLength(stops.length);
      expect(new Set(opt.order).size).toBe(stops.length);
      expect(opt.totalCost).toBeGreaterThan(0);
    });
  });
});
