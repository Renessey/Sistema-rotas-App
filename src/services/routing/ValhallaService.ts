import type {
  Costing,
  LngLat,
  MatrixResult,
  RouteResult,
  SnappedPoint,
  SnapOptions,
} from '../../types/geo';
import { valhallaEngineInstance } from './ValhallaEngine';

interface ValhallaHttpOptions {
  costing?: Costing;
}

/**
 * ValhallaService — Fachada de Roteamento 100% OFFLINE.
 *
 * Mapeamento e cálculo de rotas local para:
 * - Maricá
 * - Niterói
 * - São Gonçalo
 *
 * Nenhuma chamada externa é realizada.
 */
export class ValhallaService {
  static isNativeAvailable(): boolean {
    return true;
  }

  static async tilesReady(): Promise<{ installed: boolean; region?: string; version?: string }> {
    return await valhallaEngineInstance.tilesReady();
  }

  static async route(
    waypoints: LngLat[],
    options: ValhallaHttpOptions = {},
  ): Promise<RouteResult> {
    return await valhallaEngineInstance.route(waypoints, options);
  }

  static async matrix(origins: LngLat[], destinations: LngLat[]): Promise<MatrixResult> {
    return await valhallaEngineInstance.matrix(origins, destinations);
  }

  static async locate(point: LngLat, options: SnapOptions = {}): Promise<SnappedPoint> {
    return await valhallaEngineInstance.locate(point, options);
  }

  static async optimizedRoute(
    start: LngLat,
    stops: LngLat[],
    options: { costing?: Costing; destination?: LngLat | null } = {},
  ): Promise<{ result: RouteResult; order: number[] }> {
    return await valhallaEngineInstance.optimizedRoute(start, stops, options);
  }

  static getRegionMetadata() {
    return valhallaEngineInstance.getRegionMetadata();
  }

  static isInsideRegion(point: LngLat): boolean {
    return valhallaEngineInstance.isInsideRegion(point);
  }
}
