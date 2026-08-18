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
 *
 * Regras (em ordem de prioridade):
 *   1. Linhas completamente vazias → emptyRows
 *   2. Sem endereço E sem coordenadas → withoutAddress
 *   3. Sem CEP → withoutCep (MAS ainda são salvas como "válidas" com geocodingStatus=pending)
 *   4. Coordenadas presentes mas inválidas → withoutAddress
 *   5. Duplicatas detectadas por normalização → duplicates
 *   6. Demais → valid
 *
 * NOTA: Entregas sem CEP agora são aceitas e tentam geocodificação por endereço.
 * Nenhuma entrega com endereço é descartada — sempre vai para o banco p/ resolução manual.
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

      // 1. Linha completamente vazia
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

      // 2. Sem endereço E sem coordenadas (pode geocodificar apenas com CEP)
      const hasAddress = !!entity.address;
      const hasCep = !!entity.cep;
      const hasCoords =
        entity.latitude !== null && entity.longitude !== null &&
        entity.latitude !== undefined && entity.longitude !== undefined;

      if (!hasAddress && !hasCep && !hasCoords) {
        withoutAddress.push(entity);
        return;
      }

      // 3. Valida coordenadas se presentes
      if (hasCoords) {
        const latValid = entity.latitude! >= -90 && entity.latitude! <= 90;
        const lngValid = entity.longitude! >= -180 && entity.longitude! <= 180;
        if (!latValid || !lngValid) {
          entity.latitude = null;
          entity.longitude = null;
          entity.geocodingStatus = 'pending';
        }
      }

      // 4. Sem CEP: aceita mas registra
      if (!hasCep && !hasCoords) {
        withoutCep.push({ ...entity }); // registra no relatório
        // MAS ainda adiciona ao valid para tentar geocodificar por endereço
        valid.push(entity);
        return;
      }

      // 5. Duplicata (por endereço + número + cidade normalizado)
      const key = [
        (entity.address ?? '').toLowerCase().trim().replace(/\s+/g, ' '),
        (entity.number ?? '').trim(),
        (entity.city ?? '').toLowerCase().trim(),
      ].join('|');

      if (seen.has(key)) {
        duplicates.push(entity);
        return; // duplicatas são descartadas
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
