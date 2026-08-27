import type { LngLat, RouteResult } from '../../types/geo';

interface CacheEntry {
  route: RouteResult;
  timestamp: number;
}

const CACHE_MAX_ENTRIES = 50;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora de validade

/**
 * RouteCache — Sistema de cache inteligente de rotas em memória.
 * Evita chamadas repetidas à API do Mapbox para o mesmo conjunto ordenado de pontos,
 * poupando a cota diária do plano gratuito.
 */
export class RouteCache {
  private static cache = new Map<string, CacheEntry>();

  /**
   * Gera uma chave determinística para uma lista de waypoints e perfil.
   * Utiliza 5 casas decimais (~1 metro) para comparar coordenadas.
   */
  static getRouteKey(waypoints: LngLat[], profile: string): string {
    const coordsKey = waypoints
      .map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`)
      .join('|');
    return `${profile}:${coordsKey}`;
  }

  /**
   * Busca uma rota em cache. Retorna null se não existir ou se expirou.
   */
  static get(waypoints: LngLat[], profile: string): RouteResult | null {
    if (waypoints.length < 2) return null;
    const key = this.getRouteKey(waypoints, profile);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Verifica expiração
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.route;
  }

  /**
   * Armazena uma rota calculada no cache.
   */
  static set(waypoints: LngLat[], profile: string, route: RouteResult): void {
    if (waypoints.length < 2 || !route) return;
    const key = this.getRouteKey(waypoints, profile);

    // Evita crescimento ilimitado do Map
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      route,
      timestamp: Date.now(),
    });
  }

  /**
   * Limpa todo o cache de rotas.
   */
  static clear(): void {
    this.cache.clear();
  }

  /**
   * Retorna o tamanho atual do cache.
   */
  static size(): number {
    return this.cache.size;
  }
}
