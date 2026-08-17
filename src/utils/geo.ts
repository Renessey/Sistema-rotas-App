import type { LngLat } from '../types/geo';

const EARTH_RADIUS_M = 6371000;
const TO_RAD = Math.PI / 180;

/** Great-circle distance between two coordinates in meters */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * TO_RAD;
  const dLon = (b[0] - a[0]) * TO_RAD;
  const lat1 = a[1] * TO_RAD;
  const lat2 = b[1] * TO_RAD;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Approximate driving duration in seconds (used only as offline fallback) */
export function estimateDurationMeters(distanceMeters: number, speedMps = 11): number {
  // 11 m/s ≈ 40 km/h average urban speed
  return distanceMeters / speedMps;
}

/** Bounding box of a set of coordinates: [west, south, east, north] */
export function boundingBox(coords: LngLat[]): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [west, south, east, north];
}

/** Center of a set of coordinates */
export function centerOf(coords: LngLat[]): LngLat {
  const [w, s, e, n] = boundingBox(coords);
  return [(w + e) / 2, (s + n) / 2];
}

/** Determines whether a bearing is reliable based on speed (Phase 7) */
export function isBearingReliable(
  heading: number | null,
  speedMs: number | null,
  minSpeed = 1.5,
): boolean {
  if (heading === null || heading < 0) return false;
  if (speedMs === null || speedMs < minSpeed) return false; // stopped → unreliable
  return true;
}

/**
 * Decodes a Google-encoded polyline (used by Valhalla for trip shapes).
 * Returns [longitude, latitude][] pairs.
 */
export function decodePolyline(
  encoded: string,
  precision = 6,
): [number, number][] {
  const factor = 10 ** precision;
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coords.push([lng / factor, lat / factor]);
  }

  return coords;
}
