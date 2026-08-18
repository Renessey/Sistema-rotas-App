/**
 * AddressParser — Normalizador avançado de endereços brasileiros.
 *
 * Funções principais:
 *  - Expansão de abreviações ("R." → "Rua", "Av." → "Avenida", etc.)
 *  - Remoção de ruídos de complemento que travam geocoders
 *  - Extração e normalização de CEPs
 *  - Geração de queries estruturadas para Nominatim
 */

/** Mapeamento de abreviações comuns em endereços brasileiros */
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bR\.\s*/i, 'Rua '],
  [/\bAv\.\s*/i, 'Avenida '],
  [/\bTrav\.\s*/i, 'Travessa '],
  [/\bEstr\.\s*/i, 'Estrada '],
  [/\bRod\.\s*/i, 'Rodovia '],
  [/\bAl\.\s*/i, 'Alameda '],
  [/\bPça\.\s*/i, 'Praça '],
  [/\bPca\.\s*/i, 'Praça '],
  [/\bPq\.\s*/i, 'Parque '],
  [/\bLot\.\s*/i, 'Loteamento '],
  [/\bCond\.\s*/i, 'Condomínio '],
  [/\bVl\.\s*/i, 'Vila '],
  [/\bJd\.\s*/i, 'Jardim '],
  [/\bBl\.\s*/i, 'Bloco '],
  [/\bRes\.\s*/i, 'Residencial '],
  [/\bSt\.\s*/i, 'Setor '],
  [/\bDr\.\s*/i, 'Doutor '],
  [/\bProf\.\s*/i, 'Professor '],
  [/\bSen\.\s*/i, 'Senador '],
  [/\bDep\.\s*/i, 'Deputado '],
];

/** Padrões de complemento que devem ser removidos da query de geocodificação */
const COMPLEMENT_NOISE: RegExp[] = [
  /\bAptos?\b.*/i,
  /\bApartamentos?\b.*/i,
  /\bAndar\b.*/i,
  /\bSala\b.*/i,
  /\bBloco\s+[A-Z0-9]+\b/i,
  /\bBl\s+[A-Z0-9]+\b/i,
  /\bCasa\s+\d+\b/i,
  /\bFundos\b/i,
  /\bSobre Loja\b/i,
  /\bSobrado\b/i,
  /\bKmm?\s*[\d,.]+\b/i,
  /\bS\/N\b/i,    // sem número — removido p/ melhorar busca
  /\bS\.N\.\b/i,
];

/** Estado: mapeia UF para nome completo e vice-versa */
const STATE_MAP: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

/** Remove BOM, normaliza espaços e diacríticos para comparações */
export function normalizeForSearch(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Expande abreviações de logradouro */
export function expandAbbreviations(address: string): string {
  let result = address;
  for (const [pattern, replacement] of ABBREVIATIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Remove ruídos de complemento para uso em geocoders */
export function stripComplementNoise(address: string): string {
  let result = address;
  for (const noise of COMPLEMENT_NOISE) {
    result = result.replace(noise, '').trim();
  }
  // Remove vírgulas/traços soltos no final
  return result.replace(/[,\-–\s]+$/, '').trim();
}

/** Extrai e formata CEP (retorna '00000-000' ou null) */
export function extractCep(value: string): string | null {
  const match = value.replace(/\D/g, '').match(/^(\d{5})(\d{3})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

/** Formata número de telefone brasileiro para E.164 (+55...) */
export function formatPhoneBR(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `+55${digits}`;
  if (digits.length === 10) return `+55${digits}`;
  if (digits.length === 13 && digits.startsWith('55')) return `+${digits}`;
  return null;
}

/** Retorna o nome completo do estado a partir da UF */
export function stateNameFromUf(uf: string): string {
  return STATE_MAP[uf.toUpperCase().trim()] ?? uf;
}

/**
 * Constrói a query de endereço mais limpa possível para geocodificação.
 * Expande abreviações e remove ruídos de complemento.
 */
export function buildGeocodingQuery(params: {
  address: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
}): string {
  const street = stripComplementNoise(expandAbbreviations(params.address));
  const number = params.number && !params.number.match(/s\/n/i) ? params.number : '';
  const neighborhood = params.neighborhood ?? '';
  const city = params.city ?? '';
  const state = params.state ? (STATE_MAP[params.state.toUpperCase()] ?? params.state) : '';

  const parts = [
    number ? `${street}, ${number}` : street,
    neighborhood,
    city,
    state,
    'Brasil',
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Verifica se dois endereços são substancialmente similares
 * (para deduplicação tolerante a erros de digitação).
 */
export function isSimilarAddress(a: string, b: string): boolean {
  const clean = (s: string) =>
    normalizeForSearch(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const ca = clean(a);
  const cb = clean(b);
  // Same if 85%+ characters match (Jaccard-like)
  const shorter = Math.min(ca.length, cb.length);
  if (shorter === 0) return false;
  let matches = 0;
  for (let i = 0; i < shorter; i++) {
    if (ca[i] === cb[i]) matches++;
  }
  return matches / Math.max(ca.length, cb.length) > 0.85;
}
