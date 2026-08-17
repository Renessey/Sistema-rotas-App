import * as XLSX from 'xlsx';
import { pick, keepLocalCopy, types } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import type { DeliveryEntity } from '../../types/geo';

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
function normalizeText(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * ImportService — Phases 8 & 9.
 * - picks .xlsx / .csv files
 * - reads workbook / detects CSV encoding, separator and header
 * - auto-detects columns and normalizes into DeliveryEntity rows
 */
export class ImportService {
  static async pickAndReadSpreadsheet(): Promise<Record<string, unknown>[]> {
    try {
      const results = await pick({
        mode: 'import',
        allowMultiSelection: false,
        type: [types.xlsx, types.xls, types.csv, types.plainText],
      });

      if (!results || results.length === 0) return [];
      const file = results[0];

      // Copy to app cache so we can read the file reliably
      const copies = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: file.name ?? 'import.xlsx' }],
        destination: 'cachesDirectory',
      });
      const local = copies[0];
      if (local.status !== 'success' || !local.localUri) {
        throw new Error('Não foi possível copiar o arquivo selecionado.');
      }

      // keepLocalCopy returns a file:// URI; RNFS expects a plain path
      const localPath = local.localUri.replace(/^file:\/\//, '');

      const fileName = (file.name ?? '').toLowerCase();
      if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
        return ImportService.readCsv(localPath);
      }
      return ImportService.readWorkbook(localPath);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'DOCUMENT_PICKER_CANCELED' || e?.code === 'OPERATION_CANCELED') {
        return [];
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
    });
  }

  private static async readCsv(filePath: string): Promise<Record<string, unknown>[]> {
    let text = await RNFS.readFile(filePath, 'utf8');
    text = text.replace(/^\uFEFF/, ''); // strip BOM (UTF-8)
    const separator = detectSeparator(text);

    const rows = parseCsv(text, separator);
    if (rows.length < 2) return [];

    const headers = rows[0].map((h) => normalizeText(h));
    const dataRows = rows.slice(1);

    return dataRows.map((cells) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, i) => {
        record[header] = cells[i] ?? '';
      });
      return record;
    });
  }

  /** Normalizes spreadsheet columns into DeliveryEntity rows (auto-detect headers). */
  static normalizeRows(rows: Record<string, unknown>[]): Omit<DeliveryEntity, 'id'>[] {
    return rows.map((row) => {
      const normalized: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(row)) {
        const cleanKey = normalizeText(String(key)).toLowerCase();
        const stringVal = val !== undefined && val !== null ? String(val).trim() : '';

        if (cleanKey.includes('nome') || cleanKey.includes('cliente')) normalized.name = stringVal;
        else if (cleanKey.includes('endereco') || cleanKey.includes('rua') || cleanKey.includes('logradouro'))
          normalized.address = stringVal;
        else if (cleanKey === 'numero' || cleanKey.includes('nº') || cleanKey.includes('num'))
          normalized.number = stringVal;
        else if (cleanKey.includes('complemento') || cleanKey === 'comp') normalized.complement = stringVal;
        else if (cleanKey.includes('bairro')) normalized.neighborhood = stringVal;
        else if (cleanKey.includes('cidade') || cleanKey.includes('municipio')) normalized.city = stringVal;
        else if (cleanKey.includes('estado') || cleanKey === 'uf') normalized.state = stringVal;
        else if (cleanKey.includes('cep') || cleanKey.includes('codigo postal')) normalized.cep = stringVal;
        else if (cleanKey.includes('telefone') || cleanKey.includes('celular') || cleanKey === 'tel')
          normalized.phone = stringVal;
        else if (cleanKey.includes('pedido') || cleanKey.includes('codigo da entrega') || cleanKey.includes('order'))
          normalized.orderCode = stringVal;
        else if (cleanKey.includes('latitude') || cleanKey.includes('lat')) {
          const num = parseFloat(stringVal.replace(',', '.'));
          normalized.latitude = !isNaN(num) ? num : null;
        } else if (cleanKey.includes('longitude') || cleanKey.includes('lon') || cleanKey.includes('lng')) {
          const num = parseFloat(stringVal.replace(',', '.'));
          normalized.longitude = !isNaN(num) ? num : null;
        }
      }

      const hasCoords =
        typeof normalized.latitude === 'number' && typeof normalized.longitude === 'number';

      return {
        name: (normalized.name as string) || 'Cliente sem nome',
        address: (normalized.address as string) || '',
        number: (normalized.number as string) || '',
        complement: (normalized.complement as string) || '',
        neighborhood: (normalized.neighborhood as string) || '',
        city: (normalized.city as string) || 'Maricá',
        state: (normalized.state as string) || 'RJ',
        cep: (normalized.cep as string) || '',
        phone: (normalized.phone as string) || '',
        orderCode: (normalized.orderCode as string) || '',
        latitude: hasCoords ? (normalized.latitude as number) : null,
        longitude: hasCoords ? (normalized.longitude as number) : null,
        snappedLatitude: null,
        snappedLongitude: null,
        geocodingStatus: hasCoords ? 'success' : 'pending',
        routingStatus: 'pending',
        sequence: null,
        distance: null,
        duration: null,
        status: 'pending',
      };
    });
  }
}
