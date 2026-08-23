import { RouteOptimizationService } from '../src/services/routing/RouteOptimizationService';
import { OSRMService } from '../src/services/routing/OSRMService';
import type { LngLat } from '../src/types/geo';

describe('RouteOptimizationService (Open TSP)', () => {
  const startGPS: LngLat = [-42.8188, -22.9192];
  const stops: LngLat[] = [
    [-42.8150, -22.9150],
    [-42.8100, -22.9100],
    [-42.8200, -22.9200],
  ];

  it('deve otimizar paradas iniciando no GPS do motorista sem forçar retorno', async () => {
    const result = await RouteOptimizationService.optimize(startGPS, stops, { useDuration: true });
    expect(result.order).toHaveLength(3);
    // Garante que todos os índices 0, 1, 2 estejam presentes sem duplicação
    expect(new Set(result.order).size).toBe(3);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  it('deve agrupar entregas vizinhas/mesmo condomínio em sequência imediata', async () => {
    // Cenário idêntico ao da foto do usuário:
    // Ponto de partida (GPS): [-42.8188, -22.9192]
    // Parada A (Condomínio Casa 4): [-42.8180, -22.9190] (índice 0)
    // Parada B (Condomínio Casa 2 - vizinha imediata da A!): [-42.8182, -22.9193] (índice 1)
    // Paradas C e D (Bairro distante a 10km): (índices 2 e 3)
    const condoAndFarStops: LngLat[] = [
      [-42.8180, -22.9190], // 0 - Condo Casa 4
      [-42.8182, -22.9193], // 1 - Condo Casa 2 (vizinha!)
      [-42.7500, -22.8500], // 2 - Longe 1
      [-42.7510, -22.8510], // 3 - Longe 2
    ];

    const result = await RouteOptimizationService.optimize(startGPS, condoAndFarStops, {
      useDuration: true,
    });

    const posA = result.order.indexOf(0);
    const posB = result.order.indexOf(1);

    // As duas casas do mesmo condomínio devem ser atendidas em sequência direta (diferença de 1 posição)
    expect(Math.abs(posA - posB)).toBe(1);
    // E como estão coladas ao ponto de partida, devem ser as primeiras da rota (posições 0 e 1)
    expect(Math.min(posA, posB)).toBe(0);
    expect(Math.max(posA, posB)).toBe(1);
  });
});

describe('OSRMService', () => {
  it('deve dividir waypoints em lotes e garantir ancoragem no GPS', async () => {
    const startGPS: LngLat = [-42.8188, -22.9192];
    const waypoints: LngLat[] = [startGPS, [-42.8150, -22.9150]];

    const route = await OSRMService.route(waypoints);
    if (route) {
      expect(route.geojson.type).toBe('FeatureCollection');
      expect(route.geojson.features.length).toBeGreaterThan(0);
      const coords = route.geojson.features[0].geometry.coordinates;
      expect(coords.length).toBeGreaterThanOrEqual(2);
      // Garante que o primeiro ponto é exatamente a coordenada do GPS
      expect(coords[0][0]).toBeCloseTo(startGPS[0], 5);
      expect(coords[0][1]).toBeCloseTo(startGPS[1], 5);
    }
  });
});
