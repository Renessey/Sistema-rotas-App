import { LngLat } from '../../../types/geo';

/**
 * Algoritmo Point-in-Polygon (Ray-Casting) para verificar se uma coordenada está dentro de um polígono
 */
export function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Formata distância em metros ou quilômetros
 */
export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/**
 * Formata duração em minutos ou horas e minutos
 */
export function formatDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }
  return `${mins} min`;
}

export interface SnappedRouteResult {
  /** Posição projetada e suavizada na linha da rota */
  snappedLocation: LngLat;
  /** Polyline aparada que inicia com precisão cirúrgica na posição do usuário */
  trimmedCoordinates: LngLat[];
  /** Distância perpendicular até o centro da via em metros */
  distanceToRoute: number;
}

/**
 * snapLocationToRoute
 * Realiza Map Matching (projeção ortogonal) da posição do usuário sobre o segmento da via.
 *
 * Garante que:
 * 1. A posição do veículo ande cravada no centro da faixa da rua (sem oscilar na calçada).
 * 2. A linha azul da polyline comece EXATAMENTE na ponta da seta do GPS (zero gap / zero tearing).
 * 3. As esquinas e curvas futuras NUNCA sejam cortadas antecipadamente (o próximo vértice é sempre o da frente).
 */
export function snapLocationToRoute(
  userPos: LngLat,
  routeCoords: LngLat[],
  maxSnapDistance = 32,
): SnappedRouteResult {
  if (!routeCoords || routeCoords.length < 2) {
    return {
      snappedLocation: userPos,
      trimmedCoordinates: routeCoords || [],
      distanceToRoute: 0,
    };
  }

  let minDistance = Infinity;
  let bestSegmentIdx = 0;
  let bestProjPoint: LngLat = userPos;

  const cosLat = Math.cos((userPos[1] * Math.PI) / 180);
  const mPerDegLng = 111320 * cosLat;
  const mPerDegLat = 110540;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const a = routeCoords[i];
    const b = routeCoords[i + 1];

    const dx = (b[0] - a[0]) * mPerDegLng;
    const dy = (b[1] - a[1]) * mPerDegLat;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) continue;

    const px = (userPos[0] - a[0]) * mPerDegLng;
    const py = (userPos[1] - a[1]) * mPerDegLat;

    let t = (px * dx + py * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projLng = a[0] + t * (b[0] - a[0]);
    const projLat = a[1] + t * (b[1] - a[1]);

    const dist = Math.sqrt(((userPos[0] - projLng) * mPerDegLng) ** 2 + ((userPos[1] - projLat) * mPerDegLat) ** 2);

    if (dist < minDistance) {
      minDistance = dist;
      bestSegmentIdx = i;
      bestProjPoint = [projLng, projLat];
    }
  }

  // Se estiver a até 32m da rota (largura de avenidas e vias urbanas), faz o snap na via
  const shouldSnap = minDistance <= maxSnapDistance;
  const activePosition: LngLat = shouldSnap ? bestProjPoint : userPos;

  // Próximos vértices da rota a partir do segmento atual (nunca pula a esquina atual)
  const remaining = routeCoords.slice(bestSegmentIdx + 1);
  const trimmed = [activePosition, ...remaining];

  return {
    snappedLocation: activePosition,
    trimmedCoordinates: trimmed.length >= 2 ? trimmed : routeCoords,
    distanceToRoute: minDistance,
  };
}
