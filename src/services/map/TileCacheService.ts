/**
 * TileCacheService — Cache local de requisições do mapa (tiles, geocoding).
 *
 * O MapLibre cuida do cache de tiles binários internamente via seu próprio cache
 * nativo (SQLite). Este serviço complementa isso armazenando metadados e respostas
 * de APIs JSON (geocoding, snapToRoad, etc.) no AsyncStorage com TTL configurável.
 *
 * Limites:
 * - TTL padrão: 24 horas (tiles ficam válidos por 1 dia)
 * - Máximo de entradas em cache: 200 (FIFO ao atingir o limite)
 * - Funciona offline: retorna dados em cache mesmo sem internet
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@routes_tile_cache_';
const INDEX_KEY = '@routes_tile_cache_index';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const MAX_ENTRIES = 200;

interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  key: string;
}

export class TileCacheService {
  private static memoryCache = new Map<string, CacheEntry>();

  /**
   * Gera uma chave de cache normalizada a partir de uma URL ou string de identificação.
   */
  static buildKey(url: string): string {
    // Remove o access_token da URL para que não vaze nas chaves de cache
    const sanitized = url.replace(/access_token=[^&]+/g, 'access_token=REDACTED');
    return sanitized.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 200);
  }

  /**
   * Tenta recuperar um item do cache (memória primeiro, depois AsyncStorage).
   * Retorna `null` se não encontrado ou expirado.
   */
  static async get<T = unknown>(cacheKey: string): Promise<T | null> {
    const now = Date.now();

    // 1. Verifica cache em memória (mais rápido)
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry) {
      if (memEntry.expiresAt > now) {
        return memEntry.data as T;
      }
      this.memoryCache.delete(cacheKey);
    }

    // 2. Verifica AsyncStorage (persistente)
    try {
      const stored = await AsyncStorage.getItem(CACHE_PREFIX + cacheKey);
      if (!stored) return null;

      const entry: CacheEntry<T> = JSON.parse(stored);
      if (entry.expiresAt <= now) {
        // Expirado — remove em background sem bloquear
        AsyncStorage.removeItem(CACHE_PREFIX + cacheKey).catch(() => {});
        return null;
      }

      // Armazena em memória para acesso subsequente mais rápido
      this.memoryCache.set(cacheKey, entry as CacheEntry);
      return entry.data;
    } catch {
      return null;
    }
  }

  /**
   * Armazena um item no cache com TTL configurável.
   */
  static async set<T = unknown>(
    cacheKey: string,
    data: T,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      key: cacheKey,
      data,
      expiresAt: Date.now() + ttlMs,
    };

    // Salva em memória imediatamente
    this.memoryCache.set(cacheKey, entry as CacheEntry);

    // Persiste no AsyncStorage em background
    try {
      await AsyncStorage.setItem(CACHE_PREFIX + cacheKey, JSON.stringify(entry));
      await this.updateIndex(cacheKey);
    } catch (e) {
      console.warn('[TileCacheService] Falha ao persistir cache:', e);
    }
  }

  /**
   * Wrapper com cache automático: executa `fetcher` e armazena o resultado.
   * Se o cache for válido, retorna diretamente sem chamar `fetcher`.
   */
  static async withCache<T>(
    url: string,
    fetcher: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<T> {
    const key = this.buildKey(url);

    const cached = await this.get<T>(key);
    if (cached !== null) {
      console.log('[TileCacheService] Cache hit:', url.substring(0, 60) + '…');
      return cached;
    }

    const result = await fetcher();
    // Armazena em background para não bloquear o retorno
    this.set(key, result, ttlMs).catch(() => {});
    return result;
  }

  /**
   * Invalida todo o cache local (útil para depuração ou reset manual).
   */
  static async clearAll(): Promise<void> {
    this.memoryCache.clear();
    try {
      const index = await this.getIndex();
      const removeKeys = index.map((k) => CACHE_PREFIX + k);
      if (removeKeys.length > 0) {
        await Promise.all(removeKeys.map((k) => AsyncStorage.removeItem(k).catch(() => {})));
      }
      await AsyncStorage.removeItem(INDEX_KEY);
    } catch (e) {
      console.warn('[TileCacheService] Falha ao limpar cache:', e);
    }
  }

  /**
   * Retorna estatísticas do cache atual.
   */
  static async getStats(): Promise<{ entries: number; memoryEntries: number }> {
    const index = await this.getIndex();
    return {
      entries: index.length,
      memoryEntries: this.memoryCache.size,
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private static async getIndex(): Promise<string[]> {
    try {
      const stored = await AsyncStorage.getItem(INDEX_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private static async updateIndex(newKey: string): Promise<void> {
    try {
      let index = await this.getIndex();
      // Remove duplicata se já existe
      index = index.filter((k) => k !== newKey);
      index.push(newKey);

      // FIFO: remove os mais antigos quando atinge o limite
      if (index.length > MAX_ENTRIES) {
        const toRemove = index.splice(0, index.length - MAX_ENTRIES);
        const removeItems = toRemove.map((k) => CACHE_PREFIX + k);
        Promise.all(removeItems.map((k) => AsyncStorage.removeItem(k).catch(() => {}))).catch(() => {});
      }

      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch (e) {
      console.warn('[TileCacheService] Falha ao atualizar índice de cache:', e);
    }
  }
}
