// In-memory mock for op-sqlite
const inMemoryStore = {
  delivery_lists: [] as any[],
  deliveries: [] as any[],
  listIdCounter: 1,
  deliveryIdCounter: 1,
};

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    executeSync: jest.fn((query: string, params: any[] = []) => {
      const q = query.trim().toUpperCase();

      if (q.startsWith('CREATE TABLE')) {
        return { rows: [] };
      }

      if (q.startsWith('ALTER TABLE')) {
        return { rows: [] };
      }

      if (q.startsWith('DELETE FROM DELIVERY_LISTS')) {
        if (q.includes('WHERE ID = ?')) {
          const listId = params[0];
          inMemoryStore.delivery_lists = inMemoryStore.delivery_lists.filter(
            (l) => l.id !== listId,
          );
        } else {
          inMemoryStore.delivery_lists = [];
        }
        return { rows: [] };
      }

      if (q.startsWith('DELETE FROM DELIVERIES')) {
        if (q.includes('WHERE LISTID = ?')) {
          const listId = params[0];
          inMemoryStore.deliveries = inMemoryStore.deliveries.filter(
            (d) => d.listId !== listId,
          );
        } else {
          inMemoryStore.deliveries = [];
        }
        return { rows: [] };
      }

      if (q.startsWith('INSERT INTO DELIVERY_LISTS')) {
        const id = inMemoryStore.listIdCounter++;
        const item = {
          id,
          name: params[0],
          fileName: params[1],
          isActive: 1,
          createdAt: params[2],
          updatedAt: params[3],
        };
        inMemoryStore.delivery_lists.push(item);
        return { insertId: id, rows: [] };
      }

      if (q.startsWith('INSERT INTO DELIVERIES')) {
        const id = inMemoryStore.deliveryIdCounter++;
        const item = {
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
          distancia: params[13],
          tempoEstimado: params[14],
          failReason: params[15],
          notes: params[16],
          deliveredAt: params[17],
          createdAt: params[18],
          updatedAt: params[19],
          originalData: params[20],
        };
        inMemoryStore.deliveries.push(item);
        return { insertId: id, rows: [] };
      }

      if (q.startsWith('UPDATE DELIVERY_LISTS SET ISACTIVE = 0')) {
        inMemoryStore.delivery_lists.forEach((l) => (l.isActive = 0));
        return { rows: [] };
      }

      if (q.startsWith('UPDATE DELIVERY_LISTS SET ISACTIVE = 1')) {
        const listId = params[1];
        inMemoryStore.delivery_lists.forEach((l) => {
          l.isActive = l.id === listId ? 1 : 0;
        });
        return { rows: [] };
      }

      if (q.startsWith('UPDATE DELIVERY_LISTS SET NAME = ?')) {
        const newName = params[0];
        const listId = params[2];
        const item = inMemoryStore.delivery_lists.find((l) => l.id === listId);
        if (item) item.name = newName;
        return { rows: [] };
      }

      if (q.includes('COUNT(*) AS TOTAL') && q.includes('FROM DELIVERIES WHERE LISTID = ?')) {
        const listId = params[0];
        const matched = inMemoryStore.deliveries.filter((d) => d.listId === listId);
        return {
          rows: [
            {
              total: matched.length,
              completed: matched.filter((d) => d.status === 'completed').length,
              pending: matched.filter(
                (d) =>
                  d.status === 'pending' ||
                  d.status === 'optimized' ||
                  d.status === 'in_progress',
              ).length,
            },
          ],
        };
      }

      if (q.startsWith('SELECT * FROM DELIVERY_LISTS')) {
        const sorted = [...inMemoryStore.delivery_lists].reverse();
        return { rows: sorted };
      }

      if (q.startsWith('SELECT * FROM DELIVERIES')) {
        let matched = [...inMemoryStore.deliveries];
        if (query.includes('WHERE listId = ?')) {
          const listId = params[0];
          matched = matched.filter((d) => d.listId === listId);
        }
        return { rows: matched };
      }

      return { rows: [] };
    }),
  })),
}));

import { DatabaseService } from '../src/storage/DatabaseService';
import type { DeliveryEntity } from '../src/types/geo';

