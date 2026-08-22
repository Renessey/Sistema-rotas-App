import { open, DB } from '@op-engineering/op-sqlite';
import type { DeliveryEntity, DeliveryStatus, FailReason, GeocodingStatus } from '../types/geo';

export class DatabaseService {
  private static db: DB | null = null;

  static init(): void {
    if (this.db) return;
    this.db = open({ name: 'routes_deliveries.db' });

    // Main deliveries table with all new fields
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        address TEXT,
        number TEXT,
        complement TEXT,
        neighborhood TEXT,
        city TEXT,
        state TEXT,
        cep TEXT,
        phone TEXT,
        orderCode TEXT,
        latitude REAL,
        longitude REAL,
        snappedLatitude REAL,
        snappedLongitude REAL,
        geocodingStatus TEXT DEFAULT 'pending',
        geocodingSource TEXT,
        routingStatus TEXT DEFAULT 'pending',
        sequence INTEGER,
        distance REAL,
        duration REAL,
        status TEXT DEFAULT 'pending',
        failReason TEXT,
        notes TEXT,
        deliveredAt INTEGER,
        createdAt INTEGER
      );
    `);

    // Geocoding cache table — persiste resultados entre sessões
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS geocoding_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cacheKey TEXT UNIQUE NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        confidence TEXT NOT NULL,
        provider TEXT NOT NULL,
        formattedAddress TEXT,
        createdAt INTEGER NOT NULL
      );
    `);

    // Migrate: add new columns to existing tables if they don't exist yet
    const addColumnIfMissing = (table: string, col: string, def: string) => {
      try {
        this.db!.executeSync(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
      } catch {
        // column already exists — ignore
      }
    };
    addColumnIfMissing('deliveries', 'geocodingSource', 'TEXT');
    addColumnIfMissing('deliveries', 'failReason', 'TEXT');
    addColumnIfMissing('deliveries', 'notes', 'TEXT');
    addColumnIfMissing('deliveries', 'deliveredAt', 'INTEGER');
    addColumnIfMissing('deliveries', 'createdAt', 'INTEGER');
    addColumnIfMissing('deliveries', 'originalData', 'TEXT');
  }

  static getDb(): DB {
    if (!this.db) this.init();
    return this.db!;
  }

  static insertDelivery(delivery: Omit<DeliveryEntity, 'id'>): number {
    const db = this.getDb();
    const result = db.executeSync(
      `INSERT INTO deliveries (
        name, address, number, complement, neighborhood, city, state, cep, phone, orderCode,
        latitude, longitude, snappedLatitude, snappedLongitude, geocodingStatus, geocodingSource,
        routingStatus, sequence, distance, duration, status, failReason, notes, deliveredAt, createdAt, originalData
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        delivery.name ?? null,
        delivery.address ?? null,
        delivery.number ?? null,
        delivery.complement ?? null,
        delivery.neighborhood ?? null,
        delivery.city ?? null,
        delivery.state ?? null,
        delivery.cep ?? null,
        delivery.phone ?? null,
        delivery.orderCode ?? null,
        delivery.latitude ?? null,
        delivery.longitude ?? null,
        delivery.snappedLatitude ?? null,
        delivery.snappedLongitude ?? null,
        delivery.geocodingStatus ?? 'pending',
        delivery.geocodingSource ?? null,
        delivery.routingStatus ?? 'pending',
        delivery.sequence ?? null,
        delivery.distance ?? null,
        delivery.duration ?? null,
        delivery.status ?? 'pending',
        delivery.failReason ?? null,
        delivery.notes ?? null,
        delivery.deliveredAt ?? null,
        delivery.createdAt ?? Date.now(),
        delivery.originalData ?? null,
      ],
    );
    return result.insertId ?? 0;
  }

  static getAllDeliveries(): DeliveryEntity[] {
    const db = this.getDb();
    const result = db.executeSync('SELECT * FROM deliveries ORDER BY sequence ASC, id ASC;');
    const rows: DeliveryEntity[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows[i] as unknown as DeliveryEntity);
    }
    return rows;
  }

  static getDeliveriesByStatus(status: DeliveryStatus): DeliveryEntity[] {
    const db = this.getDb();
    const result = db.executeSync(
      'SELECT * FROM deliveries WHERE status = ? ORDER BY sequence ASC, id ASC;',
      [status],
    );
    const rows: DeliveryEntity[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows[i] as unknown as DeliveryEntity);
    }
    return rows;
  }

  static getPendingGeocode(): DeliveryEntity[] {
    const db = this.getDb();
    const result = db.executeSync(
      `SELECT * FROM deliveries WHERE geocodingStatus IN ('pending', 'failed') AND (latitude IS NULL OR longitude IS NULL);`,
    );
    const rows: DeliveryEntity[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows[i] as unknown as DeliveryEntity);
    }
    return rows;
  }

  static updateDeliveryStatus(
    id: number,
    status: DeliveryStatus,
    extra?: { failReason?: FailReason; notes?: string; deliveredAt?: number },
  ): void {
    const db = this.getDb();
    const deliveredAt = status === 'completed' ? (extra?.deliveredAt ?? Date.now()) : null;
    const failReason = status === 'failed' ? (extra?.failReason ?? null) : null;

    if (extra?.notes !== undefined) {
      db.executeSync(
        `UPDATE deliveries SET status = ?, failReason = ?, notes = ?, deliveredAt = ? WHERE id = ?;`,
        [status, failReason, extra.notes, deliveredAt, id],
      );
    } else {
      db.executeSync(
        `UPDATE deliveries SET status = ?, failReason = ?, deliveredAt = ? WHERE id = ?;`,
        [status, failReason, deliveredAt, id],
      );
    }
  }

  static updateDeliveryCoords(
    id: number,
    lat: number,
    lon: number,
    snappedLat?: number,
    snappedLon?: number,
    source?: string,
  ): void {
    const db = this.getDb();
    db.executeSync(
      `UPDATE deliveries SET
        latitude = ?, longitude = ?,
        snappedLatitude = ?, snappedLongitude = ?,
        geocodingStatus = 'success',
        geocodingSource = COALESCE(?, geocodingSource)
      WHERE id = ?;`,
      [lat, lon, snappedLat ?? lat, snappedLon ?? lon, source ?? null, id],
    );
  }

  static updateDeliveryGeocodingStatus(id: number, status: GeocodingStatus): void {
    const db = this.getDb();
    db.executeSync('UPDATE deliveries SET geocodingStatus = ? WHERE id = ?;', [status, id]);
  }

  static updateDeliveryNotes(id: number, notes: string): void {
    const db = this.getDb();
    db.executeSync('UPDATE deliveries SET notes = ? WHERE id = ?;', [notes, id]);
  }

  static updateDeliverySequence(id: number, sequence: number): void {
    const db = this.getDb();
    db.executeSync('UPDATE deliveries SET sequence = ?, status = ? WHERE id = ?;', [sequence, 'optimized', id]);
  }

  static clearDeliveries(): void {
    const db = this.getDb();
    db.executeSync('DELETE FROM deliveries;');
    try {
      db.executeSync('DELETE FROM geocoding_cache;');
    } catch {
      // ignore
    }
  }

  /* ----- Geocoding Cache ----- */

  static getGeocodingCache(cacheKey: string): {
    latitude: number; longitude: number; confidence: string; provider: string; formattedAddress?: string;
  } | null {
    const db = this.getDb();
    const result = db.executeSync(
      'SELECT * FROM geocoding_cache WHERE cacheKey = ? LIMIT 1;',
      [cacheKey],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    return {
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      confidence: row.confidence as string,
      provider: row.provider as string,
      formattedAddress: row.formattedAddress as string | undefined,
    };
  }

  static saveGeocodingCache(
    cacheKey: string,
    data: { latitude: number; longitude: number; confidence: string; provider: string; formattedAddress?: string },
  ): void {
    const db = this.getDb();
    db.executeSync(
      `INSERT OR REPLACE INTO geocoding_cache (cacheKey, latitude, longitude, confidence, provider, formattedAddress, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [cacheKey, data.latitude, data.longitude, data.confidence, data.provider, data.formattedAddress ?? null, Date.now()],
    );
  }

  static clearGeocodingCache(): void {
    const db = this.getDb();
    db.executeSync('DELETE FROM geocoding_cache;');
  }

  static getStats(): { total: number; located: number; completed: number; pending: number; failed: number } {
    const db = this.getDb();
    const r = db.executeSync(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END) as located,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status IN ('pending', 'optimized', 'in_progress') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM deliveries;
    `);
    const row = r.rows[0] as Record<string, number>;
    return {
      total: row.total ?? 0,
      located: row.located ?? 0,
      completed: row.completed ?? 0,
      pending: row.pending ?? 0,
      failed: row.failed ?? 0,
    };
  }
}
