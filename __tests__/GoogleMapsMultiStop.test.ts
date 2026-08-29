import { NavigationLauncher } from '../src/services/navigation/NavigationLauncher';
import { Linking, Alert } from 'react-native';

jest.mock('react-native', () => ({
  Linking: {
    canOpenURL: jest.fn().mockResolvedValue(true),
    openURL: jest.fn().mockResolvedValue(true),
  },
  Alert: {
    alert: jest.fn(),
  },
  Platform: {
    OS: 'android',
  },
}));

describe('Google Maps Multi-Paradas (NavigationLauncher)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildGoogleMapsMultiStopUrl', () => {
    it('deve retornar null para lista vazia de paradas', () => {
      const url = NavigationLauncher.buildGoogleMapsMultiStopUrl([]);
      expect(url).toBeNull();
    });

    it('deve retornar null se as paradas não possuírem coordenadas válidas', () => {
      const invalidStops = [
        { latitude: NaN, longitude: NaN },
        { latitude: 0, longitude: 0 },
      ];
      const url = NavigationLauncher.buildGoogleMapsMultiStopUrl(invalidStops);
      expect(url).toBeNull();
    });

    it('deve gerar URL sem waypoints quando houver apenas 1 parada única', () => {
      const singleStop = [
        { latitude: -22.9194, longitude: -42.8186, address: 'Rua das Flores, 100' },
      ];

      const url = NavigationLauncher.buildGoogleMapsMultiStopUrl(singleStop);

      expect(url).not.toBeNull();
      expect(url).toContain('https://www.google.com/maps/dir/?api=1');
      expect(url).toContain('origin=My+Location');
      expect(url).toContain('destination=-22.9194,-42.8186');
      expect(url).toContain('travelmode=driving');
      expect(url).not.toContain('waypoints=');
    });

    it('deve utilizar coordenadas customizadas de GPS como origem quando fornecidas', () => {
      const singleStop = [
        { latitude: -22.9200, longitude: -42.8200 },
      ];
      const gpsOrigin: [number, number] = [-42.8150, -22.9100]; // [lon, lat]

      const url = NavigationLauncher.buildGoogleMapsMultiStopUrl(singleStop, gpsOrigin);

      expect(url).not.toBeNull();
      expect(url).toContain('origin=-22.91,-42.815');
      expect(url).toContain('destination=-22.92,-42.82');
    });

    it('deve gerar URL com waypoints intermediários unidos por pipe e devidamente encodados para múltiplas paradas', () => {
      const multipleStops = [
        { latitude: -22.9110, longitude: -42.8110 }, // Waypoint 1
        { latitude: -22.9120, longitude: -42.8120 }, // Waypoint 2
        { latitude: -22.9130, longitude: -42.8130 }, // Waypoint 3
        { latitude: -22.9990, longitude: -42.8990 }, // Destination final
      ];

      const url = NavigationLauncher.buildGoogleMapsMultiStopUrl(multipleStops);

      expect(url).not.toBeNull();
      expect(url).toContain('destination=-22.999,-42.899');

      // Waypoints esperados: "-22.911,-42.811|-22.912,-42.812|-22.913,-42.813"
      const expectedWaypoints = encodeURIComponent('-22.911,-42.811|-22.912,-42.812|-22.913,-42.813');
      expect(url).toContain(`waypoints=${expectedWaypoints}`);
      expect(url).toContain('travelmode=driving');
    });
  });

  describe('openGoogleMapsMultiStop', () => {
    it('deve exibir alerta amigável quando a lista estiver vazia', async () => {
      const result = await NavigationLauncher.openGoogleMapsMultiStop([]);

      expect(result).toBe(false);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Google Maps',
        'Nenhuma parada disponível para traçar a rota.',
      );
      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('deve abrir a URL no Linking quando a rota for válida', async () => {
      const stops = [
        { latitude: -22.9110, longitude: -42.8110 },
        { latitude: -22.9120, longitude: -42.8120 },
      ];

      const result = await NavigationLauncher.openGoogleMapsMultiStop(stops);

      expect(result).toBe(true);
      expect(Linking.openURL).toHaveBeenCalled();
      const calledUrl = (Linking.openURL as jest.Mock).mock.calls[0][0];
      expect(calledUrl).toContain('https://www.google.com/maps/dir/?api=1');
      expect(calledUrl).toContain('destination=-22.912,-42.812');
    });
  });
});
