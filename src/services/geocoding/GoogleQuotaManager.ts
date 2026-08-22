import AsyncStorage from '@react-native-async-storage/async-storage';

export const GEOCODE_DAILY_COUNTER_KEY = '@geocode_daily_counter';
export const DAILY_LIMIT = 300;

export interface DailyCounterData {
  date: string; // "YYYY-MM-DD"
  count: number;
}

export class QuotaExceededError extends Error {
  constructor(message = 'Limite diário de 300 requisições do Google Geocoding atingido.') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * GoogleQuotaManager — Controle de cota diária local para requisições de Geocodificação Google.
 *
 * Persiste `{ date: "YYYY-MM-DD", count: number }` no AsyncStorage sob a chave `@geocode_daily_counter`.
 * Garante que nunca exceda 300 requisições/dia e reseta automaticamente a cada novo dia.
 */
export class GoogleQuotaManager {
  /** Retorna a data local atual no formato YYYY-MM-DD */
  private static getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Obtém o contador atual do dia. Se a data for diferente, zera e salva novo registro.
   */
  static async getCounter(): Promise<DailyCounterData> {
    const today = this.getTodayString();
    try {
      const raw = await AsyncStorage.getItem(GEOCODE_DAILY_COUNTER_KEY);
      if (raw) {
        const parsed: DailyCounterData = JSON.parse(raw);
        if (parsed.date === today && typeof parsed.count === 'number') {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[GoogleQuotaManager] Erro ao ler cota do AsyncStorage', e);
    }

    // Se for outro dia ou não existir, zera o contador
    const initial: DailyCounterData = { date: today, count: 0 };
    await this.saveCounter(initial);
    return initial;
  }

  /** Salva o registro no AsyncStorage */
  static async saveCounter(data: DailyCounterData): Promise<void> {
    try {
      await AsyncStorage.setItem(GEOCODE_DAILY_COUNTER_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[GoogleQuotaManager] Erro ao salvar cota no AsyncStorage', e);
    }
  }

  /**
   * Retorna os detalhes de uso da cota para exibição na UI.
   */
  static async getUsage(): Promise<{
    date: string;
    count: number;
    limit: number;
    remaining: number;
    hasQuota: boolean;
  }> {
    const counter = await this.getCounter();
    const remaining = Math.max(0, DAILY_LIMIT - counter.count);
    return {
      date: counter.date,
      count: counter.count,
      limit: DAILY_LIMIT,
      remaining,
      hasQuota: counter.count < DAILY_LIMIT,
    };
  }

  /**
   * Verifica se ainda há cota disponível no dia.
   */
  static async hasQuotaAvailable(): Promise<boolean> {
    const counter = await this.getCounter();
    return counter.count < DAILY_LIMIT;
  }

  /**
   * Incrementa o contador de requisições do dia em 1.
   * Lança QuotaExceededError se atingir o limite de 300.
   */
  static async increment(): Promise<{ count: number; remaining: number }> {
    const today = this.getTodayString();
    const counter = await this.getCounter();

    if (counter.count >= DAILY_LIMIT) {
      throw new QuotaExceededError();
    }

    const nextCount = counter.count + 1;
    await this.saveCounter({ date: today, count: nextCount });

    return {
      count: nextCount,
      remaining: Math.max(0, DAILY_LIMIT - nextCount),
    };
  }

  /**
   * Zera o contador do dia (utilizado em testes ou reset administrativo).
   */
  static async reset(): Promise<void> {
    const today = this.getTodayString();
    await this.saveCounter({ date: today, count: 0 });
  }
}
