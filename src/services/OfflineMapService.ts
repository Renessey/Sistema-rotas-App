/**
 * OfflineMapService.ts
 *
 * Serviço singleton que encapsula toda a lógica de mapas offline usando
 * o OfflineManager do @maplibre/maplibre-react-native.
 *
 * API usada:
 *  - OfflineManager.createPack(options, progressListener, errorListener)
 *  - OfflineManager.getPacks()
 *  - OfflineManager.deletePack(id)
 *  - OfflineManager.setTileCountLimit(limit)
 *  - OfflinePack.status()
 *  - OfflinePack.pause() / resume()
 */

import { OfflineManager } from '@maplibre/maplibre-react-native';
import type { OfflinePack, OfflinePackStatus } from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { getSafeToken } from '../config/mapStyles';

// ─── Constantes ──────────────────────────────────────────────────────────────

export const OFFLINE_MIN_ZOOM = 10;
export const OFFLINE_MAX_ZOOM = 16;
export const OFFLINE_TILE_LIMIT = 6000;

// Aproximação de bytes por tile (comprimido, média para mapas de rua)
const BYTES_PER_TILE = 10_240; // ~10 KB por tile

const OFFLINE_META_KEY = '@rotasimples:offline_packs_meta';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface OfflineRegionMeta {
  id: string;
  name: string;
  downloadedAt: number;
  tileSizeEstimateBytes: number;
  bounds: [number, number, number, number]; // [west, south, east, north]
  minZoom: number;
  maxZoom: number;
}

export interface OfflinePackWithMeta {
  pack: OfflinePack;
  meta: OfflineRegionMeta;
  status?: OfflinePackStatus;
}

export interface DownloadProgressEvent {
  percentage: number;
  completedTileCount: number;
  requiredResourceCount: number;
  completedResourceSize: number;
  state: string;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Estima o número de tiles para uma bounding box e intervalo de zoom.
 * Fórmula: sum(4^(z-minZoom) × (lon_span/360) × (lat_span/180)) por nível
 */
export function estimateTileCount(
  bounds: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): number {
  const [west, south, east, north] = bounds;
  const lonFraction = (east - west) / 360;
  const latFraction = (north - south) / 180;

  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const tilesPerAxis = Math.pow(2, z);
    const tiles = Math.ceil(tilesPerAxis * lonFraction) * Math.ceil(tilesPerAxis * latFraction);
    total += tiles;
  }
  return total;
}

export function estimateSizeMB(tileCount: number): number {
  return (tileCount * BYTES_PER_TILE) / (1024 * 1024);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { formatBytes };

// ─── Persistência de Metadados ───────────────────────────────────────────────

async function loadMeta(): Promise<Record<string, OfflineRegionMeta>> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveMeta(meta: Record<string, OfflineRegionMeta>): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFLINE_META_KEY, JSON.stringify(meta));
  } catch {}
}

export const OFFLINE_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';

// ─── Serviço Principal ───────────────────────────────────────────────────────

class OfflineMapServiceClass {
  private initialized = false;

