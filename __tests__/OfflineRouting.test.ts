import { ValhallaService } from '../src/services/routing/ValhallaService';
import { RouteOptimizationService } from '../src/services/routing/RouteOptimizationService';
import type { LngLat } from '../src/types/geo';

describe('OfflineRouting & Valhalla Engine (Maricá, Niterói, São Gonçalo)', () => {
  // Pontos de teste
  const maricaCenter: LngLat = [-42.8188, -22.9192];
  const niteroiCenter: LngLat = [-43.1189, -22.8832];
  const saoGoncaloCenter: LngLat = [-43.0534, -22.8268];
  const itaboraiOutside: LngLat = [-42.0, -21.0];

  describe('Metadados e Bounding Box da Região', () => {
    it('retorna os metadados oficiais para Maricá, Niterói e São Gonçalo', () => {
      const meta = ValhallaService.getRegionMetadata();
      expect(meta.regionId).toBe('marica-niteroi-sao-goncalo');
      expect(meta.municipalities).toContain('Maricá');
      expect(meta.municipalities).toContain('Niterói');
      expect(meta.municipalities).toContain('São Gonçalo');
      expect(meta.bounds.west).toBe(-43.3);
      expect(meta.bounds.south).toBe(-23.1);
      expect(meta.bounds.east).toBe(-42.7);
      expect(meta.bounds.north).toBe(-22.6);
    });

    it('identifica corretamente se as coordenadas estão dentro da região autorizada', () => {
      expect(ValhallaService.isInsideRegion(maricaCenter)).toBe(true);
      expect(ValhallaService.isInsideRegion(niteroiCenter)).toBe(true);
      expect(ValhallaService.isInsideRegion(saoGoncaloCenter)).toBe(true);
      expect(ValhallaService.isInsideRegion(itaboraiOutside)).toBe(false);
    });
  });

  describe('Cálculo de Rota 100% Offline', () => {
    it('calcula rota entre Maricá e Niterói sem dependência de internet', async () => {
      const result = await ValhallaService.route([maricaCenter, niteroiCenter]);

      expect(result).toBeDefined();
      expect(result.distance).toBeGreaterThan(15000); // > 15 km
      expect(result.duration).toBeGreaterThan(600); // > 10 min
      expect(result.geojson.type).toBe('FeatureCollection');
      expect(result.geojson.features.length).toBeGreaterThan(0);

      const feature = result.geojson.features[0];
      expect(feature.geometry.type).toBe('LineString');
      expect(feature.geometry.coordinates.length).toBeGreaterThanOrEqual(2);

      // Garante convenção GeoJSON [longitude, latitude] e início na malha viária
      const firstCoord = feature.geometry.coordinates[0];
      expect(firstCoord[0]).toBeCloseTo(maricaCenter[0], 2);
      expect(firstCoord[1]).toBeCloseTo(maricaCenter[1], 2);
    });

    it('calcula matriz de distâncias e tempos offline', async () => {
      const origins: LngLat[] = [maricaCenter, niteroiCenter];
      const destinations: LngLat[] = [saoGoncaloCenter, maricaCenter];

      const matrix = await ValhallaService.matrix(origins, destinations);
      expect(matrix.durations.length).toBe(2);
      expect(matrix.durations[0].length).toBe(2);
      expect(matrix.distances.length).toBe(2);
      expect(matrix.distances[0].length).toBe(2);

      // Distância de um ponto para si mesmo é 0
      expect(matrix.distances[0][1]).toBe(0);
    });
  });

  describe('Otimização Local de Paradas (RouteOptimizationService)', () => {
    it('otimiza a ordem de visitação das paradas preservando as coordenadas', async () => {
      const depot: LngLat = maricaCenter;
      const stops: LngLat[] = [
        [-42.825, -22.92],
        niteroiCenter,
        saoGoncaloCenter,
        [-42.81, -22.91],
      ];

      const opt = await RouteOptimizationService.optimize(depot, stops);
      expect(opt.order).toHaveLength(stops.length);
      expect(new Set(opt.order).size).toBe(stops.length); // todas as paradas visitadas sem duplicação
      expect(opt.totalCost).toBeGreaterThan(0);
    });
  });
});
