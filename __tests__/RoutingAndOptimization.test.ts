import { RouteOptimizationService } from '../src/services/routing/RouteOptimizationService';
import { MapboxService } from '../src/services/routing/MapboxService';
import type { LngLat } from '../src/types/geo';

describe('RouteOptimizationService (Open TSP via Mapbox)', () => {
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