describe('Multi-List Delivery Management (Lista 1, Lista 2, Lista 3...)', () => {
  beforeEach(() => {
    inMemoryStore.delivery_lists = [];
    inMemoryStore.deliveries = [];
    inMemoryStore.listIdCounter = 1;
    inMemoryStore.deliveryIdCounter = 1;
    DatabaseService.init();
  });

  it('cria múltiplas listas com nomes automáticos ou personalizados', () => {
    const list1Id = DatabaseService.createList('Lista 1', 'planilha1.xlsx');
    expect(list1Id).toBe(1);

    const list2Id = DatabaseService.createList('Lista 2', 'planilha2.csv');
    expect(list2Id).toBe(2);

    const list3Id = DatabaseService.createList('Romaneio Especial');
    expect(list3Id).toBe(3);

    const allLists = DatabaseService.getAllLists();
    expect(allLists).toHaveLength(3);
    expect(allLists.map((l) => l.name)).toContain('Lista 1');
    expect(allLists.map((l) => l.name)).toContain('Lista 2');
    expect(allLists.map((l) => l.name)).toContain('Romaneio Especial');
  });

  it('salva entregas vinculadas a listas distintas e calcula estatísticas por lista', () => {
    const list1Id = DatabaseService.createList('Lista 1');
    const list2Id = DatabaseService.createList('Lista 2');

    const d1: Omit<DeliveryEntity, 'id'> = {
      listId: list1Id,
      destination: 'Cliente Maricá 1',
      bairro: 'Centro',
      city: 'Maricá',
      zipCode: '24900-000',
      latitude: -22.9192,
      longitude: -42.8188,
      rawLatitude: '-22.9192',
      rawLongitude: '-42.8188',
      pedido: 'PED-1',
      telefone: '21999991111',
      status: 'pending',
      ordem: 1,
      distancia: null,
      tempoEstimado: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const d2: Omit<DeliveryEntity, 'id'> = {
      listId: list2Id,
      destination: 'Cliente Niterói 1',
      bairro: 'Icaraí',
      city: 'Niterói',
      zipCode: '24230-000',
      latitude: -22.8832,
      longitude: -43.1189,
      rawLatitude: '-22.8832',
      rawLongitude: '-43.1189',
      pedido: 'PED-2',
      telefone: '21999992222',
      status: 'completed',
      ordem: 1,
      distancia: null,
      tempoEstimado: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    DatabaseService.insertDelivery(d1);
    DatabaseService.insertDelivery(d2);

    const list1Deliveries = DatabaseService.getAllDeliveries(list1Id);
    expect(list1Deliveries).toHaveLength(1);
    expect(list1Deliveries[0].destination).toBe('Cliente Maricá 1');

    const list2Deliveries = DatabaseService.getAllDeliveries(list2Id);
    expect(list2Deliveries).toHaveLength(1);
    expect(list2Deliveries[0].destination).toBe('Cliente Niterói 1');

    const lists = DatabaseService.getAllLists();
    const l1 = lists.find((l) => l.id === list1Id)!;
    const l2 = lists.find((l) => l.id === list2Id)!;

    expect(l1.totalDeliveries).toBe(1);
    expect(l1.pendingDeliveries).toBe(1);
    expect(l1.completedDeliveries).toBe(0);

    expect(l2.totalDeliveries).toBe(1);
    expect(l2.completedDeliveries).toBe(1);
    expect(l2.pendingDeliveries).toBe(0);
  });

  it('permite alternar a lista ativa no app', () => {
    const list1Id = DatabaseService.createList('Lista 1');
    const list2Id = DatabaseService.createList('Lista 2');

    // Ao criar, list2Id é a ativa
    expect(DatabaseService.getActiveList()?.id).toBe(list2Id);

    // Alterna para list1Id
    DatabaseService.setActiveList(list1Id);
    expect(DatabaseService.getActiveList()?.id).toBe(list1Id);
  });

  it('exclui individualmente uma lista e suas entregas mantendo as demais intactas', () => {
    const list1Id = DatabaseService.createList('Lista 1');
    const list2Id = DatabaseService.createList('Lista 2');

    DatabaseService.insertDelivery({
      listId: list1Id,
      destination: 'Parada Lista 1',
      bairro: 'Centro',
      city: 'Maricá',
      zipCode: '24900-000',
      latitude: -22.9192,
      longitude: -42.8188,
      rawLatitude: '-22.9192',
      rawLongitude: '-42.8188',
      pedido: null,
      telefone: null,
      status: 'pending',
      ordem: 1,
      distancia: null,
      tempoEstimado: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    DatabaseService.insertDelivery({
      listId: list2Id,
      destination: 'Parada Lista 2',
      bairro: 'Icaraí',
      city: 'Niterói',
      zipCode: '24230-000',
      latitude: -22.8832,
      longitude: -43.1189,
      rawLatitude: '-22.8832',
      rawLongitude: '-43.1189',
      pedido: null,
      telefone: null,
      status: 'pending',
      ordem: 1,
      distancia: null,
      tempoEstimado: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Exclui apenas a Lista 1
    DatabaseService.deleteList(list1Id);

    const remainingLists = DatabaseService.getAllLists();
    expect(remainingLists).toHaveLength(1);
    expect(remainingLists[0].id).toBe(list2Id);
    expect(remainingLists[0].name).toBe('Lista 2');

    // Entregas da Lista 1 foram apagadas
    expect(DatabaseService.getAllDeliveries(list1Id)).toHaveLength(0);

    // Entregas da Lista 2 continuam salvas e íntegras
    const remainingDeliveries = DatabaseService.getAllDeliveries(list2Id);
    expect(remainingDeliveries).toHaveLength(1);
    expect(remainingDeliveries[0].destination).toBe('Parada Lista 2');
  });

  it('permite renomear uma lista salva', () => {
    const listId = DatabaseService.createList('Lista 1');
    DatabaseService.renameList(listId, 'Entregas da Tarde - Maricá');

    const lists = DatabaseService.getAllLists();
    expect(lists.find((l) => l.id === listId)?.name).toBe('Entregas da Tarde - Maricá');
  });
});
