import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@routes_mapbox_daily_usage';
export const MAPBOX_DAILY_LIMIT = 3000;

export interface MapboxUsageData {
  date: string; // Formato YYYY-MM-DD
  count: number;
}

export interface MapboxQuotaStatus {
  date: string;
  count: number;
  limit: number;
  remaining: number;
  isLimitReached: boolean;
}

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * MapboxQuota — Controlador de Cota Diária do Mapbox Directions API.
 * Garante que o aplicativo nunca ultrapasse o limite seguro diário de 3.000 requisições/dia
 * (respeitando rigorosamente o limite de 100.000 requisições gratuitas mensais).
 */
export class MapboxQuota {
  private static cachedUsage: MapboxUsageData | null = null;

  /**
   * Obtém os dados de uso do dia atual.
   */
  static async getUsage(): Promise<MapboxQuotaStatus> {
    const today = getTodayString();

    try {
      if (this.cachedUsage && this.cachedUsage.date === today) {
        const count = this.cachedUsage.count;
        return {
          date: today,
          count,
          limit: MAPBOX_DAILY_LIMIT,
          remaining: Math.max(0, MAPBOX_DAILY_LIMIT - count),
          isLimitReached: count >= MAPBOX_DAILY_LIMIT,
        };
      }

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      let data: MapboxUsageData = { date: today, count: 0 };

      if (stored) {
        try {
          const parsed = JSON.parse(stored) as MapboxUsageData;
          if (parsed.date === today && typeof parsed.count === 'number') {
            data = parsed;
          }
        } catch {}
      }

      this.cachedUsage = data;

      return {
        date: today,
        count: data.count,
        limit: MAPBOX_DAILY_LIMIT,
        remaining: Math.max(0, MAPBOX_DAILY_LIMIT - data.count),
        isLimitReached: data.count >= MAPBOX_DAILY_LIMIT,
      };
    } catch {
      const fallbackCount = this.cachedUsage?.date === today ? this.cachedUsage.count : 0;
      return {
        date: today,
        count: fallbackCount,
        limit: MAPBOX_DAILY_LIMIT,
        remaining: Math.max(0, MAPBOX_DAILY_LIMIT - fallbackCount),
        isLimitReached: fallbackCount >= MAPBOX_DAILY_LIMIT,
      };
    }
  }

  /**
   * Verifica se ainda há cota disponível no dia.
   */
  static async canMakeRequest(): Promise<boolean> {
    const usage = await this.getUsage();
    return !usage.isLimitReached;
  }

  /**
   * Registra uma ou mais requisições realizadas com sucesso.
   */
  static async recordRequest(increment = 1): Promise<number> {
    const today = getTodayString();
    const usage = await this.getUsage();
    const newCount = usage.count + increment;

    const data: MapboxUsageData = {
      date: today,
      count: newCount,
    };

    this.cachedUsage = data;

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[MapboxQuota] Falha ao salvar cota no storage:', e);
    }

    return newCount;
  }

  /**
   * Reseta a cota diária manualmente (para testes e diagnósticos).
   */
  static async resetQuota(): Promise<void> {
    const today = getTodayString();
    const data: MapboxUsageData = { date: today, count: 0 };
    this.cachedUsage = data;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }
}
