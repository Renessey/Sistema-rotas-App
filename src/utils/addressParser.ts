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
 * Sanitiza o endereço removendo nomes de fantasia, marcas e ruídos de estabelecimentos comerciais.
 */
export function sanitizeAddress(address: string): string {
  if (!address) return '';
  let result = address.trim();

  // 1. Expande abreviações primeiro (ex: "R." -> "Rua ", "Av." -> "Avenida ")
  result = expandAbbreviations(result);

  // 2. Remove prefixos de estabelecimentos/fantasia separados por traço, dois pontos ou vírgula antes do tipo de logradouro
  // Ex: "Padaria Estrela - Rua Dom Pedro II", "Comércio Silva - Avenida Brasil", "Loja 10: Rua X"
  result = result.replace(/^.+?\s*[-–—:]\s*(?=(?:Rua|Avenida|Travessa|Estrada|Rodovia|Alameda|Praça|Parque|Largo|Beco|Vila|Servidão|Passarela|Passagem|Loteamento|Condomínio|Quadra|Setor|Doutor|Professor|Senador|Deputado)\b)/iu, '');

  // 3. Remove prefixos de tipos de comércio comuns mesmo sem tipo de logradouro explícito
  const commercialPrefixes = /^(?:Comércio|Comercio|Mercado|Supermercado|Padaria|Farmácia|Farmacia|Drogaria|Loja|Posto|Bar|Restaurante|Oficina|Academia|Igreja|Escola|Colégio|Colegio|Açougue|Acougue|Pizzaria|Lanchonete|Depósito|Deposito|Bazar|Armazém|Armazem)\s+[^,-–—:]+[-–—:,]\s*/iu;
  result = result.replace(commercialPrefixes, '');

  // 4. Remove ruídos de complemento (Apto, Bloco, Sala, etc.)
  result = stripComplementNoise(result);

  return result.trim();
}

/**
 * Monta a query para o Google Geocoding API no formato hierárquico:
 * `${rua}, ${numero} - ${bairro}, ${cidade} - ${uf}, ${cep}`
 */
export function buildGoogleGeocodingQuery(params: {
  address: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
}): string {
  const street = sanitizeAddress(params.address);
  const rawNumber = (params.number ?? '').trim();
  const number = rawNumber && !rawNumber.match(/^(?:s\/n|sem\s+n(?:[úu]mero)?|0)$/i) ? rawNumber : '';
  const neighborhood = (params.neighborhood ?? '').trim();
  const city = (params.city ?? '').trim();
  const rawState = (params.state ?? '').trim().toUpperCase();
  const state = rawState.length === 2 ? rawState : (STATE_MAP[rawState] ? rawState : (Object.keys(STATE_MAP).find(k => STATE_MAP[k].toUpperCase() === rawState) ?? rawState));
  const cleanCep = params.cep ? extractCep(params.cep) || params.cep.replace(/\D/g, '') : '';

  // Formatação hierárquica: ${rua}, ${numero} - ${bairro}, ${cidade} - ${uf}, ${cep}
  const streetWithNumber = number ? `${street}, ${number}` : street;
  
  let result = streetWithNumber;
  if (neighborhood) {
    result = result ? `${result} - ${neighborhood}` : neighborhood;
  }
  
  if (city || state) {
    const cityState = [city, state].filter(Boolean).join(' - ');
    result = result ? `${result}, ${cityState}` : cityState;
  }

  if (cleanCep) {
    result = result ? `${result}, ${cleanCep}` : cleanCep;
  }

  return result;
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
  return buildGoogleGeocodingQuery(params);
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
