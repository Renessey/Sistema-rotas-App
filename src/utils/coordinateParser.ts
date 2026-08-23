/**
 * CoordinateParser — Utilitário de precisão matemática e importação de coordenadas geográficas.
 *
 * REGRAS CRÍTICAS:
 * 1. Preservação total de precisão (NUNCA usar Math.round, toFixed ou truncamento).
 * 2. Suporte a números e strings com ponto ou vírgula decimal ("-22.93584721" / "-22,93584721").
 * 3. Validação matemática rigorosa: Latitude [-90, +90], Longitude [-180, +180].
 * 4. Detecção de valores suspeitos como (0, 0).
 * 5. NUNCA inverter Latitude com Longitude.
 * 6. Ordem GeoJSON: [longitude, latitude]. Modelo/Banco: latitude, longitude.
 */

export interface ParsedCoordinate {
  value: number | null;
  rawValue: string | null;
  isValid: boolean;
  isSuspicious: boolean;
  errorReason?: string;
}

export interface CoordinatePairResult {
  latitude: number | null;
  longitude: number | null;
  rawLatitude: string | null;
  rawLongitude: string | null;
  isValid: boolean;
  isSuspicious: boolean;
  errorReason?: string;
}

export interface ImportConversionReport {
  totalRows: number;
  validCoordsCount: number;
  invalidCoordsCount: number;
  suspiciousCoordsCount: number;
  missingCoordsCount: number;
}

/**
 * Normaliza o nome da coluna para identificação de cabeçalhos sem tocar nos valores.
 */
