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

/* ------------------------- Delivery entity ------------------------- */

export type DeliveryStatus =
  | 'pending'
  | 'optimized'
  | 'in_progress'
  | 'completed'
  | 'failed';

export type GeocodingStatus = 'pending' | 'geocoding' | 'success' | 'failed';

export type FailReason =
  | 'absent'
  | 'refused'
  | 'wrong_address'
  | 'no_access'
  | 'other'
  | null;

export interface DeliveryEntity {
  id: number;
  name: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  phone: string;
  orderCode: string;
  latitude: number | null;
  longitude: number | null;
  snappedLatitude: number | null;
  snappedLongitude: number | null;
  geocodingStatus: GeocodingStatus;
  geocodingSource: string | null;   // 'brasilapi' | 'viacep' | 'nominatim' | 'photon' | 'manual' | 'spreadsheet'
  routingStatus: 'pending' | 'routed' | 'failed';
  sequence: number | null;
  distance: number | null;
  duration: number | null;
  status: DeliveryStatus;
  failReason: FailReason;
  notes: string | null;
  deliveredAt: number | null;       // unix timestamp ms
  createdAt: number | null;
}

/* ------------------------- Valhalla types ------------------------- */

export type Costing = 'auto' | 'bicycle' | 'pedestrian' | 'bus' | 'truck';

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
  /** true when the real road network was used (native Valhalla) */
  fromRoadNetwork: boolean;
}

export interface RouteResult {
  geojson: GeoJSONFeatureCollection;
  distance: number; // meters
  duration: number; // seconds
  fromRoadNetwork: boolean;
}

/** Bearing+radius used for snapping (Phase 7) */
export interface SnapBearing {
  /** degrees, when reliable */
  value: number | null;
  /** degrees of uncertainty */
  tolerance?: number;
  /** whether the bearing passed the confidence check */
  reliable: boolean;
}

export interface SnapOptions {
  radius?: number;
  bearing?: number | null;
  bearingTolerance?: number;
}

/** GPS_SNAP_RADIUS / GPS_MIN_BEARING_CONFIDENCE config */
export const SNAP_CONFIG = {
  GPS_SNAP_RADIUS: 50,                // meters — max distance to consider snapping
  GPS_MIN_BEARING_CONFIDENCE: 0.5,    // min heading reliability to use bearing
  MIN_BEARING_SPEED: 1.5,             // m/s — below this, vehicle is "stopped", bearing ignored
} as const;

/* ------------------------- Geocoding types ------------------------- */

export type GeocodingProvider =
  | 'spreadsheet'
  | 'brasilapi'
  | 'viacep+nominatim'
  | 'nominatim'
  | 'photon'
  | 'cache'
  | 'manual';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  confidence: 'high' | 'medium' | 'low';
  provider: GeocodingProvider;
  formattedAddress?: string;
}

/* ------------------------- Navigation types ------------------------- */

export type ExternalNavApp = 'waze' | 'google_maps' | 'apple_maps';
