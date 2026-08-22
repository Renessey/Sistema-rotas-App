import {
  sanitizeAddress,
  buildGoogleGeocodingQuery,
} from '../src/utils/addressParser';
import {
  GoogleQuotaManager,
  QuotaExceededError,
  DAILY_LIMIT,
  GEOCODE_DAILY_COUNTER_KEY,
} from '../src/services/geocoding/GoogleQuotaManager';
import { GeocodingService } from '../src/services/geocoding/GeocodingService';
import {
  GOOGLE_MAPS_API_KEY,
  getGoogleMapsApiKey,
} from '../src/config/env';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock @env
jest.mock(
  '@env',
  () => ({
    GOOGLE_MAPS_API_KEY: 'AIzaSyDYYj6kpDrz91b-T_s9Jv83JM6ANBZnx4M',
  }),
  { virtual: true },
);

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
    __getStore: () => store,
  };
});

// Mock DatabaseService
jest.mock('../src/storage/DatabaseService', () => ({
  DatabaseService: {
    getGeocodingCache: jest.fn(() => null),
    saveGeocodingCache: jest.fn(),
  },
}));

describe('Google Geocoding API & Rate Limit with .env Config', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    GeocodingService.clearCache();
  });

  describe('Environment Configuration (.env)', () => {
    it('loads API key correctly from .env', () => {
      expect(GOOGLE_MAPS_API_KEY).toBeTruthy();
      expect(GOOGLE_MAPS_API_KEY).toBe('AIzaSyDYYj6kpDrz91b-T_s9Jv83JM6ANBZnx4M');
      expect(getGoogleMapsApiKey()).toBe('AIzaSyDYYj6kpDrz91b-T_s9Jv83JM6ANBZnx4M');
    });
  });

  describe('Address Sanitization and Query Building', () => {
    it('sanitizes commercial/trade prefixes and noise from address', () => {
      const input = 'Padaria Estrela - R. Dom Pedro II';
      const clean = sanitizeAddress(input);
      expect(clean).toBe('Rua Dom Pedro II');
    });

    it('removes commercial establishment prefixes at start of string', () => {
      const input = 'Comércio Silva - Av. Brasil';
      const clean = sanitizeAddress(input);
      expect(clean).toBe('Avenida Brasil');
    });

    it('expands abbreviations and strips complement noise', () => {
      const input = 'R. das Flores, 123, Apto 402 Bloco B';
      const clean = sanitizeAddress(input);
      expect(clean).toBe('Rua das Flores, 123');
    });

    it('builds hierarchical query: ${rua}, ${numero} - ${bairro}, ${cidade} - ${uf}, ${cep}', () => {
      const query = buildGoogleGeocodingQuery({
        address: 'Padaria Modelo - R. Ribeiro de Almeida',
        number: '250',
        neighborhood: 'Centro',
        city: 'Maricá',
        state: 'RJ',
        cep: '24900-000',
      });

      expect(query).toBe('Rua Ribeiro de Almeida, 250 - Centro, Maricá - RJ, 24900-000');
    });

    it('handles addresses without number (e.g. S/N)', () => {
      const query = buildGoogleGeocodingQuery({
        address: 'Av. Roberto Silveira',
        number: 'S/N',
        neighborhood: 'Flamengo',
        city: 'Maricá',
        state: 'RJ',
        cep: '24900100',
      });

      expect(query).toBe('Avenida Roberto Silveira - Flamengo, Maricá - RJ, 24900-100');
    });
  });

  describe('GoogleQuotaManager', () => {
    it('initializes with count 0 on a new day', async () => {
      const usage = await GoogleQuotaManager.getUsage();
      expect(usage.count).toBe(0);
      expect(usage.limit).toBe(300);
      expect(usage.remaining).toBe(300);
      expect(usage.hasQuota).toBe(true);
    });

    it('increments count properly in AsyncStorage', async () => {
      const res1 = await GoogleQuotaManager.increment();
      expect(res1.count).toBe(1);
      expect(res1.remaining).toBe(299);

      const res2 = await GoogleQuotaManager.increment();
      expect(res2.count).toBe(2);
      expect(res2.remaining).toBe(298);

      const usage = await GoogleQuotaManager.getUsage();
      expect(usage.count).toBe(2);
      expect(usage.remaining).toBe(298);
    });

    it('resets counter when date changes', async () => {
      // Simula gravação de ontem com 150 consultas
      await AsyncStorage.setItem(
        GEOCODE_DAILY_COUNTER_KEY,
        JSON.stringify({ date: '2020-01-01', count: 150 }),
      );

      const usage = await GoogleQuotaManager.getUsage();
      expect(usage.count).toBe(0);
      expect(usage.remaining).toBe(300);
    });

    it('throws QuotaExceededError when reaching the limit of 300', async () => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await AsyncStorage.setItem(
        GEOCODE_DAILY_COUNTER_KEY,
        JSON.stringify({ date: today, count: 300 }),
      );

      expect(await GoogleQuotaManager.hasQuotaAvailable()).toBe(false);

      await expect(GoogleQuotaManager.increment()).rejects.toThrow(QuotaExceededError);
    });
  });

  describe('GeocodingService with Google API via .env', () => {
    it('uses Google API key loaded from .env and parses OK response', async () => {
      const mockGoogleResponse = {
        status: 'OK',
        results: [
          {
            formatted_address: 'Rua Ribeiro de Almeida, 250 - Centro, Maricá - RJ, 24900-000, Brasil',
            geometry: {
              location: {
                lat: -22.9194,
                lng: -42.8186,
              },
              location_type: 'ROOFTOP',
            },
            types: ['street_address'],
            place_id: 'ChIJ12345',
          },
        ],
      };

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockGoogleResponse,
      } as Response);

      const result = await GeocodingService.googleGeocode(
        'Rua Ribeiro de Almeida, 250 - Centro, Maricá - RJ, 24900-000',
      );

      expect(result).not.toBeNull();
      expect(result?.latitude).toBe(-22.9194);
      expect(result?.longitude).toBe(-42.8186);
      expect(result?.confidence).toBe('high');
      expect(result?.provider).toBe('google');
      expect(result?.formattedAddress).toContain('Rua Ribeiro de Almeida');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`key=${GOOGLE_MAPS_API_KEY}`),
        expect.any(Object),
      );
    });

    it('returns null on ZERO_RESULTS without throwing', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
      } as Response);

      const result = await GeocodingService.googleGeocode('Endereço Inexistente 999999');
      expect(result).toBeNull();
    });

    it('throws QuotaExceededError when Google returns OVER_QUERY_LIMIT', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'OVER_QUERY_LIMIT' }),
      } as Response);

      await expect(GeocodingService.googleGeocode('Rua Teste, 100')).rejects.toThrow(
        QuotaExceededError,
      );
    });
  });
});
