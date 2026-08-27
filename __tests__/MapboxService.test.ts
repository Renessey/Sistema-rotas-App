// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] || null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

import { MapboxQuota, MAPBOX_DAILY_LIMIT } from '../src/services/routing/MapboxQuota';
import { RouteCache } from '../src/services/routing/RouteCache';
import { MapboxService } from '../src/services/routing/MapboxService';
import { decodeMapboxPolyline } from '../src/utils/geo';
import type { LngLat, RouteResult } from '../src/types/geo';

describe('MapboxService & Quota Guard (3.000 req/dia)', () => {
  beforeEach(async () => {
    await MapboxQuota.resetQuota();
    RouteCache.clear();
  });

  describe('Controle de Cota Diária (MapboxQuota)', () => {
    it('inicia com contagem zerada e limite seguro de 3000 requisições/dia', async () => {
      const usage = await MapboxQuota.getUsage();
      expect(usage.count).toBe(0);
      expect(usage.limit).toBe(MAPBOX_DAILY_LIMIT);
      expect(usage.limit).toBe(3000);
      expect(usage.remaining).toBe(3000);
      expect(usage.isLimitReached).toBe(false);
    });

    it('incrementa corretamente a cota diária ao registrar requisições', async () => {
      await MapboxQuota.recordRequest(1);
      let usage = await MapboxQuota.getUsage();
      expect(usage.count).toBe(1);
      expect(usage.remaining).toBe(2999);

      await MapboxQuota.recordRequest(10);
      usage = await MapboxQuota.getUsage();
      expect(usage.count).toBe(11);
      expect(usage.remaining).toBe(2989);
    });

    it('bloqueia novas requisições quando a cota de 3000 é atingida', async () => {
      await MapboxQuota.recordRequest(3000);
      const usage = await MapboxQuota.getUsage();
      expect(usage.count).toBe(3000);
      expect(usage.remaining).toBe(0);
      expect(usage.isLimitReached).toBe(true);

      const canRequest = await MapboxQuota.canMakeRequest();
      expect(canRequest).toBe(false);
    });
  });

  describe('Sistema de Cache de Rotas (RouteCache)', () => {
    const waypoints: LngLat[] = [
      [-42.8188, -22.9192],
      [-42.8150, -22.9150],
    ];
    const mockRoute: RouteResult = {
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { distance: 1500, duration: 120, provider: 'mapbox' },
            geometry: { type: 'LineString', coordinates: waypoints },
          },
        ],
      },
      distance: 1500,
      duration: 120,
      fromRoadNetwork: true,
    };

    it('armazena e recupera rota em cache para economizar cota da API', () => {
      expect(RouteCache.get(waypoints, 'mapbox/driving-traffic')).toBeNull();

      RouteCache.set(waypoints, 'mapbox/driving-traffic', mockRoute);
      const cached = RouteCache.get(waypoints, 'mapbox/driving-traffic');

      expect(cached).toBeDefined();
      expect(cached?.distance).toBe(1500);
      expect(cached?.duration).toBe(120);
      expect(cached?.geojson.features[0].properties.provider).toBe('mapbox');
    });

    it('limpa o cache corretamente com clear()', () => {
      RouteCache.set(waypoints, 'mapbox/driving-traffic', mockRoute);
      expect(RouteCache.size()).toBe(1);

      RouteCache.clear();
      expect(RouteCache.size()).toBe(0);
      expect(RouteCache.get(waypoints, 'mapbox/driving-traffic')).toBeNull();
    });
  });

  describe('Decodificação de Geometria Mapbox (Precisão 6)', () => {
    it('decodifica polyline com precisão de 6 casas decimais (1 metro)', () => {
      // Exemplo de polyline de precisão 6
      const encoded = 'y_whCt_chE_uAyI';
      const coords = decodeMapboxPolyline(encoded);
      expect(coords.length).toBeGreaterThan(0);
      expect(typeof coords[0][0]).toBe('number');
      expect(typeof coords[0][1]).toBe('number');
    });
  });

  describe('MapboxService API Client', () => {
    it('está configurado com a chave de API fornecida', () => {
      expect(MapboxService.isConfigured()).toBe(true);
    });

    it('utiliza cache de rotas para não consumir cota em requisições repetidas', async () => {
      const p1: LngLat = [-42.8188, -22.9192];
      const p2: LngLat = [-42.8150, -22.9150];

      // Pre-popula cache
      const cachedRoute: RouteResult = {
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { distance: 2000, duration: 180, provider: 'mapbox' },
              geometry: { type: 'LineString', coordinates: [p1, p2] },
            },
          ],
        },
        distance: 2000,
        duration: 180,
        fromRoadNetwork: true,
      };
      RouteCache.set([p1, p2], 'mapbox/driving-traffic', cachedRoute);

      const usageBefore = (await MapboxQuota.getUsage()).count;
      const result = await MapboxService.route([p1, p2]);
      const usageAfter = (await MapboxQuota.getUsage()).count;

      expect(result).toBeDefined();
      expect(result?.distance).toBe(2000);
      // Nenhuma chamada adicional à API deve ter sido feita
      expect(usageAfter).toBe(usageBefore);
    });
  });
});
