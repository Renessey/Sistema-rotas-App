import {
  parseCoordinateValue,
  parseCoordinatePair,
  toGeoJsonCoordinates,
  normalizeColumnName,
  detectStandardColumns,
} from '../src/utils/coordinateParser';

describe('CoordinateParser (Phase 19 & Mathematical Validation)', () => {
  describe('Task 19.1 — Testar coordenada negativa', () => {
    it('preserva coordenadas negativas reais de Maricá/Niterói sem alteração', () => {
      const lat = -22.93584721;
      const lon = -42.81812345;
      const result = parseCoordinatePair(lat, lon);

      expect(result.isValid).toBe(true);
      expect(result.latitude).toBe(-22.93584721);
      expect(result.longitude).toBe(-42.81812345);
      expect(result.rawLatitude).toBe('-22.93584721');
      expect(result.rawLongitude).toBe('-42.81812345');
    });
  });

  describe('Task 19.2 — Testar alta precisão (6, 7, 8, 9 casas decimais)', () => {
    it('não arredonda nem trunca coordenadas com 6 a 9 casas decimais', () => {
      const highPrecisionLat = -22.935847219;
      const highPrecisionLon = -42.818123456;

      const parsedLat = parseCoordinateValue(highPrecisionLat, 'latitude');
      const parsedLon = parseCoordinateValue(highPrecisionLon, 'longitude');

      expect(parsedLat.isValid).toBe(true);
      expect(parsedLat.value).toBe(-22.935847219);
      expect(parsedLon.isValid).toBe(true);
      expect(parsedLon.value).toBe(-42.818123456);
    });
  });

  describe('Task 19.3 — Testar coordenadas como texto', () => {
    it('converte strings com ponto decimal corretamente', () => {
      const rawLat = '-22.93584721';
      const rawLon = '-42.81812345';
      const result = parseCoordinatePair(rawLat, rawLon);

      expect(result.isValid).toBe(true);
      expect(result.latitude).toBe(-22.93584721);
      expect(result.longitude).toBe(-42.81812345);
    });
  });

  describe('Task 19.4 — Testar vírgula decimal', () => {
    it('converte strings numéricas com vírgula decimal sem erro', () => {
      const rawLat = '-22,93584721';
      const rawLon = '-42,81812345';
      const result = parseCoordinatePair(rawLat, rawLon);

      expect(result.isValid).toBe(true);
      expect(result.latitude).toBe(-22.93584721);
      expect(result.longitude).toBe(-42.81812345);
    });
  });

  describe('Task 19.5 — Testar anti-inversão (latitude != longitude)', () => {
    it('mantém estritamente latitude como latitude e longitude como longitude', () => {
      const lat = -22.9192;
      const lon = -42.8188;
      const result = parseCoordinatePair(lat, lon);

      expect(result.latitude).toBe(-22.9192);
      expect(result.longitude).toBe(-42.8188);
      expect(result.latitude).not.toBe(result.longitude);
      expect(result.latitude).not.toBe(-42.8188);
      expect(result.longitude).not.toBe(-22.9192);
    });
  });

  describe('Task 19.6 — Testar GeoJSON [longitude, latitude]', () => {
    it('garante que a conversão GeoJSON coloca longitude na posição 0 e latitude na posição 1', () => {
      const lat = -22.9192;
      const lon = -42.8188;
      const geojsonCoords = toGeoJsonCoordinates(lat, lon);

      expect(geojsonCoords[0]).toBe(lon); // longitude primeiro no GeoJSON!
      expect(geojsonCoords[1]).toBe(lat); // latitude depois no GeoJSON!
    });
  });

  describe('Fase 7 — Validação Matemática e Detecção de Suspeitos', () => {
    it('rejeita latitude fora de [-90, 90]', () => {
      const invalidLat1 = parseCoordinateValue(95.123, 'latitude');
      const invalidLat2 = parseCoordinateValue(-90.0001, 'latitude');

      expect(invalidLat1.isValid).toBe(false);
      expect(invalidLat2.isValid).toBe(false);
    });

    it('rejeita longitude fora de [-180, 180]', () => {
      const invalidLon1 = parseCoordinateValue(185.123, 'longitude');
      const invalidLon2 = parseCoordinateValue(-180.0001, 'longitude');

      expect(invalidLon1.isValid).toBe(false);
      expect(invalidLon2.isValid).toBe(false);
    });

    it('rejeita valores nulos, vazios, NaN ou texto não numérico', () => {
      expect(parseCoordinateValue(null, 'latitude').isValid).toBe(false);
      expect(parseCoordinateValue('', 'latitude').isValid).toBe(false);
      expect(parseCoordinateValue('abc', 'latitude').isValid).toBe(false);
      expect(parseCoordinateValue(NaN, 'latitude').isValid).toBe(false);
      expect(parseCoordinateValue(Infinity, 'latitude').isValid).toBe(false);
    });

    it('marca (0, 0) como suspeito', () => {
      const result = parseCoordinatePair(0, 0);
      expect(result.isValid).toBe(true);
      expect(result.isSuspicious).toBe(true);
    });
  });

  describe('Fase 4 — Normalização de cabeçalhos de colunas', () => {
    it('normaliza variações de nomes de colunas', () => {
      expect(normalizeColumnName('LATITUDE')).toBe('latitude');
      expect(normalizeColumnName('Latitude')).toBe('latitude');
      expect(normalizeColumnName('  Longıtude ')).toBe('longitude');
      expect(normalizeColumnName('Código Postal')).toBe('codigopostal');
    });

    it('detecta colunas padrão a partir dos cabeçalhos', () => {
      const headers = [
        'Destination',
        'Bairro',
        'City',
        'Postal Code',
        'Latitude',
        'Longitude',
        'Pedido',
        'Telefone',
      ];
      const cols = detectStandardColumns(headers);

      expect(cols.destinationCol).toBe('Destination');
      expect(cols.bairroCol).toBe('Bairro');
      expect(cols.cityCol).toBe('City');
      expect(cols.zipCodeCol).toBe('Postal Code');
      expect(cols.latitudeCol).toBe('Latitude');
      expect(cols.longitudeCol).toBe('Longitude');
      expect(cols.pedidoCol).toBe('Pedido');
      expect(cols.phoneCol).toBe('Telefone');
    });
  });
});
