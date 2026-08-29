import { DatabaseService } from '../src/storage/DatabaseService';
import { GeocodingService } from '../src/services/geocoding/GeocodingService';
import { haversine } from '../src/utils/geo';
import type { LngLat } from '../src/types/geo';

// Mock in-memory SQLite store
const mockStore = {
  deliveries: [] as any[],
  addressHistory: [] as any[],
  counter: 1,
  histCounter: 1,
};

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    executeSync: jest.fn((query: string, params: any[] = []) => {
      const q = query.trim().toUpperCase();

      if (q.startsWith('CREATE TABLE') || q.startsWith('ALTER TABLE')) {
        return { rows: [] };
      }

      if (q.startsWith('INSERT INTO DELIVERIES')) {
        const id = mockStore.counter++;
        const record = {
          id,
          listId: params[0],
          destination: params[1],
          bairro: params[2],
          city: params[3],
          zipCode: params[4],
          latitude: params[5],
          longitude: params[6],
          rawLatitude: params[7],
          rawLongitude: params[8],
          pedido: params[9],
          telefone: params[10],
          status: params[11],
          ordem: params[12],
        };
        mockStore.deliveries.push(record);
        return { insertId: id, rows: [] };
      }

      if (q.startsWith('UPDATE DELIVERIES SET') && q.includes('LATITUDE = ?')) {
        const lat = params[0];
        const lon = params[1];
        const id = params[params.length - 1];
        const found = mockStore.deliveries.find((d) => d.id === id);
        if (found) {
          found.latitude = lat;
          found.longitude = lon;
          found.status = 'pending';
        }
        return { rows: [] };
      }

      if (q.startsWith('SELECT RAWLATITUDE, RAWLONGITUDE, ORIGINALDATA FROM DELIVERIES WHERE ID = ?')) {
        const id = params[0];
        const found = mockStore.deliveries.find((d) => d.id === id);
        return { rows: found ? [found] : [] };
      }

      if (q.startsWith('SELECT * FROM DELIVERIES')) {
        return { rows: mockStore.deliveries };
      }

      // Address History Mocks
      if (q.startsWith('SELECT ID, USAGE_COUNT FROM ADDRESS_HISTORY WHERE NORMALIZED_ADDRESS = ?')) {
        const norm = params[0];
        const found = mockStore.addressHistory.filter((h) => h.normalized_address === norm);
        return { rows: found };
      }

      if (q.startsWith('INSERT INTO ADDRESS_HISTORY')) {
        const id = mockStore.histCounter++;
        const record = {
          id,
          normalized_address: params[0],
          raw_address: params[1],
          bairro: params[2],
          city: params[3],
          zip_code: params[4],
          latitude: params[5],
          longitude: params[6],
          source: params[7],
          usage_count: 1,
          created_at: params[8],
          updated_at: params[9],
        };
        mockStore.addressHistory.push(record);
        return { insertId: id, rows: [] };
      }

      if (q.startsWith('UPDATE ADDRESS_HISTORY SET')) {
        const norm = params[params.length - 1];
        const found = mockStore.addressHistory.find((h) => h.normalized_address === norm);
        if (found) {
          found.raw_address = params[0];
          found.bairro = params[1] ?? found.bairro;
          found.city = params[2] ?? found.city;
          found.zip_code = params[3] ?? found.zip_code;
          found.latitude = params[4];
          found.longitude = params[5];
          found.source = params[6];
          found.usage_count = params[7];
          found.updated_at = params[8];
        }
        return { rows: [] };
      }

      if (q.startsWith('DELETE FROM ADDRESS_HISTORY WHERE NORMALIZED_ADDRESS = ?')) {
        const norm = params[0];
        mockStore.addressHistory = mockStore.addressHistory.filter((h) => h.normalized_address !== norm);
        return { rows: [] };
      }

      if (q.startsWith('SELECT * FROM ADDRESS_HISTORY WHERE NORMALIZED_ADDRESS = ?')) {
        const norm = params[0];
        const found = mockStore.addressHistory.filter((h) => h.normalized_address === norm);
        return { rows: found };
      }

      if (q.startsWith('SELECT * FROM ADDRESS_HISTORY ORDER BY')) {
        return { rows: mockStore.addressHistory };
      }

      return { rows: [] };
    }),
  })),
}));

