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

/**
 * Calculates the shortest distance in meters from a point P to a line segment AB.
 */
export function distanceToSegment(p: LngLat, a: LngLat, b: LngLat): number {
  const [pLng, pLat] = p;
  const [aLng, aLat] = a;
  const [bLng, bLat] = b;

  const midLat = ((aLat + bLat) / 2) * TO_RAD;
  const cosLat = Math.cos(midLat);

  // Convert (lon, lat) differences to local meters (equirectangular projection)
  const degToM = EARTH_RADIUS_M * TO_RAD;
  const dx = (bLng - aLng) * cosLat * degToM;
  const dy = (bLat - aLat) * degToM;

  const px = (pLng - aLng) * cosLat * degToM;
  const py = (pLat - aLat) * degToM;

  const segLenSq = dx * dx + dy * dy;
  if (segLenSq === 0) {
    return Math.sqrt(px * px + py * py);
  }

  // Projection scalar clamped between 0 and 1
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / segLenSq));
  const projX = t * dx;
  const projY = t * dy;

  const distX = px - projX;
  const distY = py - projY;

  return Math.sqrt(distX * distX + distY * distY);
}

/**
 * Calculates the minimum distance in meters from a point P to an entire polyline.
 */
export function minDistanceToPolyline(p: LngLat, polyline: LngLat[]): number {
  if (!polyline || polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversine(p, polyline[0]);

  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToSegment(p, polyline[i], polyline[i + 1]);
    if (d < minDist) {
      minDist = d;
      // If we are already extremely close (< 2m), no need to search further
      if (minDist < 2) return minDist;
    }
  }

  return minDist;
}

/**
 * Decodifica polyline do Mapbox / Valhalla (Precisão Nível 6 - 1e6).
 * Garante fidelidade métrica ao traçado viário real sem distorções ou cortes em quarteirões.
 */
export function decodeMapboxPolyline(encoded: string): [number, number][] {
  return decodePolyline(encoded, 6);
}

/**
 * @deprecated Use decodeMapboxPolyline
 */
export function decodeValhallaPolyline(encoded: string): [number, number][] {
  return decodePolyline(encoded, 6);
}

/**
 * Decodifica polyline da Google Directions API (Precisão Nível 5 - 1e5)
 */
export function decodeGooglePolyline(encoded: string): [number, number][] {
  return decodePolyline(encoded, 5);
}

/**
 * Agrupa uma lista de entregas em paradas físicas únicas (RouteStop).
 * Entregas que possuem o mesmo endereço ou mesmas coordenadas são consolidadas em 1 única parada.
 */
export function groupDeliveriesIntoStops(deliveries: import('../types/geo').DeliveryEntity[]): import('../types/geo').RouteStop[] {
  const groups = new Map<string, import('../types/geo').DeliveryEntity[]>();

  for (const d of deliveries) {
    let key = '';
    if (d.latitude !== null && d.longitude !== null && !isNaN(d.latitude) && !isNaN(d.longitude)) {
      // Agrupa por coordenadas com 5 casas decimais (~1 metro de precisão)
      key = `coord:${d.longitude.toFixed(5)},${d.latitude.toFixed(5)}`;
    } else {
      // Fallback para endereço textual normalizado
      const normAddr = (d.destination || d.address || d.name || `id_${d.id}`)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      const normBairro = (d.bairro || d.neighborhood || '').trim().toLowerCase();
      key = `addr:${normAddr}|${normBairro}`;
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(d);
  }

  const stops: import('../types/geo').RouteStop[] = [];
  let stopNumber = 1;

  for (const [key, items] of groups.entries()) {
    const primary = items[0];
    const coords: LngLat = [
      primary.snappedLongitude ?? primary.longitude ?? 0,
      primary.snappedLatitude ?? primary.latitude ?? 0,
    ];

    const completedCount = items.filter((i) => i.status === 'completed').length;
    const failedCount = items.filter((i) => i.status === 'failed').length;
    const pendingCount = items.length - completedCount - failedCount;

    let status: import('../types/geo').DeliveryStatus = 'pending';
    if (completedCount === items.length) {
      status = 'completed';
    } else if (failedCount === items.length) {
      status = 'failed';
    } else if (completedCount > 0 || items.some((i) => i.status === 'in_progress')) {
      status = 'in_progress';
    } else if (items.some((i) => i.status === 'optimized')) {
      status = 'optimized';
    }

    stops.push({
      stopNumber,
      key,
      coords,
      latitude: coords[1],
      longitude: coords[0],
      address: primary.destination || primary.address || primary.name || 'Endereço sem nome',
      bairro: primary.bairro || primary.neighborhood || undefined,
      city: primary.city || undefined,
      zipCode: primary.zipCode || primary.cep || undefined,
      deliveries: items,
      totalCount: items.length,
      completedCount,
      pendingCount,
      failedCount,
      status,
    });

    stopNumber++;

  }

  return stops;
}

