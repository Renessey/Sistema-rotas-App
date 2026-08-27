import * as XLSX from 'xlsx';
import { pick, keepLocalCopy, types } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import type { ColumnMappingConfig, DeliveryEntity } from '../../types/geo';
import { GeocodingService } from '../geocoding/GeocodingService';
import {
  parseCoordinatePair,
  detectStandardColumns,
  normalizeColumnName,
  ImportConversionReport,
} from '../../utils/coordinateParser';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
}

export interface GeocodingSnapProgress {
  current: number;
  total: number;
  geocodedCount: number;
  snappedCount: number;
  failedCount: number;
  currentAddress: string;
}

interface CsvOptions {
  separator: ',' | ';';
}

/** Simple CSV parser supporting quoted fields, CRLF, and BOM */
function parseCsv(text: string, separator: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === separator) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  // last field/row
  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/** Detects the CSV separator by counting delimiters on the first data line */
function detectSeparator(text: string): CsvOptions['separator'] {
  const firstLine = text.split('\n')[0] ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

/** Removes BOM and normalizes accents/whitespace */
function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/^\uFEFF/, '')
    .trim();
}

/**
 * ImportService — 100% Offline (Fases 3, 4, 5, 6, 7, 8).
 *
 * Lê planilhas XLSX e CSV sem internet, extrai as colunas oficiais:
 * Destination, Bairro, City, ZipCode/Postal Code, Latitude, Longitude, Pedido, Telefone.
 * Preserva integralmente a precisão das coordenadas e gera relatório de verificação.
 */
