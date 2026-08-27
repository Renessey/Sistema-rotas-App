/**
 * AddressParser — Normalizador de texto e formatador de endereços brasileiros.
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

/** Padrões de complemento que devem ser removidos da query de busca visual */
const COMPLEMENT_NOISE: RegExp[] = [
  /\b(?:Aptos?|Apartamentos?|Apto|Ap|Sala|Salas|Conjunto|Conj|Bloco|Bl|Casa|Andar|Sobre\s*Loja|Sobreloja|Sobrado|Lote|Quadra|Qd|Lt)\.?\s*[\w\d-]+\b/gi,
  /\b(?:Aptos?|Apartamentos?|Apto|Ap|Sala|Salas|Conjunto|Conj|Bloco|Bl|Casa|Andar|Sobre\s*Loja|Sobreloja|Sobrado)\b/gi,
  /\bFundos\b/gi,
  /\bFds\b/gi,
  /\bKmm?\s*[\d,.]+\b/gi,
  /\bS\/N\b/gi,
  /\bS\.N\.\b/gi,
];

/** Estado: mapeia UF para nome completo */
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
  return String(value ?? '')
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

/** Remove ruídos de complemento */
export function stripComplementNoise(address: string): string {
  let result = address;
  for (const noise of COMPLEMENT_NOISE) {
    result = result.replace(noise, '').trim();
  }
  return result
    .replace(/,\s*,+/g, ',')
    .replace(/[-–—]\s*[-–—]+/g, '-')
    .replace(/[,\-–—\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai e formata CEP (retorna '00000-000' ou null) */
export function extractCep(value: string): string | null {
  if (!value) return null;
  const match = String(value).replace(/\D/g, '').match(/^(\d{5})(\d{3})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

/** Formata número de telefone brasileiro para E.164 (+55...) */
export function formatPhoneBR(phone: string): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
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
  result = expandAbbreviations(result);
  result = result.replace(/^.+?\s*[-–—:]\s*(?=(?:Rua|Avenida|Travessa|Estrada|Rodovia|Alameda|Praça|Parque|Largo|Beco|Vila|Servidão|Passarela|Passagem|Loteamento|Condomínio|Quadra|Setor|Doutor|Professor|Senador|Deputado)\b)/iu, '');
  const commercialPrefixes = /^(?:Comércio|Comercio|Mercado|Supermercado|Padaria|Farmácia|Farmacia|Drogaria|Loja|Posto|Bar|Restaurante|Oficina|Academia|Igreja|Escola|Colégio|Colegio|Açougue|Acougue|Pizzaria|Lanchonete|Depósito|Deposito|Bazar|Armazém|Armazem)\s+[^,-–—:]+[-–—:,]\s*/iu;
  result = result.replace(commercialPrefixes, '');
  result = stripComplementNoise(result);
  return result.trim();
}

/**
 * Verifica se dois endereços são substancialmente similares
 */
export function isSimilarAddress(a: string, b: string): boolean {
  const clean = (s: string) =>
    normalizeForSearch(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const ca = clean(a);
  const cb = clean(b);
  const shorter = Math.min(ca.length, cb.length);
  if (shorter === 0) return false;
  let matches = 0;
  for (let i = 0; i < shorter; i++) {
    if (ca[i] === cb[i]) matches++;
  }
  return matches / Math.max(ca.length, cb.length) > 0.85;
}

export interface AddressQueryParams {
  address?: string;
  number?: string;
  neighborhood?: string;
  bairro?: string;
  city?: string;
  state?: string;
  cep?: string;
}

export function buildAddressQuery(
  input: string | AddressQueryParams,
  bairro?: string | null,
  city?: string | null,
  state?: string | null,
  cep?: string | null,
): string {
  if (typeof input === 'object' && input !== null) {
    const cleanAddr = input.address ? sanitizeAddress(input.address) : '';
    const num = (input.number ?? '').trim();
    const hasValidNum = num && !/^s\/?n\.?$/i.test(num);
    const streetPart = hasValidNum ? `${cleanAddr}, ${num}` : cleanAddr;

    const neigh = (input.neighborhood || input.bairro || '').trim();
    const cityStr = (input.city || '').trim();
    const stateStr = (input.state || '').trim();
    const cepStr = input.cep ? (extractCep(input.cep) ?? input.cep.trim()) : '';

    const parts: string[] = [];
    if (streetPart) {
      if (neigh) {
        parts.push(`${streetPart} - ${neigh}`);
      } else {
        parts.push(streetPart);
      }
    } else if (neigh) {
      parts.push(neigh);
    }

    if (cityStr) {
      if (stateStr) {
        parts.push(`${cityStr} - ${stateStr}`);
      } else {
        parts.push(cityStr);
      }
    } else if (stateStr) {
      parts.push(stateStr);
    }

    if (cepStr) {
      parts.push(cepStr);
    }

    return parts.join(', ');
  }

  const parts: string[] = [];
  const cleanAddr = sanitizeAddress(input);
  if (cleanAddr) parts.push(cleanAddr);
  if (bairro) parts.push(bairro.trim());
  if (city) parts.push(city.trim());
  if (state) parts.push(state.trim());
  if (cep) parts.push(cep.trim());
  return parts.join(', ');
}

export const buildGoogleGeocodingQuery = buildAddressQuery;

