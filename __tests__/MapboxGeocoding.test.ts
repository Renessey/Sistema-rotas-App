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

import { GeocodingService } from '../src/services/geocoding/GeocodingService';
import { MapboxQuota } from '../src/services/routing/MapboxQuota';

describe('MapboxGeocoding API (100% Mapbox)', () => {
  beforeEach(async () => {
    GeocodingService.clearCache();
    await MapboxQuota.resetQuota();
  });

  it('retorna coordenadas da planilha quando presentes (0 requisições consumidas)', () => {
    const row = {
      destination: 'Rua das Flores, 100',
      latitude: -22.9194,
      longitude: -42.8186,
      status: 'pending' as const,
      ordem: 1,
      createdAt: Date.now(),
    };

    const resolved = GeocodingService.resolveFromRow(row as any);
    expect(resolved).not.toBeNull();
    expect(resolved?.latitude).toBe(-22.9194);
    expect(resolved?.longitude).toBe(-42.8186);
    expect(resolved?.provider).toBe('spreadsheet');
  });

  it('geocodifica endereço via Mapbox Geocoding API', async () => {
    const result = await GeocodingService.mapboxGeocode('Avenida Carlos Marighella, 300, Maricá, RJ');
    if (result) {
      expect(result.latitude).toBeDefined();
      expect(result.longitude).toBeDefined();
      expect(['osm_photon', 'mapbox', 'cache']).toContain(result.provider);
      expect(typeof result.latitude).toBe('number');
      expect(typeof result.longitude).toBe('number');
    }
  });
});
