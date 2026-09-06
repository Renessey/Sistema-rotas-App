import { DatabaseService } from '../src/storage/DatabaseService';
import type { DeliveredProofEntity } from '../src/types/geo';

// In-memory store para simular o banco op-sqlite nos testes
const inMemoryStore = {
  deliveries: [] as any[],
  delivered_proofs: [] as any[],
  delivery_lists: [] as any[],
  proofIdCounter: 1,
  deliveryIdCounter: 1,
  pageCount: 10,
  pageSize: 4096,
};

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    executeSync: jest.fn((query: string, params: any[] = []) => {
      const q = query.trim().toUpperCase();

      if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX') || q.startsWith('ALTER TABLE')) {
        return { rows: [] };
      }

      if (q.startsWith('PRAGMA PAGE_COUNT')) {
        return { rows: [{ page_count: inMemoryStore.pageCount }] };
      }

      if (q.startsWith('PRAGMA PAGE_SIZE')) {
        return { rows: [{ page_size: inMemoryStore.pageSize }] };
      }

      if (q.startsWith('INSERT INTO DELIVERED_PROOFS')) {
        const id = inMemoryStore.proofIdCounter++;
        const item = {
          id,
          deliveryId: params[0],
          listId: params[1],
          recipientName: params[2],
          address: params[3],
          normalizedAddress: params[4],
          bairro: params[5],
          city: params[6],
          zipCode: params[7],
          latitude: params[8],
          longitude: params[9],
          orderCode: params[10],
          phone: params[11],
          receiverPerson: params[12],
          photoUri: params[13],
          photoBase64: params[14],
          rgDocument: params[15],
          notes: params[16],
          originalData: params[17],
          deliveredAt: params[18],
          createdAt: params[19],
        };
        inMemoryStore.delivered_proofs.push(item);
        return { insertId: id, rows: [] };
      }

      if (q.startsWith('SELECT * FROM DELIVERED_PROOFS')) {
        if (q.includes('WHERE NORMALIZEDADDRESS = ?')) {
          const norm = params[0];
          const matches = inMemoryStore.delivered_proofs.filter(
            (p) => p.normalizedAddress === norm,
          );
          return { rows: matches };
        }

        if (q.includes('ABS(LATITUDE - ?)')) {
          const lat = params[0];
          const lng = params[1];
          const matches = inMemoryStore.delivered_proofs.filter(
            (p) =>
              p.latitude != null &&
              p.longitude != null &&
              Math.abs(p.latitude - lat) < 0.00035 &&
              Math.abs(p.longitude - lng) < 0.00035,
          );
          return { rows: matches };
        }

        if (q.includes('WHERE RECIPIENTNAME LIKE ?')) {
          const rawParam = params[0].replace(/%/g, '').toLowerCase();
          const matches = inMemoryStore.delivered_proofs.filter(
            (p) =>
              (p.recipientName && p.recipientName.toLowerCase().includes(rawParam)) ||
              (p.address && p.address.toLowerCase().includes(rawParam)) ||
              (p.orderCode && p.orderCode.toLowerCase().includes(rawParam)) ||
              (p.rgDocument && p.rgDocument.toLowerCase().includes(rawParam)) ||
              (p.notes && p.notes.toLowerCase().includes(rawParam)),
          );
          return { rows: matches };
        }

        return { rows: [...inMemoryStore.delivered_proofs] };
      }

      if (q.startsWith('DELETE FROM DELIVERED_PROOFS')) {
        if (q.includes('WHERE ID = ?')) {
          const id = params[0];
          inMemoryStore.delivered_proofs = inMemoryStore.delivered_proofs.filter(
            (p) => p.id !== id,
          );
        } else {
          inMemoryStore.delivered_proofs = [];
        }
        return { rows: [] };
      }

      if (q.startsWith('UPDATE DELIVERIES SET STATUS = ?')) {
        const status = params[0];
        const failReason = params[1];
        const id = params[params.length - 1];
        const d = inMemoryStore.deliveries.find((del) => del.id === id);
        if (d) {
          d.status = status;
          d.failReason = failReason;
        }
        return { rows: [] };
      }

      return { rows: [] };
    }),
  })),
}));

