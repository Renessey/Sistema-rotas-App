import { open, DB } from '@op-engineering/op-sqlite';
import type { DeliveryEntity, DeliveryListEntity, DeliveryStatus, FailReason } from '../types/geo';

export class DatabaseService {
  private static db: DB | null = null;

  static init(): void {
    if (this.db) return;
    this.db = open({ name: 'routes_deliveries_offline.db' });

    // 1. Tabela de Listas / Romaneios de Entregas (Lista 1, Lista 2, Lista 3...)
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS delivery_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        fileName TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    // 2. Tabela principal de entregas offline
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listId INTEGER,
        destination TEXT,
        bairro TEXT,
        city TEXT,
        zipCode TEXT,
        latitude REAL,
        longitude REAL,
        rawLatitude TEXT,
        rawLongitude TEXT,
        pedido TEXT,
        telefone TEXT,
        status TEXT DEFAULT 'pending',
        ordem INTEGER,
        distancia REAL,
        tempoEstimado REAL,
        failReason TEXT,
        notes TEXT,
        deliveredAt INTEGER,
        createdAt INTEGER,
        updatedAt INTEGER,
        originalData TEXT,
        name TEXT,
        address TEXT,
        phone TEXT,
        orderCode TEXT,
        sequence INTEGER
      );
    `);

    // Migrations seguras de colunas caso o banco já exista
    const addCol = (col: string, type: string) => {
      try {
        this.db!.executeSync(`ALTER TABLE deliveries ADD COLUMN ${col} ${type};`);
      } catch {
        // coluna já existe
      }
    };

    addCol('listId', 'INTEGER');
    addCol('destination', 'TEXT');
    addCol('bairro', 'TEXT');
    addCol('city', 'TEXT');
    addCol('zipCode', 'TEXT');
    addCol('latitude', 'REAL');
    addCol('longitude', 'REAL');
    addCol('rawLatitude', 'TEXT');
    addCol('rawLongitude', 'TEXT');
    addCol('pedido', 'TEXT');
    addCol('telefone', 'TEXT');
    addCol('ordem', 'INTEGER');
    addCol('distancia', 'REAL');
    addCol('tempoEstimado', 'REAL');
    addCol('failReason', 'TEXT');
    addCol('notes', 'TEXT');
    addCol('deliveredAt', 'INTEGER');
    addCol('createdAt', 'INTEGER');
    addCol('updatedAt', 'INTEGER');
    addCol('originalData', 'TEXT');
  }

  static getDb(): DB {
    if (!this.db) this.init();
    return this.db!;
  }

  /* ═══════════════════════════════════════════════════
     GERENCIAMENTO DE LISTAS (Lista 1, Lista 2, Lista 3)
  ═══════════════════════════════════════════════════ */

  /**
   * Cria uma nova lista no SQLite. Se não for passado um nome, gera automaticamente "Lista X".
   */
  static createList(name?: string, fileName?: string): number {
    const db = this.getDb();
    const existing = this.getAllLists();
    const nextNumber = existing.length + 1;
    const finalName = name && name.trim() ? name.trim() : `Lista ${nextNumber}`;
    const now = Date.now();

    // Desativa as outras listas para tornar a nova como ativa
    db.executeSync('UPDATE delivery_lists SET isActive = 0;');

    const res = db.executeSync(
      'INSERT INTO delivery_lists (name, fileName, isActive, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?);',
      [finalName, fileName ?? null, now, now],
    );

    return res.insertId ?? 0;
  }

  /**
   * Retorna todas as listas salvas com contagem de entregas, entregues e pendentes.
   */
  static getAllLists(): DeliveryListEntity[] {
    const db = this.getDb();
    const res = db.executeSync(
      'SELECT * FROM delivery_lists ORDER BY id DESC;',
    );

    const lists: DeliveryListEntity[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows[i] as any;
      const listId = row.id;

      // Conta entregas da lista
      const countRes = db.executeSync(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'pending' OR status = 'optimized' OR status = 'in_progress' THEN 1 ELSE 0 END) as pending
        FROM deliveries WHERE listId = ?;`,
        [listId],
      );
      const counts = (countRes.rows[0] as any) || { total: 0, completed: 0, pending: 0 };

      lists.push({
        id: listId,
        name: row.name || `Lista ${listId}`,
        fileName: row.fileName ?? null,
        totalDeliveries: Number(counts.total ?? 0),
        completedDeliveries: Number(counts.completed ?? 0),
        pendingDeliveries: Number(counts.pending ?? 0),
        isActive: row.isActive === 1,
        createdAt: row.createdAt ?? Date.now(),
        updatedAt: row.updatedAt ?? Date.now(),
      });
    }

    return lists;
  }

  /**
   * Retorna a lista atualmente ativa no mapa / app.
   */
  static getActiveList(): DeliveryListEntity | null {
    const lists = this.getAllLists();
    const active = lists.find((l) => l.isActive);
    return active || (lists.length > 0 ? lists[0] : null);
  }

  /**
   * Define uma lista como ativa no app.
   */
  static setActiveList(listId: number): void {
    const db = this.getDb();
    db.executeSync('UPDATE delivery_lists SET isActive = 0;');
    db.executeSync('UPDATE delivery_lists SET isActive = 1, updatedAt = ? WHERE id = ?;', [
      Date.now(),
      listId,
    ]);
  }

  /**
   * Exclui uma lista específica e todas as suas entregas do banco SQLite.
   */
  static deleteList(listId: number): void {
    const db = this.getDb();
    db.executeSync('DELETE FROM deliveries WHERE listId = ?;', [listId]);
    db.executeSync('DELETE FROM delivery_lists WHERE id = ?;', [listId]);

    // Se a lista apagada era a ativa, ativa a lista mais recente
    const remaining = this.getAllLists();
    if (remaining.length > 0 && !remaining.some((l) => l.isActive)) {
      this.setActiveList(remaining[0].id);
    }
  }

  /**
   * Renomeia uma lista salva.
   */
  static renameList(listId: number, newName: string): void {
    const db = this.getDb();
    db.executeSync('UPDATE delivery_lists SET name = ?, updatedAt = ? WHERE id = ?;', [
      newName.trim(),
      Date.now(),
      listId,
    ]);
  }

  /**
   * Salva um lote de entregas vinculado a uma lista específica.
   */
  static saveDeliveriesBatch(
    listId: number,
    deliveries: Omit<DeliveryEntity, 'id'>[],
  ): void {
    const db = this.getDb();
    // Limpa entregas anteriores da mesma lista se houver
    db.executeSync('DELETE FROM deliveries WHERE listId = ?;', [listId]);

    deliveries.forEach((d) => {
      this.insertDelivery({ ...d, listId });
    });
  }

  /* ═══════════════════════════════════════════════════
     OPERAÇÕES DE ENTREGAS
  ═══════════════════════════════════════════════════ */

  static insertDelivery(delivery: Omit<DeliveryEntity, 'id'>): number {
    const db = this.getDb();
    const destination = delivery.destination || delivery.name || delivery.address || '';
    const bairro = delivery.bairro || delivery.neighborhood || '';
    const city = delivery.city || '';
    const zipCode = delivery.zipCode || delivery.cep || '';
    const phone = delivery.telefone || delivery.phone || '';
    const pedido = delivery.pedido || delivery.orderCode || '';

    // Se não tiver listId, associa com a lista ativa ou cria uma padrão
    let listId = delivery.listId;
    if (!listId) {
      const active = this.getActiveList();
      listId = active ? active.id : this.createList('Lista 1');
    }

    const result = db.executeSync(
      `INSERT INTO deliveries (
        listId, destination, bairro, city, zipCode, latitude, longitude, rawLatitude, rawLongitude,
        pedido, telefone, status, ordem, distancia, tempoEstimado, failReason, notes,
        deliveredAt, createdAt, updatedAt, originalData, name, address, phone, orderCode, sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        listId,
        destination,
        bairro,
        city,
        zipCode,
        delivery.latitude ?? null,
        delivery.longitude ?? null,
        delivery.rawLatitude ?? null,
        delivery.rawLongitude ?? null,
        pedido,
        phone,
        delivery.status ?? 'pending',
        delivery.ordem ?? delivery.sequence ?? null,
        delivery.distancia ?? delivery.distance ?? null,
        delivery.tempoEstimado ?? delivery.duration ?? null,
        delivery.failReason ?? null,
        delivery.notes ?? null,
        delivery.deliveredAt ?? null,
        delivery.createdAt ?? Date.now(),
        delivery.updatedAt ?? Date.now(),
        delivery.originalData ?? null,
        destination,
        destination,
        phone,
        pedido,
        delivery.ordem ?? delivery.sequence ?? null,
      ],
    );
    return result.insertId ?? 0;
  }

  /**
   * Retorna entregas. Se listId for passado, busca apenas daquela lista;
   * caso contrário, busca da lista ativa.
   */
  static getAllDeliveries(listId?: number): DeliveryEntity[] {
    const db = this.getDb();
    let query = 'SELECT * FROM deliveries ORDER BY CASE WHEN ordem IS NOT NULL THEN ordem ELSE sequence END ASC, id ASC;';
    let params: any[] = [];

    if (listId !== undefined) {
      query = 'SELECT * FROM deliveries WHERE listId = ? ORDER BY CASE WHEN ordem IS NOT NULL THEN ordem ELSE sequence END ASC, id ASC;';
      params = [listId];
    } else {
      const active = this.getActiveList();
      if (active) {
        query = 'SELECT * FROM deliveries WHERE listId = ? OR listId IS NULL ORDER BY CASE WHEN ordem IS NOT NULL THEN ordem ELSE sequence END ASC, id ASC;';
        params = [active.id];
      }
    }

    const result = db.executeSync(query, params);
    const rows: DeliveryEntity[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i] as any;
      rows.push({
        id: row.id,
        listId: row.listId ?? null,
        destination: row.destination || row.name || row.address || '',
        bairro: row.bairro || row.neighborhood || '',
        city: row.city || '',
        zipCode: row.zipCode || row.cep || '',
        latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
        longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
        rawLatitude: row.rawLatitude ?? null,
        rawLongitude: row.rawLongitude ?? null,
        pedido: row.pedido || row.orderCode || null,
        telefone: row.telefone || row.phone || null,
        status: row.status as DeliveryStatus,
        ordem: row.ordem ?? row.sequence ?? null,
        distancia: row.distancia ?? row.distance ?? null,
        tempoEstimado: row.tempoEstimado ?? row.duration ?? null,
        failReason: row.failReason ?? null,
        notes: row.notes ?? null,
        deliveredAt: row.deliveredAt ?? null,
        createdAt: row.createdAt ?? Date.now(),
        updatedAt: row.updatedAt ?? Date.now(),
        originalData: row.originalData ?? null,
        name: row.destination || row.name || '',
        address: row.destination || row.address || '',
        phone: row.telefone || row.phone || '',
        orderCode: row.pedido || row.orderCode || '',
        sequence: row.ordem ?? row.sequence ?? null,
      });
    }
    return rows;
  }

  static getDeliveriesByStatus(status: DeliveryStatus, listId?: number): DeliveryEntity[] {
    return this.getAllDeliveries(listId).filter((d) => d.status === status);
  }

  static updateDeliveryStatus(
    id: number,
    status: DeliveryStatus,
    extra?: { failReason?: FailReason; notes?: string; deliveredAt?: number },
  ): void {
    const db = this.getDb();
    const deliveredAt = status === 'completed' ? (extra?.deliveredAt ?? Date.now()) : null;
    const failReason = status === 'failed' ? (extra?.failReason ?? null) : null;
    const updatedAt = Date.now();

    if (extra?.notes !== undefined) {
      db.executeSync(
        `UPDATE deliveries SET status = ?, failReason = ?, notes = ?, deliveredAt = ?, updatedAt = ? WHERE id = ?;`,
        [status, failReason, extra.notes, deliveredAt, updatedAt, id],
      );
    } else {
      db.executeSync(
        `UPDATE deliveries SET status = ?, failReason = ?, deliveredAt = ?, updatedAt = ? WHERE id = ?;`,
        [status, failReason, deliveredAt, updatedAt, id],
      );
    }
  }

  static updateDeliveryCoords(
    id: number,
    lat: number,
    lon: number,
    rawLat?: string,
    rawLon?: string,
  ): void {
    const db = this.getDb();
    db.executeSync(
      `UPDATE deliveries SET
        latitude = ?, longitude = ?,
        rawLatitude = COALESCE(?, rawLatitude),
        rawLongitude = COALESCE(?, rawLongitude),
        status = 'pending',
        updatedAt = ?
      WHERE id = ?;`,
      [lat, lon, rawLat ?? String(lat), rawLon ?? String(lon), Date.now(), id],
    );
  }

  static updateDeliveryNotes(id: number, notes: string): void {
    const db = this.getDb();
    db.executeSync('UPDATE deliveries SET notes = ?, updatedAt = ? WHERE id = ?;', [
      notes,
      Date.now(),
      id,
    ]);
  }

  static updateDeliverySequence(id: number, sequence: number): void {
    const db = this.getDb();
    db.executeSync(
      'UPDATE deliveries SET ordem = ?, sequence = ?, status = ?, updatedAt = ? WHERE id = ?;',
      [sequence, sequence, 'optimized', Date.now(), id],
    );
  }

  /**
   * Limpa todas as entregas do banco (ou de uma lista específica se listId for informado).
   */
  static clearDeliveries(listId?: number): void {
    const db = this.getDb();
    if (listId !== undefined) {
      db.executeSync('DELETE FROM deliveries WHERE listId = ?;', [listId]);
    } else {
      db.executeSync('DELETE FROM deliveries;');
      db.executeSync('DELETE FROM delivery_lists;');
    }
  }

  static getStats(listId?: number): {
    total: number;
    located: number;
    completed: number;
    pending: number;
    failed: number;
    invalidCoords: number;
  } {
    const all = this.getAllDeliveries(listId);
    return {
      total: all.length,
      located: all.filter((d) => d.latitude !== null && d.longitude !== null).length,
      completed: all.filter((d) => d.status === 'completed').length,
      pending: all.filter((d) => d.status === 'pending' || d.status === 'optimized' || d.status === 'in_progress').length,
      failed: all.filter((d) => d.status === 'failed').length,
      invalidCoords: all.filter((d) => d.latitude === null || d.longitude === null || d.status === 'invalid_coords').length,
    };
  }

  static getGeocodingCache(query: string): {
    latitude: number;
    longitude: number;
    provider: string;
    confidence?: string;
    formattedAddress?: string;
  } | null {
    const db = this.getDb();
    try {
      db.executeSync(`
        CREATE TABLE IF NOT EXISTS geocoding_cache (
          queryKey TEXT PRIMARY KEY,
          latitude REAL,
          longitude REAL,
          provider TEXT,
          confidence TEXT,
          formattedAddress TEXT,
          createdAt INTEGER
        );
      `);
      const res = db.executeSync(
        'SELECT latitude, longitude, provider, confidence, formattedAddress FROM geocoding_cache WHERE queryKey = ? LIMIT 1;',
        [query.trim().toLowerCase()],
      );
      const rows = res.rows as unknown as Array<{
        latitude: number;
        longitude: number;
        provider: string;
        confidence?: string;
        formattedAddress?: string;
      }>;
      const row = rows?.[0];
      return row ?? null;
    } catch {
      return null;
    }
  }

  static saveGeocodingCache(
    query: string,
    data: {
      latitude: number;
      longitude: number;
      provider: string;
      confidence?: string;
      formattedAddress?: string;
    },
  ): void {
    const db = this.getDb();
    try {
      db.executeSync(`
        CREATE TABLE IF NOT EXISTS geocoding_cache (
          queryKey TEXT PRIMARY KEY,
          latitude REAL,
          longitude REAL,
          provider TEXT,
          confidence TEXT,
          formattedAddress TEXT,
          createdAt INTEGER
        );
      `);
      db.executeSync(
        'INSERT OR REPLACE INTO geocoding_cache (queryKey, latitude, longitude, provider, confidence, formattedAddress, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?);',
        [
          query.trim().toLowerCase(),
          data.latitude,
          data.longitude,
          data.provider,
          data.confidence ?? null,
          data.formattedAddress ?? null,
          Date.now(),
        ],
      );
    } catch {
      // ignore
    }
  }
}
