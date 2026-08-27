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

import { guessMapping, buildAddressQuery } from '../src/utils/columnMappingHeuristics';
import { ImportService } from '../src/services/import/ImportService';

describe('Dynamic Column Mapping & Heuristics (Offline Pattern)', () => {
  describe('guessMapping heuristics', () => {
    it('detects standard Brazilian delivery headers correctly', () => {
      const headers = [
        'Cliente / Nome',
        'Logradouro',
        'Número',
        'Bairro',
        'Cidade',
        'UF',
        'CEP',
        'Telefone',
        'Código Pedido',
      ];

      const guessed = guessMapping(headers);

      expect(guessed.nameCol).toBe('Cliente / Nome');
      expect(guessed.addressCols).toEqual([
        'Logradouro',
        'Número',
        'Bairro',
        'Cidade',
        'UF',
        'CEP',
      ]);
      expect(guessed.phoneCol).toBe('Telefone');
      expect(guessed.orderCodeCol).toBe('Código Pedido');
      expect(guessed.latitudeCol).toBeUndefined();
      expect(guessed.longitudeCol).toBeUndefined();
    });

    it('detects ready coordinates (Latitude / Longitude)', () => {
      const headers = ['Destinatário', 'Endereço', 'Lat', 'Long'];

      const guessed = guessMapping(headers);

      expect(guessed.nameCol).toBe('Destinatário');
      expect(guessed.addressCols).toEqual(['Endereço']);
      expect(guessed.latitudeCol).toBe('Lat');
      expect(guessed.longitudeCol).toBe('Long');
    });
  });

  describe('buildAddressQuery', () => {
    it('concatenates selected non-empty columns with commas', () => {
      const row = {
        Rua: 'Rua Álvares de Castro',
        Num: '346',
        Bairro: 'Centro',
        Cidade: 'Maricá',
        Estado: 'RJ',
        CEP: '24900-880',
      };

      const selected = ['Rua', 'Num', 'Bairro', 'Cidade', 'Estado', 'CEP'];
      const query = buildAddressQuery(row, selected);

      expect(query).toBe('Rua Álvares de Castro, 346, Centro, Maricá, RJ, 24900-880');
    });
  });

  describe('ImportService.applyMapping & normalizeRows (100% Offline with Exact Precision)', () => {
    it('converts raw rows into DeliveryEntity objects with originalData and report', () => {
      const rawRows = [
        {
          Destination: 'Maria Souza',
          Bairro: 'Jardim',
          City: 'Niterói',
          ZipCode: '24000-000',
          Latitude: '-22.88321456',
          Longitude: '-43.11894567',
          Celular: '21999998888',
          Pedido: 'PED-1029',
          Obs: 'Portão azul',
        },
      ];

      const mapping = {
        destinationCol: 'Destination',
        bairroCol: 'Bairro',
        cityCol: 'City',
        zipCodeCol: 'ZipCode',
        latitudeCol: 'Latitude',
        longitudeCol: 'Longitude',
        phoneCol: 'Celular',
        pedidoCol: 'Pedido',
        notesCol: 'Obs',
      };

      const result = ImportService.applyMapping(rawRows, mapping);

      expect(result.deliveries).toHaveLength(1);
      expect(result.report.validCoordsCount).toBe(1);
      expect(result.report.invalidCoordsCount).toBe(0);

      const first = result.deliveries[0];
      expect(first.destination).toBe('Maria Souza');
      expect(first.bairro).toBe('Jardim');
      expect(first.city).toBe('Niterói');
      expect(first.zipCode).toBe('24000-000');
      expect(first.latitude).toBe(-22.88321456);
      expect(first.longitude).toBe(-43.11894567);
      expect(first.rawLatitude).toBe('-22.88321456');
      expect(first.rawLongitude).toBe('-43.11894567');
      expect(first.telefone).toBe('21999998888');
      expect(first.pedido).toBe('PED-1029');
      expect(first.notes).toBe('Portão azul');
      expect(first.originalData).toBeDefined();
    });

    it('normalizeRows automatically detects coordinates with comma decimal and high precision', () => {
      const rawRows = [
        {
          Destination: 'Depósito Maricá',
          Bairro: 'Centro',
          City: 'Maricá',
          ZipCode: '24900-000',
          Latitude: '-22,91941234',
          Longitude: '-42,81861234',
        },
      ];

      const { deliveries, report } = ImportService.normalizeRows(rawRows);
      expect(deliveries).toHaveLength(1);
      expect(report.validCoordsCount).toBe(1);
      expect(deliveries[0].destination).toBe('Depósito Maricá');
      expect(deliveries[0].bairro).toBe('Centro');
      expect(deliveries[0].city).toBe('Maricá');
      expect(deliveries[0].zipCode).toBe('24900-000');
      expect(deliveries[0].latitude).toBe(-22.91941234);
      expect(deliveries[0].longitude).toBe(-42.81861234);
      expect(deliveries[0].rawLatitude).toBe('-22,91941234');
      expect(deliveries[0].rawLongitude).toBe('-42,81861234');
      expect(deliveries[0].status).toBe('pending');
    });
  });
});
