import type { DeliveryEntity } from '../../types/geo';

export interface ValidationResult {
  valid: DeliveryEntity[];
  withoutCoords: DeliveryEntity[];
  duplicates: DeliveryEntity[];
  emptyRows: DeliveryEntity[];
  total: number;
}

/**
 * ValidationService — Validação 100% Offline das entregas.
 */
export class ValidationService {
  static validate(rows: Omit<DeliveryEntity, 'id'>[]): ValidationResult {
    const valid: DeliveryEntity[] = [];
    const withoutCoords: DeliveryEntity[] = [];
    const duplicates: DeliveryEntity[] = [];
    const emptyRows: DeliveryEntity[] = [];

    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const entity: DeliveryEntity = { ...row, id: index + 1 };

      // 1. Linha vazia
      const isEmpty =
        !entity.destination &&
        !entity.bairro &&
        !entity.city &&
        !entity.zipCode &&
        entity.latitude === null &&
        entity.longitude === null;

      if (isEmpty) {
        emptyRows.push(entity);
        return;
      }

      // 2. Sem coordenadas válidas
      const hasCoords =
        entity.latitude !== null &&
        entity.longitude !== null &&
        entity.latitude !== undefined &&
        entity.longitude !== undefined;

      if (!hasCoords || entity.status === 'invalid_coords') {
        withoutCoords.push(entity);
        return;
      }

      // 3. Duplicata por destino + coordenadas
      const key = [
        (entity.destination ?? '').toLowerCase().trim(),
        entity.latitude,
        entity.longitude,
      ].join('|');

      if (seen.has(key)) {
        duplicates.push(entity);
        return;
      }
      seen.add(key);

      valid.push(entity);
    });

    return {
      valid,
      withoutCoords,
      duplicates,
      emptyRows,
      total: rows.length,
    };
  }
}
