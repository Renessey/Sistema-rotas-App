import { GOOGLE_MAPS_API_KEY as ENV_GOOGLE_KEY } from '@env';

/**
 * Módulo central de variáveis de ambiente.
 * A chave é lida estritamente a partir do arquivo .env via react-native-dotenv ou process.env.
 */
export const GOOGLE_MAPS_API_KEY: string = (
  ENV_GOOGLE_KEY ||
  (typeof process !== 'undefined' && process.env?.GOOGLE_MAPS_API_KEY) ||
  ''
).trim();

export function getGoogleMapsApiKey(): string {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(
      'Chave GOOGLE_MAPS_API_KEY não configurada no arquivo .env. Por favor, adicione GOOGLE_MAPS_API_KEY=sua_chave no arquivo .env.',
    );
  }
  return GOOGLE_MAPS_API_KEY;
}