  /** Inicializa configurações globais (chamar uma vez no início do app) */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    OfflineManager.setTileCountLimit(OFFLINE_TILE_LIMIT);
    OfflineManager.setProgressEventThrottle(500);
    this.initialized = true;
  }

  /**
   * Retorna a URL de estilo oficial e 100% compatível com o OfflineManager do MapLibre.
   * Utiliza OpenFreeMap / MapLibre Native vector tiles com fontes e sprites HTTPS.
   */
  async resolveStyleUri(styleUrl: string): Promise<string> {
    const trimmed = (styleUrl || '').trim();

    if (
      trimmed.startsWith('https://') &&
      !trimmed.includes('api.mapbox.com/styles/v1/mapbox')
    ) {
      return trimmed;
    }

    return OFFLINE_STYLE_URL;
  }

  /**
   * Baixa uma região offline.
   * @param name Nome amigável exibido na lista
   * @param styleUrl URL do estilo MapLibre
   * @param bounds [west, south, east, north]
   * @param onProgress Callback de progresso (0–100)
   * @param onComplete Callback ao concluir
   * @param onError Callback de erro
   */
  async downloadRegion(
    name: string,
    styleUrl: string,
    bounds: [number, number, number, number],
    onProgress: (evt: DownloadProgressEvent) => void,
    onComplete: (packId: string) => void,
    onError: (message: string) => void,
  ): Promise<OfflinePack> {
    await this.initialize();

    const tileCount = estimateTileCount(bounds, OFFLINE_MIN_ZOOM, OFFLINE_MAX_ZOOM);
    const resolvedStyleUrl = await this.resolveStyleUri(styleUrl);

    try {
      const pack = await OfflineManager.createPack(
        {
          mapStyle: resolvedStyleUrl,
          bounds: bounds,
          minZoom: OFFLINE_MIN_ZOOM,
          maxZoom: OFFLINE_MAX_ZOOM,
          metadata: { name, createdAt: Date.now() },
        },
        (offlinePack, status) => {
          onProgress({
            percentage: status.percentage ?? 0,
            completedTileCount: status.completedTileCount ?? 0,
            requiredResourceCount: status.requiredResourceCount ?? 0,
            completedResourceSize: status.completedResourceSize ?? 0,
            state: status.state,
          });
          if (status.state === 'complete') {
            this._saveMeta(offlinePack.id, name, bounds, tileCount).then(() => {
              onComplete(offlinePack.id);
            });
          }
        },
        (_offlinePack, error) => {
          console.warn('[OfflineMapService] Erro callback MapLibre:', error);
          onError(error.message ?? 'Erro desconhecido no download');
        },
      );

      return pack;
    } catch (error: any) {
      console.warn('[OfflineMapService] createPack exception:', error);
      onError(error?.message ?? 'Falha ao iniciar o download do mapa');
      throw error;
    }
  }

  private async _saveMeta(
    id: string,
    name: string,
    bounds: [number, number, number, number],
    tileCount: number,
  ): Promise<void> {
    const meta = await loadMeta();
    meta[id] = {
      id,
      name,
      downloadedAt: Date.now(),
      tileSizeEstimateBytes: tileCount * BYTES_PER_TILE,
      bounds,
      minZoom: OFFLINE_MIN_ZOOM,
      maxZoom: OFFLINE_MAX_ZOOM,
    };
    await saveMeta(meta);
  }

  /** Lista todos os packs offline salvos com seus metadados */
  async listRegions(): Promise<OfflinePackWithMeta[]> {
    await this.initialize();
    const [packs, meta] = await Promise.all([OfflineManager.getPacks(), loadMeta()]);

    const results: OfflinePackWithMeta[] = [];
    for (const pack of packs) {
      const packMeta = meta[pack.id] ?? {
        id: pack.id,
        name: (pack.metadata?.name as string) ?? 'Região Desconhecida',
        downloadedAt: Date.now(),
        tileSizeEstimateBytes: 0,
        bounds: pack.bounds as [number, number, number, number],
        minZoom: OFFLINE_MIN_ZOOM,
        maxZoom: OFFLINE_MAX_ZOOM,
      };

      let status: OfflinePackStatus | undefined;
      try {
        status = await pack.status();
      } catch {}

      results.push({ pack, meta: packMeta, status });
    }
    return results;
  }

  /** Remove uma região offline pelo ID */
  async deleteRegion(id: string): Promise<void> {
    await OfflineManager.deletePack(id);
    const meta = await loadMeta();
    delete meta[id];
    await saveMeta(meta);
  }

  /** Calcula o espaço total em bytes usado por todas as regiões salvas */
  async getTotalUsedBytes(): Promise<number> {
    const regions = await this.listRegions();
    return regions.reduce((acc, r) => acc + (r.meta.tileSizeEstimateBytes || 0), 0);
  }
}

export const OfflineMapService = new OfflineMapServiceClass();
