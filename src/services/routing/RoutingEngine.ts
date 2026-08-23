import type {
  Costing,
  GeoJSONFeatureCollection,
  LngLat,
  MatrixResult,
  RouteResult,
  SnappedPoint,
  SnapOptions,
} from '../../types/geo';

export interface RegionMetadata {
  regionId: string;
  municipalities: string[];
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  center: LngLat;
  version: string;
}

export interface RoutingEngine {
  /** Calcula a rota entre 2 ou mais waypoints */
  route(
    waypoints: LngLat[],
    options?: { costing?: Costing },
  ): Promise<RouteResult>;

  /** Calcula a matriz de tempos e distâncias */
  matrix(
    origins: LngLat[],
    destinations: LngLat[],
    options?: { costing?: Costing },
  ): Promise<MatrixResult>;

  /** Ajusta uma coordenada na malha viária mais próxima */
  locate(point: LngLat, options?: SnapOptions): Promise<SnappedPoint>;

  /** Otimiza e calcula a rota completa */
  optimizedRoute(
    start: LngLat,
    stops: LngLat[],
    options?: { costing?: Costing; destination?: LngLat | null },
  ): Promise<{ result: RouteResult; order: number[] }>;

  /** Verifica se o motor nativo está disponível */
  isAvailable(): Promise<boolean>;

  /** Retorna os metadados da região coberta */
  getRegionMetadata(): RegionMetadata;

  /** Verifica se o ponto está dentro do bounding box da região */
  isInsideRegion(point: LngLat): boolean;
}
