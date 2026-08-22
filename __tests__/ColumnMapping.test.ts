jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  keepLocalCopy: jest.fn(),
  types: { xlsx: 'xlsx', xls: 'xls', csv: 'csv', plainText: 'plainText' },
}));

jest.mock('react-native-fs', () => ({
  readFile: jest.fn(),
}));

import { guessMapping, buildAddressQuery } from '../src/utils/columnMappingHeuristics';
import { ImportService } from '../src/services/import/ImportService';

describe('Dynamic Column Mapping & Heuristics', () => {
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

    it('detects single full-address column', () => {
      const headers = ['Nome', 'Endereço Completo', 'Observação'];

      const guessed = guessMapping(headers);

      expect(guessed.nameCol).toBe('Nome');
      expect(guessed.addressCols).toEqual(['Endereço Completo']);
      expect(guessed.notesCol).toBe('Observação');
    });

    it('detects ready coordinates (Latitude / Longitude)', () => {
      const headers = ['Destinatário', 'Endereço', 'Lat', 'Long'];

      const guessed = guessMapping(headers);

      expect(guessed.nameCol).toBe('Destinatário');
      expect(guessed.addressCols).toEqual(['Endereço']);
      expect(guessed.latitudeCol).toBe('Lat');
      expect(guessed.longitudeCol).toBe('Long');
    });

    it('falls back gracefully on unknown headers', () => {
      const headers = ['Campo_A', 'Campo_B', 'Campo_C'];

      const guessed = guessMapping(headers);

      expect(guessed.nameCol).toBe('Campo_A');
      expect(guessed.addressCols).toEqual(['Campo_B']);
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
        Vazio: '',
        Nulo: null,
      };

      const selected = ['Rua', 'Num', 'Vazio', 'Bairro', 'Cidade', 'Estado', 'CEP', 'Nulo'];
      const query = buildAddressQuery(row, selected);

      expect(query).toBe('Rua Álvares de Castro, 346, Centro, Maricá, RJ, 24900-880');
    });

    it('handles single column address', () => {
      const row = {
        'Endereço Completo': 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
      };

      const query = buildAddressQuery(row, ['Endereço Completo']);

      expect(query).toBe('Av. Paulista, 1000 - Bela Vista, São Paulo - SP');
    });

    it('returns empty string if no columns or row are provided', () => {
      expect(buildAddressQuery({}, [])).toBe('');
    });
  });

  describe('ImportService.applyMapping', () => {
    it('converts raw rows into DeliveryEntity objects with originalData', () => {
      const rawRows = [
        {
          Cliente: 'Maria Souza',
          Rua: 'Rua das Flores',
          Numero: '123',
          Bairro: 'Jardim',
          Cidade: 'Niterói',
          UF: 'RJ',
          CEP: '24000-000',
          Celular: '21999998888',
          Pedido: 'PED-1029',
          Obs: 'Portão azul',
        },
      ];

      const mapping = {
        nameCol: 'Cliente',
        addressCols: ['Rua', 'Numero', 'Bairro', 'Cidade', 'UF', 'CEP'],
        phoneCol: 'Celular',
        orderCodeCol: 'Pedido',
        notesCol: 'Obs',
      };

      const entities = ImportService.applyMapping(rawRows, mapping);

      expect(entities).toHaveLength(1);
      const first = entities[0];
      expect(first.name).toBe('Maria Souza');
      expect(first.address).toBe('Rua das Flores, 123, Jardim, Niterói, RJ, 24000-000');
      expect(first.phone).toBe('21999998888');
      expect(first.orderCode).toBe('PED-1029');
      expect(first.notes).toBe('Portão azul');
      expect(first.originalData).toBeDefined();

      const parsedOriginal = JSON.parse(first.originalData!);
      expect(parsedOriginal.Cliente).toBe('Maria Souza');
    });

    it('strictly excludes nameCol from address even if passed in addressCols', () => {
      const rawRows = [
        {
          Nome: 'Restaurante skinão',
          'Endereço Completo': 'Rua Álvares de Castro, 346, Centro, Maricá - RJ',
        },
      ];

      const mapping = {
        nameCol: 'Nome',
        addressCols: ['Nome', 'Endereço Completo'], // Simulando inclusão acidental de Nome
      };

      const entities = ImportService.applyMapping(rawRows, mapping);
      expect(entities[0].name).toBe('Restaurante skinão');
      // O endereço NÃO deve conter o nome "Restaurante skinão"
      expect(entities[0].address).toBe('Rua Álvares de Castro, 346, Centro, Maricá - RJ');
      expect(entities[0].address).not.toContain('Restaurante skinão');
    });

    it('extracts direct coordinates if mapped and valid', () => {
      const rawRows = [
        {
          Local: 'Galpão Central',
          End: 'Rodovia Amaral Peixoto',
          Lat: '-22.9194',
          Lng: '-42.8186',
        },
      ];

      const mapping = {
        nameCol: 'Local',
        addressCols: ['End'],
        latitudeCol: 'Lat',
        longitudeCol: 'Lng',
      };

      const entities = ImportService.applyMapping(rawRows, mapping);

      expect(entities).toHaveLength(1);
      const first = entities[0];
      expect(first.latitude).toBeCloseTo(-22.9194);
      expect(first.longitude).toBeCloseTo(-42.8186);
      expect(first.geocodingStatus).toBe('success');
      expect(first.geocodingSource).toBe('spreadsheet');
    });

    it('normalizeRows automatically detects coordinates with comma or dot format', () => {
      const rawRows = [
        {
          Cliente: 'Depósito Maricá',
          'Endereço': 'Rua Ribeiro de Almeida',
          'Latitude': '-22,919400',
          'Longitude': '-42,818600',
        },
      ];

      const normalized = ImportService.normalizeRows(rawRows);
      expect(normalized).toHaveLength(1);
      expect(normalized[0].latitude).toBeCloseTo(-22.9194);
      expect(normalized[0].longitude).toBeCloseTo(-42.8186);
      expect(normalized[0].geocodingStatus).toBe('success');
      expect(normalized[0].geocodingSource).toBe('spreadsheet');
    });
  });
});
