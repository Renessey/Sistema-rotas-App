jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  keepLocalCopy: jest.fn(),
  types: { xlsx: 'xlsx', xls: 'xls', csv: 'csv', plainText: 'plainText' },
}));

jest.mock('react-native-fs', () => ({
  readFile: jest.fn(),
}));

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    executeSync: jest.fn(() => ({ rows: [] })),
  })),
}));

import { ImportService } from '../src/services/import/ImportService';
import { RoutingService } from '../src/services/routing/RoutingService';
import type { DeliveryEntity, LngLat } from '../src/types/geo';

describe('ImportService - Geocoding & Snap v2 Pipeline', () => {
  it('alinha entregas com coordenadas existentes e geocodifica registros faltantes', async () => {
    const rawDeliveries: Omit<DeliveryEntity, 'id'>[] = [
      {
        destination: 'Rua Álvares de Castro, 346, Centro, Maricá, RJ',
        bairro: 'Centro',
        city: 'Maricá',
        zipCode: '24900-880',
        latitude: -22.9194,
        longitude: -42.8186,
        rawLatitude: '-22.9194',
        rawLongitude: '-42.8186',
        pedido: 'PED-01',
        telefone: '21999999999',
        status: 'pending',
        ordem: 1,
        distancia: null,
        tempoEstimado: null,
        createdAt: Date.now(),
      },
    ];

    let progressCount = 0;
    const result = await ImportService.geolocalizeAndSnapDeliveries(
      rawDeliveries,
      (progress) => {
        progressCount++;
        expect(progress.total).toBe(1);
      },
    );

    expect(progressCount).toBeGreaterThanOrEqual(1);
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0].latitude).toBe(-22.9194);
    expect(result.deliveries[0].longitude).toBe(-42.8186);
    expect(result.deliveries[0].snappedLatitude).toBeDefined();
    expect(result.deliveries[0].snappedLongitude).toBeDefined();
  });
});

describe('RoutingService - Snap v2 & Directions v2', () => {
  it('deve realizar snapPoint retornando coordenadas alinhadas', async () => {
    const pt: LngLat = [-42.8186, -22.9194];
    const snapped = await RoutingService.snapPoint(pt);

    expect(snapped).toBeDefined();
    expect(snapped.original).toEqual(pt);
    expect(snapped.snapped).toBeDefined();
    expect(snapped.snapped?.length).toBe(2);
  });

  it('deve realizar snapBatch para múltiplos pontos', async () => {
    const points: LngLat[] = [
      [-42.8186, -22.9194],
      [-42.8200, -22.9200],
    ];
    const batch = await RoutingService.snapBatch(points);

    expect(batch).toHaveLength(2);
    expect(batch[0].original).toEqual(points[0]);
    expect(batch[1].original).toEqual(points[1]);
  });

  it('deve traçar rota retornando GeoJSON FeatureCollection com LineString contínua', async () => {
    const waypoints: LngLat[] = [
      [-42.8188, -22.9192],
      [-42.8150, -22.9150],
      [-42.8100, -22.9100],
    ];

    const routeResult = await RoutingService.route(waypoints);

    expect(routeResult.distance).toBeGreaterThan(0);
    expect(routeResult.duration).toBeGreaterThan(0);
    expect(routeResult.geojson.type).toBe('FeatureCollection');
    expect(routeResult.geojson.features).toHaveLength(1);
    expect(routeResult.geojson.features[0].geometry.type).toBe('LineString');
    expect(routeResult.geojson.features[0].geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    // Linha azul: coordenadas no formato [lng, lat]
    const coords = routeResult.geojson.features[0].geometry.coordinates;
    expect(typeof coords[0][0]).toBe('number');
    expect(typeof coords[0][1]).toBe('number');
  });
});