export class ImportService {
  static async pickAndParseSpreadsheet(): Promise<ParsedSpreadsheet | null> {
    try {
      const results = await pick({
        mode: 'import',
        allowMultiSelection: false,
        type: [types.xlsx, types.xls, types.csv, types.plainText],
      });

      if (!results || results.length === 0) return null;
      const file = results[0];

      // Copia para o cache local do app
      const copies = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: file.name ?? 'import.xlsx' }],
        destination: 'cachesDirectory',
      });
      const local = copies[0];
      if (local.status !== 'success' || !local.localUri) {
        throw new Error('Não foi possível copiar o arquivo selecionado.');
      }

      const localPath = local.localUri.replace(/^file:\/\//, '');
      const fileName = file.name ?? 'planilha.xlsx';
      const isCsv = fileName.toLowerCase().endsWith('.csv') || fileName.toLowerCase().endsWith('.txt');

      const rows = isCsv
        ? await ImportService.readCsv(localPath)
        : await ImportService.readWorkbook(localPath);

      if (rows.length === 0) return null;

      const headers = Object.keys(rows[0]).filter((h) => h && String(h).trim().length > 0);

      return {
        headers,
        rows,
        fileName,
      };
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'DOCUMENT_PICKER_CANCELED' || e?.code === 'OPERATION_CANCELED') {
        return null;
      }
      throw err;
    }
  }

  private static async readWorkbook(filePath: string): Promise<Record<string, unknown>[]> {
    const base64 = await RNFS.readFile(filePath, 'base64');
    const workbook = XLSX.read(base64, { type: 'base64' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: true, // lê valores brutos para evitar truncamento do xlsx
    });
  }

  private static async readCsv(filePath: string): Promise<Record<string, unknown>[]> {
    let text = await RNFS.readFile(filePath, 'utf8');
    text = text.replace(/^\uFEFF/, ''); // strip BOM
    const separator = detectSeparator(text);

    const rows = parseCsv(text, separator);
    if (rows.length < 2) return [];

    const headers = rows[0].map((h) => cleanText(h));
    const dataRows = rows.slice(1);

    return dataRows.map((cells) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, i) => {
        record[header] = cells[i] ?? '';
      });
      return record;
    });
  }

  /**
   * Converte linhas da planilha em DeliveryEntity aplicando detecção automática de colunas oficiais.
   */
  static normalizeRows(rows: Record<string, unknown>[]): {
    deliveries: Omit<DeliveryEntity, 'id'>[];
    report: ImportConversionReport;
  } {
    if (rows.length === 0) {
      return {
        deliveries: [],
        report: {
          totalRows: 0,
          validCoordsCount: 0,
          invalidCoordsCount: 0,
          suspiciousCoordsCount: 0,
          missingCoordsCount: 0,
        },
      };
    }

    const headers = Object.keys(rows[0]);
    const detected = detectStandardColumns(headers);

    return ImportService.processRowsWithCols(rows, detected);
  }

  /**
   * Converte linhas brutas da planilha usando mapeamento configurado ou detectado.
   */
  static applyMapping(
    rows: Record<string, unknown>[],
    mapping: ColumnMappingConfig,
  ): {
    deliveries: Omit<DeliveryEntity, 'id'>[];
    report: ImportConversionReport;
  } {
    return ImportService.processRowsWithCols(rows, {
      destinationCol: mapping.destinationCol || mapping.nameCol,
      bairroCol: mapping.bairroCol,
      cityCol: mapping.cityCol,
      zipCodeCol: mapping.zipCodeCol,
      latitudeCol: mapping.latitudeCol,
      longitudeCol: mapping.longitudeCol,
      pedidoCol: mapping.pedidoCol || mapping.orderCodeCol,
      phoneCol: mapping.phoneCol,
      notesCol: mapping.notesCol,
    });
  }

  private static processRowsWithCols(
    rows: Record<string, unknown>[],
    cols: {
      destinationCol?: string;
      bairroCol?: string;
      cityCol?: string;
      zipCodeCol?: string;
      latitudeCol?: string;
      longitudeCol?: string;
      pedidoCol?: string;
      phoneCol?: string;
      notesCol?: string;
    },
  ): {
    deliveries: Omit<DeliveryEntity, 'id'>[];
    report: ImportConversionReport;
  } {
    let validCoordsCount = 0;
    let invalidCoordsCount = 0;
    let suspiciousCoordsCount = 0;
    let missingCoordsCount = 0;

    const deliveries: Omit<DeliveryEntity, 'id'>[] = rows.map((row, index) => {
      // 1. Destination (Texto original preservado)
      const destination = cols.destinationCol && row[cols.destinationCol] !== undefined
        ? cleanText(row[cols.destinationCol])
        : `Entrega #${index + 1}`;

      // 2. Bairro (Texto original preservado)
      const bairro = cols.bairroCol && row[cols.bairroCol] !== undefined
        ? cleanText(row[cols.bairroCol])
        : '';

      // 3. City (Texto original preservado)
      const city = cols.cityCol && row[cols.cityCol] !== undefined
        ? cleanText(row[cols.cityCol])
        : '';

      // 4. ZipCode / Postal Code (Sem duplicar)
      let zipCode = '';
      if (cols.zipCodeCol && row[cols.zipCodeCol] !== undefined) {
        zipCode = cleanText(row[cols.zipCodeCol]);
      }

      // 5. Coordenadas brutas
      const rawLat = cols.latitudeCol ? row[cols.latitudeCol] : undefined;
      const rawLon = cols.longitudeCol ? row[cols.longitudeCol] : undefined;

      // 6. Conversão e validação exata
      const coordResult = parseCoordinatePair(rawLat, rawLon);

      if (rawLat === undefined || rawLon === undefined || rawLat === '' || rawLon === '') {
        missingCoordsCount++;
      } else if (coordResult.isValid) {
        validCoordsCount++;
        if (coordResult.isSuspicious) suspiciousCoordsCount++;
      } else {
        invalidCoordsCount++;
      }

      // 7. Pedido, Telefone, Notas
      const pedido = cols.pedidoCol && row[cols.pedidoCol] !== undefined
        ? cleanText(row[cols.pedidoCol])
        : null;

      const telefone = cols.phoneCol && row[cols.phoneCol] !== undefined
        ? cleanText(row[cols.phoneCol])
        : null;

      const notes = cols.notesCol && row[cols.notesCol] !== undefined
        ? cleanText(row[cols.notesCol])
        : null;

      return {
        destination: destination || `Entrega #${index + 1}`,
        bairro,
        city,
        zipCode,
        latitude: coordResult.latitude,
        longitude: coordResult.longitude,
        rawLatitude: coordResult.rawLatitude,
        rawLongitude: coordResult.rawLongitude,
        pedido,
        telefone,
        status: coordResult.isValid ? 'pending' : 'invalid_coords',
        ordem: index + 1,
        distancia: null,
        tempoEstimado: null,
        failReason: coordResult.isValid ? null : 'wrong_address',
        notes: coordResult.errorReason ? `Aviso: ${coordResult.errorReason}${notes ? ' | ' + notes : ''}` : notes,
        deliveredAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        originalData: JSON.stringify(row),
        name: destination || `Entrega #${index + 1}`,
        address: [destination, bairro, city].filter(Boolean).join(' - '),
        phone: telefone || '',
        orderCode: pedido || '',
        sequence: index + 1,
      };
    });

    return {
      deliveries,
      report: {
        totalRows: rows.length,
        validCoordsCount,
        invalidCoordsCount,
        suspiciousCoordsCount,
        missingCoordsCount,
      },
    };
  }

  /**
   * Geolocaliza registros sem coordenadas (via Geocoding) e alinha TODOS os pontos à malha viária (via Snap v2).
   */
  static async geolocalizeAndSnapDeliveries(
    deliveries: Omit<DeliveryEntity, 'id'>[],
    onProgress?: (progress: GeocodingSnapProgress) => void,
  ): Promise<{
    deliveries: Omit<DeliveryEntity, 'id'>[];
    geocodedCount: number;
    snappedCount: number;
    failedCount: number;
  }> {
    let geocodedCount = 0;
    let snappedCount = 0;
    let failedCount = 0;
    const enriched: Omit<DeliveryEntity, 'id'>[] = [];

    for (let i = 0; i < deliveries.length; i++) {
      const d = deliveries[i];
      onProgress?.({
        current: i + 1,
        total: deliveries.length,
        geocodedCount,
        snappedCount,
        failedCount,
        currentAddress: d.destination || d.address || `Entrega #${i + 1}`,
      });

      try {
        const res = await GeocodingService.geocodeAndSnapDelivery(d);
        if (res && res.latitude !== null && res.longitude !== null) {
          const wasGeocoded = d.latitude === null || d.longitude === null;
          if (wasGeocoded) geocodedCount++;
          if (res.snappedLatitude && res.snappedLongitude) snappedCount++;

          enriched.push({
            ...d,
            latitude: res.latitude,
            longitude: res.longitude,
            snappedLatitude: res.snappedLatitude,
            snappedLongitude: res.snappedLongitude,
            status: 'pending',
            failReason: null,
            address: res.formattedAddress || d.address,
            destination: d.destination || res.formattedAddress || d.address || '',
          });
        } else {
          failedCount++;
          enriched.push(d);
        }
      } catch (err) {
        console.warn(`[ImportService] Falha ao geocodificar/alinhar entrega ${i + 1}:`, err);
        failedCount++;
        enriched.push(d);
      }
    }

    return {
      deliveries: enriched,
      geocodedCount,
      snappedCount,
      failedCount,
    };
  }
}