describe('Ajuste Manual e Comparação de Pinos (AdjustPin)', () => {
  beforeEach(() => {
    mockStore.deliveries = [];
    mockStore.addressHistory = [];
    mockStore.counter = 1;
    mockStore.histCounter = 1;
    jest.clearAllMocks();
  });

  it('deve calcular a divergência em metros usando a função Haversine', () => {
    const originalCoords: LngLat = [-42.8186, -22.9194];
    const newCoords: LngLat = [-42.8198, -22.9205];

    const distance = Math.round(haversine(originalCoords, newCoords));
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(300);
  });

  it('deve atualizar as coordenadas de uma entrega no SQLite via updateDeliveryCoords', () => {
    // Insere uma entrega com coordenada original
    const initialId = DatabaseService.insertDelivery({
      listId: 1,
      destination: 'Rua das Flores, 100',
      bairro: 'Centro',
      city: 'Maricá',
      zipCode: '24900-000',
      latitude: -22.9194,
      longitude: -42.8186,
      rawLatitude: '-22.9194',
      rawLongitude: '-42.8186',
      pedido: 'PED-123',
      telefone: '21999999999',
      status: 'pending',
      ordem: 1,
      distancia: null,
      tempoEstimado: null,
      createdAt: Date.now(),
    });

    const inserted = DatabaseService.getAllDeliveries(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].latitude).toBe(-22.9194);
    expect(inserted[0].longitude).toBe(-42.8186);

    // Ajusta o pino para a nova localização encontrada
    const newLat = -22.9215;
    const newLng = -42.8190;
    DatabaseService.updateDeliveryCoords(initialId, newLat, newLng);

    const updated = DatabaseService.getAllDeliveries(1);
    expect(updated[0].latitude).toBe(newLat);
    expect(updated[0].longitude).toBe(newLng);
    expect(updated[0].status).toBe('pending');
  });

  it('deve permitir retroceder/restaurar as coordenadas originais da planilha via restoreDeliveryOriginalCoords', () => {
    const origLat = -22.9194;
    const origLon = -42.8186;

    // Insere com as coordenadas originais da planilha
    const id = DatabaseService.insertDelivery({
      listId: 1,
      destination: 'Rua das Flores, 100',
      bairro: 'Centro',
      city: 'Maricá',
      zipCode: '24900-000',
      latitude: origLat,
      longitude: origLon,
      rawLatitude: String(origLat),
      rawLongitude: String(origLon),
      pedido: 'PED-123',
      telefone: '21999999999',
      status: 'pending',
      ordem: 1,
      distancia: null,
      tempoEstimado: null,
      createdAt: Date.now(),
    });

    // 1. O motorista ajusta o pino para um novo local
    const adjustedLat = -22.9550;
    const adjustedLon = -42.8550;
    DatabaseService.updateDeliveryCoords(id, adjustedLat, adjustedLon);

    let deliveries = DatabaseService.getAllDeliveries(1);
    expect(deliveries[0].latitude).toBe(adjustedLat);
    expect(deliveries[0].longitude).toBe(adjustedLon);

    // 2. O motorista clica em "Retroceder / Restaurar Planilha"
    const restored = DatabaseService.restoreDeliveryOriginalCoords(id);
    expect(restored).not.toBeNull();
    expect(restored?.latitude).toBe(origLat);
    expect(restored?.longitude).toBe(origLon);

    // 3. Verifica que no banco retornou para as coordenadas originais da planilha
    deliveries = DatabaseService.getAllDeliveries(1);
    expect(deliveries[0].latitude).toBe(origLat);
    expect(deliveries[0].longitude).toBe(origLon);
  });

  it('deve remover entrada do histórico de endereços ao retroceder/desfazer ajuste', () => {
    // Salva ajuste no histórico
    DatabaseService.saveAddressHistory({
      address: 'Rua das Palmeiras, 50',
      bairro: 'Flamengo',
      city: 'Maricá',
      latitude: -22.9250,
      longitude: -42.8250,
      source: 'manual',
    });

    expect(DatabaseService.findAddressHistory({ address: 'Rua das Palmeiras, 50, Flamengo, Maricá' })).not.toBeNull();

    // Remove do histórico ao retroceder
    DatabaseService.removeAddressHistory({
      address: 'Rua das Palmeiras, 50',
      bairro: 'Flamengo',
      city: 'Maricá',
    });

    expect(DatabaseService.findAddressHistory({ address: 'Rua das Palmeiras, 50, Flamengo, Maricá' })).toBeNull();
  });

  it('deve salvar e recuperar coordenadas no histórico permanente de endereços (address_history)', () => {
    // 1. Salva ajuste manual no histórico
    DatabaseService.saveAddressHistory({
      address: 'Rua Álvares de Castro, 346',
      bairro: 'Centro',
      city: 'Maricá',
      zipCode: '24900-880',
      latitude: -22.91985,
      longitude: -42.81895,
      source: 'manual',
    });

    // 2. Consulta o histórico usando o mesmo endereço (com pequenas variações de maiúsculas/espaços)
    const match = DatabaseService.findAddressHistory({
      address: 'RUA ALVARES DE CASTRO, 346',
      bairro: 'Centro',
      city: 'Maricá',
    });

    expect(match).not.toBeNull();
    expect(match?.latitude).toBe(-22.91985);
    expect(match?.longitude).toBe(-42.81895);
    expect(match?.source).toBe('manual');

    // 3. Atualiza o endereço como entrega concluída e verifica incremento de uso
    DatabaseService.saveAddressHistory({
      address: 'Rua Álvares de Castro, 346',
      bairro: 'Centro',
      city: 'Maricá',
      zipCode: '24900-880',
      latitude: -22.91985,
      longitude: -42.81895,
      source: 'completed',
    });

    const allHistory = DatabaseService.getAllAddressHistory();
    expect(allHistory).toHaveLength(1);
    expect(allHistory[0].usageCount).toBe(2);
    expect(allHistory[0].source).toBe('completed');
  });

  it('deve priorizar o histórico permanente em GeocodingService antes de chamar a API Mapbox', async () => {
    // Salva o endereço no histórico
    DatabaseService.saveAddressHistory({
      address: 'Avenida Beira Mar, 500',
      bairro: 'Itaipuaçu',
      city: 'Maricá',
      latitude: -22.9650,
      longitude: -42.9210,
      source: 'manual',
    });

    const spyMapbox = jest.spyOn(GeocodingService, 'mapboxGeocode');

    // Executa busca para o mesmo endereço
    const result = await GeocodingService.geocodeQuery('Avenida Beira Mar, 500, Itaipuaçu, Maricá');
    expect(result).not.toBeNull();
    expect(result?.latitude).toBe(-22.9650);
    expect(result?.longitude).toBe(-42.9210);
    expect(result?.provider).toBe('history_manual');

    // Garante que a API externa NÃO foi chamada, economizando cota e tempo
    expect(spyMapbox).not.toHaveBeenCalled();
  });
});
