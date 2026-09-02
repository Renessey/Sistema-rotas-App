import type { LngLat } from '@maplibre/maplibre-react-native';

export type { LngLat };

/** Geographic coordinates [longitude, latitude] */

/** A delivery stop to be visited */
export interface DeliveryPoint {
  id: string;
  title: string;
  address?: string;
  coords: LngLat;
}

/** A GeoJSON LineString geometry representing a route */
export interface RouteGeometry {
  type: 'LineString';
  coordinates: LngLat[];
}

/** Minimal GeoJSON Feature for a LineString route */
export interface RouteFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: RouteGeometry;
}

/** GeoJSON FeatureCollection wrapper used by MapLibre sources */
export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: RouteFeature[];
}

/** GPS position as returned by the device */
export interface GpsPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    altitude?: number | null;
    heading?: number | null;
    speed?: number | null;
  };
  timestamp: number;
}

/* ------------------------- Delivery List Entity (Multi-List Batch) ------------------------- */

export interface DeliveryListEntity {
  id: number;
  name: string; // Ex: "Lista 1", "Lista 2", "Romaneio Maricá"
  fileName?: string | null;
  totalDeliveries: number;
  completedDeliveries: number;
  pendingDeliveries: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------- Delivery Entity (Official Offline Model) ------------------------- */

export type DeliveryStatus =
  | 'pending'
  | 'optimized'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'invalid_coords';

export type FailReason =
  | 'absent'
  | 'refused'
  | 'wrong_address'
  | 'no_access'
  | 'other'
  | null;

export interface DeliveryEntity {
  id: number;
  listId?: number | null;      // ID da lista/lote a qual pertence (ex: Lista 1, Lista 2)
  destination: string;         // Texto original da planilha (delivery.destination)
  bairro: string;              // Texto original da planilha (delivery.bairro)
  city: string;                // Texto original da planilha (delivery.city)
  zipCode: string;             // ZipCode ou Postal Code (delivery.zipCode)
  latitude: number | null;     // Valor numérico exato de Latitude
  longitude: number | null;    // Valor numérico exato de Longitude
  rawLatitude: string | null;  // Valor original textual da planilha
  rawLongitude: string | null; // Valor original textual da planilha
  pedido: string | null;       // Código do pedido
  telefone: string | null;     // Telefone / WhatsApp
  status: DeliveryStatus;
  ordem: number | null;        // Posição ordenada na rota
  distancia: number | null;    // Distância calculada (m)
  tempoEstimado: number | null;// Tempo estimado de viagem (s)
  failReason?: FailReason;
  notes?: string | null;
  deliveredAt?: number | null; // Unix timestamp (ms)
  createdAt: number;
  updatedAt?: number;
  originalData?: string | null;// JSON com os dados brutos da linha
  
  // Campos de compatibilidade para visualização
  name?: string;
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  state?: string;
  cep?: string;
  phone?: string;
  orderCode?: string;
  sequence?: number | null;
  duration?: number | null;
  distance?: number | null;
  snappedLatitude?: number | null;
  snappedLongitude?: number | null;
}

export interface ColumnMappingConfig {
  destinationCol?: string;
  bairroCol?: string;
  cityCol?: string;
  zipCodeCol?: string;
  latitudeCol?: string;
  longitudeCol?: string;
  pedidoCol?: string;
  phoneCol?: string;
  notesCol?: string;
  nameCol?: string;
  addressCols?: string[];
  orderCodeCol?: string;
}

/* ------------------------- Routing & Snap types ------------------------- */

export type Costing = 'auto' | 'motorcycle' | 'bicycle' | 'pedestrian' | 'bus' | 'truck';

export interface SnappedPoint {
  /** original coordinate, never replaced */
  original: LngLat;
  /** snapped coordinate on the road network */
  snapped: LngLat | null;
  /** distance (m) between original and snapped point */
  distanceToRoad: number | null;
  /** true when snapped to the road network */
  matched: boolean;
  /** edge/way id when available */
  wayId?: number | null;
}

export interface MatrixResult {
  /** durations[i][j] in seconds */
  durations: number[][];
  /** distances[i][j] in meters */
  distances: number[][];
  /** true when road network was used */
  fromRoadNetwork: boolean;
}

export interface RouteResult {
  geojson: GeoJSONFeatureCollection;
  distance: number; // meters
  duration: number; // seconds
  fromRoadNetwork: boolean;
}

export interface SnapOptions {
  radius?: number;
  bearing?: number | null;
  bearingTolerance?: number;
}

export type ExternalNavApp = 'waze' | 'google_maps' | 'apple_maps';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  provider: string;
  accuracy?: number;
  confidence?:
    | 'ROOFTOP'
    | 'RANGE_INTERPOLATED'
    | 'GEOMETRIC_CENTER'
    | 'APPROXIMATE'
    | 'high'
    | 'medium'
    | 'low'
    | 'exact'
    | 'fallback'
    | 'spreadsheet'
    | string;
  formattedAddress?: string;
}

/* ------------------------- Route Stop Group (Multi-delivery per address) ------------------------- */

export interface RouteStop {
  stopNumber: number;            // 1, 2, 3...
  key: string;                   // Chave única do endereço/coordenada
  coords: LngLat;                // [longitude, latitude]
  latitude: number;              // Latitude numérica
  longitude: number;             // Longitude numérica
  address: string;               // Endereço / Destino principal
  bairro?: string;
  city?: string;
  zipCode?: string;
  deliveries: DeliveryEntity[];  // Todas as entregas/pacotes deste endereço
  totalCount: number;            // Total de pacotes neste ponto
  completedCount: number;        // Pacotes concluídos
  pendingCount: number;          // Pacotes pendentes
  failedCount: number;           // Pacotes falhados
  status: DeliveryStatus;        // Status consolidado da parada
  timeEstimated?: string;        // Horário estimado (ex: 08:30)
}


/* ------------------------- Routing Provider ------------------------- */

export type RoutingProvider =
  | 'mapbox'
  | 'valhalla_osm_offline'
  | 'local_fallback';