export function normalizeColumnName(name: string): string {
  if (!name) return '';
  return String(name)
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Converte e valida estritamente um valor individual de coordenada (Latitude ou Longitude).
 */
export function parseCoordinateValue(
  val: unknown,
  type: 'latitude' | 'longitude',
): ParsedCoordinate {
  if (val === null || val === undefined) {
    return {
      value: null,
      rawValue: null,
      isValid: false,
      isSuspicious: false,
      errorReason: 'Valor nulo ou indefinido',
    };
  }

  const rawStr = String(val).trim();
  if (rawStr === '') {
    return {
      value: null,
      rawValue: rawStr,
      isValid: false,
      isSuspicious: false,
      errorReason: 'Valor vazio',
    };
  }

  // Substitui vírgula por ponto apenas se for formato decimal (ex: "-22,93584721" -> "-22.93584721")
  let cleanStr = rawStr;
  if (/^-?\d+,\d+$/.test(rawStr)) {
    cleanStr = rawStr.replace(',', '.');
  }

  const num = Number(cleanStr);

  if (isNaN(num) || !isFinite(num)) {
    return {
      value: null,
      rawValue: rawStr,
      isValid: false,
      isSuspicious: false,
      errorReason: 'Não é um número válido',
    };
  }

  // Validação matemática de limites
  if (type === 'latitude') {
    if (num < -90 || num > 90) {
      return {
        value: null,
        rawValue: rawStr,
        isValid: false,
        isSuspicious: false,
        errorReason: `Latitude fora do intervalo [-90, 90]: ${num}`,
      };
    }
  } else {
    if (num < -180 || num > 180) {
      return {
        value: null,
        rawValue: rawStr,
        isValid: false,
        isSuspicious: false,
        errorReason: `Longitude fora do intervalo [-180, 180]: ${num}`,
      };
    }
  }

  return {
    value: num,
    rawValue: rawStr,
    isValid: true,
    isSuspicious: num === 0,
  };
}

/**
 * Processa e valida um par de coordenadas (Latitude e Longitude) com verificação anti-inversão.
 */
export function parseCoordinatePair(
  rawLat: unknown,
  rawLon: unknown,
): CoordinatePairResult {
  const parsedLat = parseCoordinateValue(rawLat, 'latitude');
  const parsedLon = parseCoordinateValue(rawLon, 'longitude');

  if (!parsedLat.isValid || !parsedLon.isValid) {
    const reasons: string[] = [];
    if (!parsedLat.isValid && parsedLat.errorReason) reasons.push(`Lat: ${parsedLat.errorReason}`);
    if (!parsedLon.isValid && parsedLon.errorReason) reasons.push(`Lon: ${parsedLon.errorReason}`);

    return {
      latitude: null,
      longitude: null,
      rawLatitude: parsedLat.rawValue,
      rawLongitude: parsedLon.rawValue,
      isValid: false,
      isSuspicious: false,
      errorReason: reasons.join(' | ') || 'Coordenadas inválidas',
    };
  }

  const lat = parsedLat.value!;
  const lon = parsedLon.value!;
  const isSuspicious = lat === 0 && lon === 0;

  return {
    latitude: lat,
    longitude: lon,
    rawLatitude: parsedLat.rawValue,
    rawLongitude: parsedLon.rawValue,
    isValid: true,
    isSuspicious,
    errorReason: isSuspicious ? 'Coordenadas (0,0) suspeitas' : undefined,
  };
}

/**
 * Converte um par de coordenadas numéricas [lat, lon] para a convenção GeoJSON [longitude, latitude].
 */
export function toGeoJsonCoordinates(
  latitude: number,
  longitude: number,
): [number, number] {
  return [longitude, latitude];
}

/**
 * Identifica as colunas padrão na planilha segundo as regras oficiais da migração.
 */
export function detectStandardColumns(headers: string[]): {
  destinationCol?: string;
  bairroCol?: string;
  cityCol?: string;
  zipCodeCol?: string;
  latitudeCol?: string;
  longitudeCol?: string;
  pedidoCol?: string;
  phoneCol?: string;
  notesCol?: string;
} {
  const normMap = new Map<string, string>();
  headers.forEach((h) => normMap.set(normalizeColumnName(h), h));

  // 1. Latitude
  let latitudeCol: string | undefined;
  for (const h of headers) {
    const norm = normalizeColumnName(h);
    if (norm === 'latitude' || norm === 'lat' || norm.startsWith('lat')) {
      latitudeCol = h;
      break;
    }
  }

  // 2. Longitude
  let longitudeCol: string | undefined;
  for (const h of headers) {
    const norm = normalizeColumnName(h);
    if (
      norm === 'longitude' ||
      norm === 'long' ||
      norm === 'lng' ||
      norm === 'lon' ||
      norm.startsWith('long') ||
      norm.startsWith('lng') ||
      norm.startsWith('lon')
    ) {
      longitudeCol = h;
      break;
    }
  }

  // 3. Destination (Destino, Nome do cliente, Estabelecimento, etc.)
  let destinationCol: string | undefined;
  const destKeywords = [
    'destination',
    'destino',
    'destinatario',
    'nome',
    'cliente',
    'estabelecimento',
    'endereco',
    'destinationaddress',
  ];
  for (const h of headers) {
    if (h === latitudeCol || h === longitudeCol) continue;
    const norm = normalizeColumnName(h);
    if (destKeywords.some((k) => norm === k || norm.includes(k))) {
      destinationCol = h;
      break;
    }
  }

  // 4. Bairro
  let bairroCol: string | undefined;
  for (const h of headers) {
    if (h === latitudeCol || h === longitudeCol || h === destinationCol) continue;
    const norm = normalizeColumnName(h);
    if (norm === 'bairro' || norm.includes('bairro') || norm === 'neighborhood') {
      bairroCol = h;
      break;
    }
  }

  // 5. City / Cidade
  let cityCol: string | undefined;
  for (const h of headers) {
    if (h === latitudeCol || h === longitudeCol || h === destinationCol || h === bairroCol) continue;
    const norm = normalizeColumnName(h);
    if (norm === 'city' || norm === 'cidade' || norm === 'municipio') {
      cityCol = h;
      break;
    }
  }

  // 6. ZipCode / Postal Code / CEP
  let zipCodeCol: string | undefined;
  for (const h of headers) {
    if (
      h === latitudeCol ||
      h === longitudeCol ||
      h === destinationCol ||
      h === bairroCol ||
      h === cityCol
    )
      continue;
    const norm = normalizeColumnName(h);
    if (
      norm === 'zipcode' ||
      norm === 'postalcode' ||
      norm === 'cep' ||
      norm === 'codigopostal'
    ) {
      zipCodeCol = h;
      break;
    }
  }

  // 7. Pedido / Código
  let pedidoCol: string | undefined;
  for (const h of headers) {
    const norm = normalizeColumnName(h);
    if (norm.includes('pedido') || norm.includes('order') || norm.includes('codigo')) {
      pedidoCol = h;
      break;
    }
  }

  // 8. Telefone
  let phoneCol: string | undefined;
  for (const h of headers) {
    const norm = normalizeColumnName(h);
    if (
      norm.includes('telefone') ||
      norm.includes('phone') ||
      norm.includes('celular') ||
      norm.includes('whatsapp')
    ) {
      phoneCol = h;
      break;
    }
  }

  // 9. Notas / Obs
  let notesCol: string | undefined;
  for (const h of headers) {
    const norm = normalizeColumnName(h);
    if (norm.includes('obs') || norm.includes('nota') || norm.includes('notes')) {
      notesCol = h;
      break;
    }
  }

  return {
    destinationCol,
    bairroCol,
    cityCol,
    zipCodeCol,
    latitudeCol,
    longitudeCol,
    pedidoCol,
    phoneCol,
    notesCol,
  };
}
