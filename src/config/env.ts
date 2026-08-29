declare const process: any;

import { MAPBOX_ACCESS_TOKEN as ENV_MAPBOX_TOKEN } from '@env';

function getDynamicEnv(): Record<string, string | undefined> {
  try {
    return require('@env') || {};
  } catch {
    return {};
  }
}

/**
 * Módulo central de variáveis de ambiente — 100% Mapbox.
 * As chaves são lidas a partir do arquivo .env via react-native-dotenv ou process.env.
 */
export const MAPBOX_ACCESS_TOKEN: string = (
  ENV_MAPBOX_TOKEN ||
  getDynamicEnv().MAPBOX_ACCESS_TOKEN ||
  (typeof process !== 'undefined' && process.env?.MAPBOX_ACCESS_TOKEN) ||
  ''
).trim();

export function getMapboxAccessToken(): string {
  const dynamicEnv = getDynamicEnv();
  const token = (
    MAPBOX_ACCESS_TOKEN ||
    dynamicEnv.MAPBOX_ACCESS_TOKEN ||
    (typeof process !== 'undefined' && process.env?.MAPBOX_ACCESS_TOKEN) ||
    ''
  ).trim();

  if (!token) {
    throw new Error(
      'Token MAPBOX_ACCESS_TOKEN não configurado no arquivo .env. Adicione MAPBOX_ACCESS_TOKEN=pk.eyJ... no seu .env.',
    );
  }
  return token;
}
