import { open, DB } from '@op-engineering/op-sqlite';
import type { DeliveryEntity, DeliveryStatus } from '../types/geo';

export class DatabaseService {
  private static db: DB | null = null;

  static init(): void {
    if (this.db) return;
    this.db = open({ name: 'routes_deliveries.db' });
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
        routingStatus TEXT DEFAULT 'pending',
        sequence INTEGER,
        distance REAL,
        duration REAL,
        status TEXT DEFAULT 'pending'
      );
    `);
  }

  static getDb(): DB {
    if (!this.db) {
      this.init();
    }
    return this.db!;
  }

  static insertDelivery(delivery: Omit<DeliveryEntity, 'id'>): number {
    const db = this.getDb();
    const result = db.executeSync(
      `INSERT INTO deliveries (
        name, address, number, complement, neighborhood, city, state, cep, phone, orderCode,
        latitude, longitude, snappedLatitude, snappedLongitude, geocodingStatus, routingStatus,
        sequence, distance, duration, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
        delivery.routingStatus ?? 'pending',
        delivery.sequence ?? null,
        delivery.distance ?? null,
        delivery.duration ?? null,
        delivery.status ?? 'pending',
      ],
    );
    return result.insertId ?? 0;
  }

  static getAllDeliveries(): DeliveryEntity[] {
    const db = this.getDb();
    const result = db.executeSync('SELECT * FROM deliveries;');
    const rows: DeliveryEntity[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows[i] as unknown as DeliveryEntity);
    }
    return rows;
  }

  static updateDeliveryStatus(id: number, status: DeliveryStatus): void {
    const db = this.getDb();
    db.executeSync('UPDATE deliveries SET status = ? WHERE id = ?;', [status, id]);
  }

  static updateDeliveryCoords(
    id: number,
    lat: number,
    lon: number,
    snappedLat?: number,
    snappedLon?: number,
  ): void {
    const db = this.getDb();
    db.executeSync(
      `UPDATE deliveries SET latitude = ?, longitude = ?, snappedLatitude = ?, snappedLongitude = ?, geocodingStatus = 'success' WHERE id = ?;`,
      [lat, lon, snappedLat ?? lat, snappedLon ?? lon, id],
    );
  }

  static clearDeliveries(): void {
    const db = this.getDb();
    db.executeSync('DELETE FROM deliveries;');
  }
}
