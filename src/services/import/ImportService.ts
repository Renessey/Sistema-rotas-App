import * as XLSX from 'xlsx';
import { pick, keepLocalCopy, types } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import type { ColumnMappingConfig, DeliveryEntity } from '../../types/geo';
import { buildAddressQuery } from '../../utils/columnMappingHeuristics';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
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
  static async pickAndParseSpreadsheet(): Promise<ParsedSpreadsheet | null> {
    try {
      const results = await pick({
        mode: 'import',
        allowMultiSelection: false,
        type: [types.xlsx, types.xls, types.csv, types.plainText],
      });

      if (!results || results.length === 0) return null;
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

  static async pickAndReadSpreadsheet(): Promise<Record<string, unknown>[]> {
    const parsed = await ImportService.pickAndParseSpreadsheet();
    return parsed ? parsed.rows : [];
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

        if (cleanKey.includes('nome') || cleanKey.includes('cliente') || cleanKey.includes('destinatario') || cleanKey.includes('razao'))
          normalized.name = stringVal;
        else if (cleanKey.includes('endereco') || cleanKey.includes('rua') || cleanKey.includes('logradouro') || cleanKey.includes('destination adress') || cleanKey.includes('destination address'))
          normalized.address = stringVal;
        else if (cleanKey === 'numero' || cleanKey.includes('nº') || cleanKey.includes('num'))
          normalized.number = stringVal;
        else if (cleanKey.includes('complemento') || cleanKey === 'comp') normalized.complement = stringVal;
        else if (cleanKey.includes('bairro') || cleanKey.includes('neighborhood')) normalized.neighborhood = stringVal;
        else if (cleanKey.includes('cidade') || cleanKey.includes('municipio') || cleanKey.includes('city')) normalized.city = stringVal;
        else if (cleanKey.includes('estado') || cleanKey === 'uf') normalized.state = stringVal;
        else if (cleanKey.includes('cep') || cleanKey.includes('codigo postal') || cleanKey.includes('zipcode') || cleanKey.includes('zip')) normalized.cep = stringVal;
        else if (cleanKey.includes('telefone') || cleanKey.includes('celular') || cleanKey === 'tel' || cleanKey.includes('phone') || cleanKey.includes('whatsapp'))
          normalized.phone = stringVal;
        else if (cleanKey.includes('pedido') || cleanKey.includes('codigo da entrega') || cleanKey.includes('order') || cleanKey.includes('codigo'))
          normalized.orderCode = stringVal;
        else if (cleanKey.includes('sequence') || cleanKey.includes('sequencia')) {
          const num = parseInt(stringVal, 10);
          normalized.sequence = !isNaN(num) ? num : null;
        }
        else if (cleanKey.includes('observacao') || cleanKey.includes('obs') || cleanKey.includes('nota') || cleanKey.includes('notes') || cleanKey.includes('corridor cage')) {
          normalized.notes = stringVal;
        }
        else if (cleanKey === 'latitude' || cleanKey === 'lat' || cleanKey.startsWith('lat_') || cleanKey.startsWith('latitude') || cleanKey.includes('latitude') || cleanKey === 'latitud') {
          const num = parseFloat(stringVal.replace(',', '.').trim());
          if (!isNaN(num) && num >= -90 && num <= 90) normalized.latitude = num;
        } else if (cleanKey === 'longitude' || cleanKey === 'lon' || cleanKey === 'lng' || cleanKey === 'long' || cleanKey.startsWith('lng_') || cleanKey.startsWith('lon_') || cleanKey.startsWith('long_') || cleanKey.startsWith('longitude') || cleanKey.includes('longitude') || cleanKey === 'longitud') {
          const num = parseFloat(stringVal.replace(',', '.').trim());
          if (!isNaN(num) && num >= -180 && num <= 180) normalized.longitude = num;
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
        city: (normalized.city as string) || '',
        state: (normalized.state as string) || '',
        cep: (normalized.cep as string) || '',
        phone: (normalized.phone as string) || '',
        orderCode: (normalized.orderCode as string) || '',
        latitude: hasCoords ? (normalized.latitude as number) : null,
        longitude: hasCoords ? (normalized.longitude as number) : null,
        snappedLatitude: null,
        snappedLongitude: null,
        geocodingStatus: hasCoords ? 'success' : 'pending',
        geocodingSource: hasCoords ? 'spreadsheet' : null,
        routingStatus: 'pending',
        sequence: (normalized.sequence as number) ?? null,
        distance: null,
        duration: null,
        status: 'pending',
        failReason: null,
        notes: (normalized.notes as string) || null,
        deliveredAt: null,
        createdAt: Date.now(),
        originalData: JSON.stringify(row),
      };
    });
  }

  /**
   * Converte as linhas brutas da planilha em DeliveryEntity usando o mapeamento configurado pelo usuário.
   */
  static applyMapping(
    rows: Record<string, unknown>[],
    mapping: ColumnMappingConfig,
  ): Omit<DeliveryEntity, 'id'>[] {
    return rows.map((row, index) => {
      // Nome/Título: Usado APENAS como label/marcador no mapa
      const name = mapping.nameCol && row[mapping.nameCol] !== undefined
        ? String(row[mapping.nameCol] ?? '').trim()
        : '';

      // Endereço: Extraído EXCLUSIVAMENTE das colunas de endereço (nome NUNCA entra na URL de geocodificação)
      const cleanAddressCols = (mapping.addressCols || []).filter(
        (col) => col !== mapping.nameCol && col !== mapping.latitudeCol && col !== mapping.longitudeCol,
      );
      const addressQuery = buildAddressQuery(row, cleanAddressCols);

      let lat: number | null = null;
      let lng: number | null = null;

      if (mapping.latitudeCol && row[mapping.latitudeCol] !== undefined && row[mapping.latitudeCol] !== null) {
        const parsedLat = parseFloat(String(row[mapping.latitudeCol]).replace(',', '.').trim());
        if (!isNaN(parsedLat) && parsedLat >= -90 && parsedLat <= 90) lat = parsedLat;
      }

      if (mapping.longitudeCol && row[mapping.longitudeCol] !== undefined && row[mapping.longitudeCol] !== null) {
        const parsedLng = parseFloat(String(row[mapping.longitudeCol]).replace(',', '.').trim());
        if (!isNaN(parsedLng) && parsedLng >= -180 && parsedLng <= 180) lng = parsedLng;
      }

      const phone = mapping.phoneCol && row[mapping.phoneCol] !== undefined
        ? String(row[mapping.phoneCol] ?? '').trim()
        : '';

      const orderCode = mapping.orderCodeCol && row[mapping.orderCodeCol] !== undefined
        ? String(row[mapping.orderCodeCol] ?? '').trim()
        : '';

      const notes = mapping.notesCol && row[mapping.notesCol] !== undefined
        ? String(row[mapping.notesCol] ?? '').trim()
        : null;

      const hasCoords = lat !== null && lng !== null && (lat !== 0 || lng !== 0);

      return {
        name: name || `Entrega #${index + 1}`,
        address: addressQuery,
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        cep: '',
        phone,
        orderCode,
        latitude: hasCoords ? lat : null,
        longitude: hasCoords ? lng : null,
        snappedLatitude: null,
        snappedLongitude: null,
        geocodingStatus: hasCoords ? 'success' : 'pending',
        geocodingSource: hasCoords ? 'spreadsheet' : null,
        routingStatus: 'pending',
        sequence: index + 1,
        distance: null,
        duration: null,
        status: 'pending',
        failReason: null,
        notes: notes || null,
        deliveredAt: null,
        createdAt: Date.now(),
        originalData: JSON.stringify(row),
      };
    });
  }
}