describe('DatabaseService - Comprovantes com Foto, Histórico e Rollover SQLite', () => {
  beforeEach(() => {
    inMemoryStore.deliveries = [
      { id: 1, destination: 'Rua das Flores 123', status: 'completed', failReason: null },
      { id: 2, destination: 'Av Central 456', status: 'failed', failReason: 'absent' },
    ];
    inMemoryStore.delivered_proofs = [];
    inMemoryStore.proofIdCounter = 1;
    inMemoryStore.pageCount = 10;
    inMemoryStore.pageSize = 4096;
  });

  test('Deve salvar comprovante de entrega com foto comprimida e dados da planilha', () => {
    const proofId = DatabaseService.saveDeliveredProof({
      deliveryId: 1,
      listId: 1,
      recipientName: 'Carlos Silva',
      address: 'Rua das Flores 123',
      normalizedAddress: 'rua das flores 123',
      bairro: 'Centro',
      city: 'Maricá',
      zipCode: '24900-000',
      latitude: -22.919,
      longitude: -42.818,
      orderCode: 'PED-999',
      phone: '2199999999',
      receiverPerson: 'Próprio',
      photoUri: 'file:///storage/delivery_photos/proof_1.jpg',
      photoBase64: 'BASE64_COMPRESSED_DATA',
      rgDocument: '123456789',
      notes: 'Portão branco',
      originalData: JSON.stringify({
        Cliente: 'Carlos Silva',
        Endereço: 'Rua das Flores 123',
        Volume: '2 caixas',
        Peso: '4.5 kg',
      }),
      deliveredAt: 1700000000000,
      createdAt: 1700000000000,
    });

    expect(proofId).toBe(1);
    expect(inMemoryStore.delivered_proofs.length).toBe(1);
    expect(inMemoryStore.delivered_proofs[0].recipientName).toBe('Carlos Silva');
    expect(inMemoryStore.delivered_proofs[0].photoUri).toBe('file:///storage/delivery_photos/proof_1.jpg');
    expect(inMemoryStore.delivered_proofs[0].originalData).toContain('Volume');
  });

  test('Deve encontrar entrega anterior no mesmo endereço ao importar planilha futura', () => {
    DatabaseService.saveDeliveredProof({
      deliveryId: 1,
      recipientName: 'Mariana Lima',
      address: 'Rua Copacabana 50',
      normalizedAddress: 'rua copacabana 50',
      latitude: -22.92,
      longitude: -42.82,
      photoUri: 'file:///storage/delivery_photos/proof_mariana.jpg',
      deliveredAt: 1700000000000,
      createdAt: 1700000000000,
    });

    const previous = DatabaseService.findPreviousDeliveriesAtAddress('Rua Copacabana 50', -22.92, -42.82);
    expect(previous.length).toBeGreaterThan(0);
    expect(previous[0].recipientName).toBe('Mariana Lima');
    expect(previous[0].photoUri).toBe('file:///storage/delivery_photos/proof_mariana.jpg');

    const latest = DatabaseService.findLatestDeliveredProof('Rua Copacabana 50');
    expect(latest).not.toBeNull();
    expect(latest?.recipientName).toBe('Mariana Lima');
  });

  test('Deve pesquisar comprovantes no histórico por nome, pedido ou RG', () => {
    DatabaseService.saveDeliveredProof({
      recipientName: 'Rodrigo Souza',
      address: 'Rua 10',
      normalizedAddress: 'rua 10',
      orderCode: 'PED-RODRIGO-88',
      rgDocument: '987654321',
      deliveredAt: 1700000001000,
      createdAt: 1700000001000,
    });

    DatabaseService.saveDeliveredProof({
      recipientName: 'Ana Beatriz',
      address: 'Avenida 20',
      normalizedAddress: 'avenida 20',
      orderCode: 'PED-ANA-99',
      rgDocument: '112233445',
      deliveredAt: 1700000002000,
      createdAt: 1700000002000,
    });

    // Busca por nome
    const searchName = DatabaseService.searchDeliveredHistory('Rodrigo');
    expect(searchName.length).toBe(1);
    expect(searchName[0].recipientName).toBe('Rodrigo Souza');

    // Busca por pedido
    const searchOrder = DatabaseService.searchDeliveredHistory('PED-ANA');
    expect(searchOrder.length).toBe(1);
    expect(searchOrder[0].recipientName).toBe('Ana Beatriz');

    // Busca por RG
    const searchRg = DatabaseService.searchDeliveredHistory('987654321');
    expect(searchRg.length).toBe(1);
    expect(searchRg[0].recipientName).toBe('Rodrigo Souza');
  });

  test('Deve recolocar entrega de volta na rota (revertDeliveryStatus)', () => {
    expect(inMemoryStore.deliveries[1].status).toBe('failed');
    expect(inMemoryStore.deliveries[1].failReason).toBe('absent');

    DatabaseService.revertDeliveryStatus(2);

    expect(inMemoryStore.deliveries[1].status).toBe('pending');
    expect(inMemoryStore.deliveries[1].failReason).toBeNull();
  });

  test('Deve monitorar o tamanho do banco e acionar rollover se ultrapassar o limite', () => {
    // 10 páginas de 4096 bytes = 40960 bytes (~40 KB)
    const sizeBytes = DatabaseService.getDatabaseSizeBytes();
    expect(sizeBytes).toBe(40960);

    // Testando com limite personalizado menor (ex: 20 KB)
    const rotated = DatabaseService.checkAndRotateIfFull(20000);
    expect(rotated).toBe(true);
    expect(DatabaseService.getAllShardNames().length).toBeGreaterThan(1);
  });
});
