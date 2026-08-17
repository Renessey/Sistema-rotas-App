import type { DeliveryEntity } from '../../types/geo';

export interface ValidationResult {
  valid: DeliveryEntity[];
  withoutAddress: DeliveryEntity[];
  withoutCep: DeliveryEntity[];
  duplicates: DeliveryEntity[];
  emptyRows: DeliveryEntity[];
  total: number;
}

/**
 * Validates imported deliveries before routing starts.
 * - validates name, address, city, CEP
 * - validates latitude/longitude when present
 * - detects duplicates and empty rows
 */
export class ValidationService {
  static validate(rows: Omit<DeliveryEntity, 'id'>[]): ValidationResult {
    const valid: DeliveryEntity[] = [];
    const withoutAddress: DeliveryEntity[] = [];
    const withoutCep: DeliveryEntity[] = [];
    const duplicates: DeliveryEntity[] = [];
    const emptyRows: DeliveryEntity[] = [];

    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const entity: DeliveryEntity = { ...row, id: index + 1 };

      const isEmpty =
        !entity.name &&
        !entity.address &&
        !entity.city &&
        !entity.cep &&
        !entity.phone &&
        !entity.orderCode;

      if (isEmpty) {
        emptyRows.push(entity);
        return;
      }

      if (!entity.address) {
        withoutAddress.push(entity);
        return;
      }

      if (!entity.cep) {
        withoutCep.push(entity);
        return;
      }

      // Validate coordinates when present
      if (entity.latitude !== null && entity.longitude !== null) {
        const latValid = entity.latitude >= -90 && entity.latitude <= 90;
        const lngValid = entity.longitude >= -180 && entity.longitude <= 180;
        if (!latValid || !lngValid) {
          withoutAddress.push(entity); // treat invalid coords as needing geocoding
          return;
        }
      }

      // Duplicate detection (by normalized address + city)
      const key = `${entity.address.toLowerCase().trim()}|${entity.city?.toLowerCase().trim()}`;
      if (seen.has(key)) {
        duplicates.push(entity);
        return;
      }
      seen.add(key);

      valid.push(entity);
    });

    return {
      valid,
      withoutAddress,
      withoutCep,
      duplicates,
      emptyRows,
      total: rows.length,
    };
  }
}
