import type { ColumnMappingConfig } from '../types/geo';

/** Normaliza texto removendo acentos, pontuação e espaços extras para comparação */
export function normalizeHeader(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Analisa os cabeçalhos encontrados na planilha e sugere o melhor mapeamento padrão
 * para o usuário confirmar ou ajustar no modal.
 */
export function guessMapping(
  headers: string[],
  _firstRow?: Record<string, unknown>,
): ColumnMappingConfig {
  let nameCol: string | undefined;
  const addressCols: string[] = [];
  let latitudeCol: string | undefined;
  let longitudeCol: string | undefined;
  let phoneCol: string | undefined;
  let orderCodeCol: string | undefined;
  let notesCol: string | undefined;

  // Palavras-chave ordenadas por prioridade
  const nameKeywords = ['nome', 'cliente', 'destinatario', 'razaosocial', 'estabelecimento', 'local', 'ponto', 'titulo'];
  const streetKeywords = ['endereco', 'rua', 'logradouro', 'destinationaddress', 'destinationadress', 'localizacao'];
  const numberKeywords = ['numero', 'num', 'n'];
  const neighborhoodKeywords = ['bairro', 'neighborhood'];
  const cityKeywords = ['cidade', 'municipio', 'city'];
  const stateKeywords = ['estado', 'uf', 'state'];
  const cepKeywords = ['cep', 'codigopostal', 'zipcode', 'zip'];
  const latKeywords = ['latitude', 'lat'];
  const lngKeywords = ['longitude', 'lng', 'long', 'lon'];
  const phoneKeywords = ['telefone', 'celular', 'tel', 'phone', 'whatsapp'];
  const orderKeywords = ['pedido', 'codigo', 'ordem', 'order', 'identificador'];
  const notesKeywords = ['observacao', 'observacoes', 'obs', 'complemento', 'notes', 'nota'];

  // 1. Identifica Nome / Título
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (nameKeywords.some((k) => norm.includes(k))) {
      nameCol = h;
      break;
    }
  }
  // Se não encontrou, usa a primeira coluna
  if (!nameCol && headers.length > 0) {
    nameCol = headers[0];
  }

  // 2. Identifica Latitude / Longitude
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (!latitudeCol && latKeywords.some((k) => norm === k || norm.startsWith('lat'))) {
      latitudeCol = h;
    }
    if (!longitudeCol && lngKeywords.some((k) => norm === k || norm.startsWith('lng') || norm.startsWith('long'))) {
      longitudeCol = h;
    }
  }

  // 3. Identifica Colunas de Endereço na ordem lógica de composição
  // IMPORTANTE: nameCol, latitudeCol e longitudeCol NUNCA devem fazer parte das colunas de endereço
  const matchedCols = new Set<string>();
  if (nameCol) matchedCols.add(nameCol);
  if (latitudeCol) matchedCols.add(latitudeCol);
  if (longitudeCol) matchedCols.add(longitudeCol);

  // a) Rua / Logradouro / Endereço principal
  for (const h of headers) {
    if (matchedCols.has(h)) continue;
    const norm = normalizeHeader(h);
    if (streetKeywords.some((k) => norm.includes(k))) {
      addressCols.push(h);
      matchedCols.add(h);
      break;
    }
  }

  // b) Número
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (numberKeywords.some((k) => norm === k || norm.startsWith('num')) && !matchedCols.has(h)) {
      addressCols.push(h);
      matchedCols.add(h);
      break;
    }
  }

  // c) Bairro
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (neighborhoodKeywords.some((k) => norm.includes(k)) && !matchedCols.has(h)) {
      addressCols.push(h);
      matchedCols.add(h);
      break;
    }
  }

  // d) Cidade
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (cityKeywords.some((k) => norm.includes(k)) && !matchedCols.has(h)) {
      addressCols.push(h);
      matchedCols.add(h);
      break;
    }
  }

  // e) Estado / UF
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (stateKeywords.some((k) => norm === k || norm.includes(k)) && !matchedCols.has(h)) {
      addressCols.push(h);
      matchedCols.add(h);
      break;
    }
  }

  // f) CEP
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (cepKeywords.some((k) => norm.includes(k)) && !matchedCols.has(h)) {
      addressCols.push(h);
      matchedCols.add(h);
      break;
    }
  }

  // Se nenhuma coluna de endereço padrão foi detectada, seleciona a primeira coluna com texto além do nome
  if (addressCols.length === 0 && headers.length > 1) {
    const fallback = headers.find((h) => h !== nameCol && h !== latitudeCol && h !== longitudeCol);
    if (fallback) addressCols.push(fallback);
  }

  // 4. Identifica Telefone, Pedido e Observações
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (!phoneCol && phoneKeywords.some((k) => norm.includes(k))) phoneCol = h;
    if (!orderCodeCol && orderKeywords.some((k) => norm.includes(k))) orderCodeCol = h;
    if (!notesCol && notesKeywords.some((k) => norm.includes(k)) && !matchedCols.has(h)) notesCol = h;
  }

  return {
    nameCol,
    addressCols,
    latitudeCol,
    longitudeCol,
    phoneCol,
    orderCodeCol,
    notesCol,
  };
}

/**
 * Concatena dinamicamente os valores das colunas selecionadas para formar a query de endereço
 */
export function buildAddressQuery(
  row: Record<string, any>,
  selectedCols: string[],
): string {
  if (!row || !selectedCols || selectedCols.length === 0) return '';

  const parts = selectedCols
    .map((col) => row[col])
    .filter((val) => val !== null && val !== undefined && String(val).trim() !== '')
    .map((val) => String(val).trim());

  return parts.join(', ');
}
