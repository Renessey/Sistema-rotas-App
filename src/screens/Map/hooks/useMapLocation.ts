import { useState, useEffect, useRef, useCallback } from 'react';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { LocationService } from '../../../services/gps/LocationService';
import { CompassService } from '../../../services/gps/CompassService';
import type { LngLat, GeoJSONFeatureCollection } from '../../../types/geo';

export function calculateBearing(start: LngLat, end: LngLat): number {
  const startLat = (start[1] * Math.PI) / 180;
  const startLng = (start[0] * Math.PI) / 180;
  const endLat = (end[1] * Math.PI) / 180;
  const endLng = (end[0] * Math.PI) / 180;
  const dLng = endLng - startLng;
  const y = Math.sin(dLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function calculateDistanceMeters(a: LngLat, b: LngLat): number {
  const dLng = (b[0] - a[0]) * 111320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const dLat = (b[1] - a[1]) * 110540;
  return Math.sqrt(dLng * dLng + dLat * dLat);
}

/**
 * getRouteBearing
 * Calcula o azimute (0-360°) da polyline da rota a partir da localização fornecida,
 * projetando um ponto à frente (lookahead) ao longo da geometria da rua.
 *
 * Garante que:
 * 1. O rumo aponte RIGOROSAMENTE na direção da polyline azul da rota.
 * 2. Ao virar esquinas ou entrar em novas ruas, o rumo acompanhe a curvatura da rota.
 * 3. O rumo seja imune a ruídos de GPS parado ou aparelhos sem sensor de bússola física.
 */
export function getRouteBearing(
  location: LngLat,
  routeCoordinates: LngLat[],
  lookaheadMeters = 22,
): number | null {
  if (!routeCoordinates || routeCoordinates.length < 2) return null;

  // 1. Encontra o vértice mais próximo na polyline
  let minDist = Infinity;
  let closestIdx = 0;

  for (let i = 0; i < routeCoordinates.length; i++) {
    const d = calculateDistanceMeters(location, routeCoordinates[i]);
    if (d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }

  // Se o motorista estiver muito distante da rota (> 80 metros), aponta em direção à rota
  if (minDist > 80) {
    return calculateBearing(location, routeCoordinates[closestIdx]);
  }

  // 2. Caminha pela polyline a partir do vértice mais próximo acumulando distância à frente
  let accumulatedDist = 0;
  let targetIdx = closestIdx;

  for (let i = closestIdx; i < routeCoordinates.length - 1; i++) {
    const segDist = calculateDistanceMeters(routeCoordinates[i], routeCoordinates[i + 1]);
    accumulatedDist += segDist;
    targetIdx = i + 1;
    if (accumulatedDist >= lookaheadMeters) {
      break;
    }
  }

  // Se targetIdx for igual a closestIdx (ex: usuário no fim da rota)
  if (targetIdx === closestIdx) {
    if (closestIdx > 0) {
      return calculateBearing(routeCoordinates[closestIdx - 1], routeCoordinates[closestIdx]);
    }
    if (routeCoordinates.length >= 2) {
      return calculateBearing(routeCoordinates[0], routeCoordinates[1]);
    }
    return null;
  }

  // Se estiver a menos de 15m da polyline, usamos o próprio ponto da rota como origem,
  // garantindo que micro-oscilações de GPS na calçada não afetem o ângulo da rua.
  const startPt = minDist < 15 ? routeCoordinates[closestIdx] : location;
  const targetPt = routeCoordinates[targetIdx];

  return calculateBearing(startPt, targetPt);
}

export function useMapLocation(
  cameraRef: React.RefObject<CameraRef | null>,
  isNavigating = false,
  navigationOrientation: 'course' | 'north' = 'course',
  routeRef?: React.RefObject<GeoJSONFeatureCollection | null>,
) {
  const [currentLocation, setCurrentLocation] = useState<LngLat | null>(null);
  const [hasGpsFix, setHasGpsFix] = useState(false);
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [followGPS, setFollowGPS] = useState(false);
  const [zoom, setZoom] = useState(18.5);
  const [diagStatus, setDiagStatus] = useState<'ok' | 'error' | 'unknown'>('unknown');
  const [heading, setHeading] = useState<number>(0);

  const currentHeadingRef = useRef<number | null>(null);
  const lastLocationRef = useRef<LngLat | null>(null);
  const hasInitialCenteredRef = useRef(false);
  const lastCameraUpdateTimeRef = useRef(0);
  const lastCameraPositionRef = useRef<LngLat | null>(null);
  const lastCameraBearingRef = useRef<number | null>(null);

  // Refs síncronos para evitar reiniciar o efeito do GPS ao mudar estados
  const followGPSRef = useRef(followGPS);
  followGPSRef.current = followGPS;

  const isNavigatingRef = useRef(isNavigating);
  isNavigatingRef.current = isNavigating;

  const navigationOrientationRef = useRef(navigationOrientation);
  navigationOrientationRef.current = navigationOrientation;

  // ─── 1. Monitoramento do GPS do Dispositivo (Montado uma única vez) ───
  useEffect(() => {
    let mounted = true;
    let stopWatching: (() => void) | undefined;

    (async () => {
      const permission = await LocationService.requestPermission();
      if (!mounted) return;
      if (permission === 'denied' || permission === 'blocked') {
        setGpsError('Permissão de localização negada.');
        setDiagStatus('error');
        return;
      }

      try {
        const pos = await LocationService.getCurrentPosition();
        if (!mounted) return;
        const coords: LngLat = [pos.longitude, pos.latitude];
        setCurrentLocation(coords);
        lastLocationRef.current = coords;
        setHasGpsFix(true);
        setAccuracy(pos.accuracy);
        setSpeed(pos.speed);

        // Se houver rota calculada, alinha com a polyline azul imediatamente
        const activeRoute = routeRef?.current;
        let initialBearing: number | null = null;
        if (activeRoute && activeRoute.features && activeRoute.features.length > 0) {
          const rCoords = (activeRoute.features[0]?.geometry?.coordinates as LngLat[]) || [];
          if (rCoords.length >= 2) {
            initialBearing = getRouteBearing(coords, rCoords, 22);
          }
        }

        if (initialBearing !== null) {
          currentHeadingRef.current = initialBearing;
          setHeading(initialBearing);
        } else if (pos.heading !== null && pos.heading >= 0) {
          currentHeadingRef.current = pos.heading;
          setHeading(pos.heading);
        }

        setGpsError(null);
        setDiagStatus('ok');

        // Centraliza a câmera APENAS no primeiro fix de inicialização do app
        if (!hasInitialCenteredRef.current) {
          hasInitialCenteredRef.current = true;
          lastCameraPositionRef.current = coords;
          lastCameraBearingRef.current = isNavigatingRef.current && navigationOrientationRef.current !== 'north' ? (currentHeadingRef.current || 0) : 0;
          cameraRef.current?.setStop({
            center: coords,
            zoom: 18.5,
            pitch: isNavigatingRef.current ? 55 : 0,
            bearing: lastCameraBearingRef.current,
            duration: 800,
          });
        }
      } catch {
        if (mounted) {
          setGpsError('GPS buscando sinal...');
          setDiagStatus('error');
        }
      }

      stopWatching = LocationService.watchPosition(
        (update) => {
          if (!mounted) return;
          const coords: LngLat = [update.longitude, update.latitude];
          const prevLocation = lastLocationRef.current;
          const distM = prevLocation ? calculateDistanceMeters(prevLocation, coords) : 0;
          const userSpeed = update.speed ?? 0;

          // Usuário em movimento real (velocidade >= 0.8 m/s (~3 km/h) ou deslocamento >= 3.0 metros)
          const isMoving = userSpeed >= 0.8 || distM >= 3.0;

          // ─── Extração do Rumo: Polyline azul tem prioridade absoluta ───
          const activeRoute = routeRef?.current;
          let polylineBearing: number | null = null;
          if (activeRoute && activeRoute.features && activeRoute.features.length > 0) {
            const rCoords = (activeRoute.features[0]?.geometry?.coordinates as LngLat[]) || [];
            if (rCoords.length >= 2) {
              polylineBearing = getRouteBearing(coords, rCoords, 22);
            }
          }

          if (polylineBearing !== null) {
            // Segue rigorosamente a polyline azul da rota:
            // Alinha de frente para a rua e vira nas curvas/esquinas sem precisar de bússola magnética
            currentHeadingRef.current = polylineBearing;
            setHeading(polylineBearing);
            lastLocationRef.current = coords;
            setCurrentLocation(coords);
          } else if (isMoving) {
            // Fallback caso não haja rota: rumo pelo deslocamento do GPS
            let newHeading: number | null = null;
            if (update.heading !== null && update.heading >= 0) {
              newHeading = update.heading;
            } else if (prevLocation && distM >= 2.5) {
              newHeading = calculateBearing(prevLocation, coords);
            }

            if (newHeading !== null) {
              currentHeadingRef.current = newHeading;
              setHeading(newHeading);
            }
            lastLocationRef.current = coords;
            setCurrentLocation(coords);
          } else {
            // Em repouso (parado): mantém o rumo anterior para evitar qualquer giro
            if (distM >= 1.5) {
              setCurrentLocation(coords);
            }
          }

          setHasGpsFix(true);
          setAccuracy(update.accuracy);
          setSpeed(update.speed);
          setGpsError(null);
          setDiagStatus('ok');

          // Câmera: só move se followGPS estiver ativo
          if (followGPSRef.current) {
            const now = Date.now();

            if (isNavigatingRef.current) {
              // Navegação Ativa 3D: acompanha a condução e vira nas ruas
              const cameraDist = lastCameraPositionRef.current
                ? calculateDistanceMeters(lastCameraPositionRef.current, coords)
                : 999;

              const targetBearing = navigationOrientationRef.current !== 'north'
                ? (polylineBearing ?? currentHeadingRef.current ?? 0)
                : 0;

              // Verifica se o rumo da rua mudou (ex: virou esquina na polyline)
              const bearingChanged = lastCameraBearingRef.current !== null
                ? Math.abs(((targetBearing - lastCameraBearingRef.current + 540) % 360) - 180) >= 3.0
                : true;

              if (
                now - lastCameraUpdateTimeRef.current >= 450 &&
                (isMoving || cameraDist >= 2.0 || bearingChanged || !lastCameraPositionRef.current)
              ) {
                lastCameraUpdateTimeRef.current = now;
                lastCameraPositionRef.current = coords;
                lastCameraBearingRef.current = targetBearing;
                cameraRef.current?.setStop({
                  center: coords,
                  zoom: 18.5,
                  pitch: 55,
                  bearing: targetBearing,
                  duration: 500,
                });
              }
            } else {
              // Mapa Geral (2D): só ajusta se houver deslocamento relevante (>= 4.0m)
              // Não gira o mapa (bearing: 0, pitch: 0) e nunca fica "dançando" com ruídos
              if (now - lastCameraUpdateTimeRef.current >= 800 && distM >= 4.0) {
                lastCameraUpdateTimeRef.current = now;
                lastCameraPositionRef.current = coords;
                cameraRef.current?.setStop({
                  center: coords,
                  zoom: 18.5,
                  pitch: 0,
                  bearing: 0,
                  duration: 600,
                });
              }
            }
          }
        },
        (error) => {
          if (mounted) {
            setGpsError(`GPS: ${error.message}`);
            setDiagStatus('error');
          }
        },
      );
    })();

    return () => {
      mounted = false;
      stopWatching?.();
    };
  }, [cameraRef, routeRef]);

  // ─── 2. Sensor de Bússola Física (apenas se existir hardware real) ───
  useEffect(() => {
    let lastCompassTime = 0;

    const stopCompass = CompassService.start((compassHeading) => {
      // Se não houver rota ativa definida, usa o sensor se disponível
      if (!routeRef?.current) {
        currentHeadingRef.current = compassHeading;
        setHeading(compassHeading);

        if (isNavigatingRef.current && followGPSRef.current && navigationOrientationRef.current !== 'north') {
          const now = Date.now();
          if (now - lastCompassTime >= 400) {
            lastCompassTime = now;
            cameraRef.current?.setStop({
              bearing: compassHeading,
              duration: 350,
            });
          }
        }
      }
    });

    return () => {
      stopCompass();
    };
  }, [cameraRef, routeRef]);

  const centerOnUser = useCallback(
    (customZoom = 18.5) => {
      setFollowGPS(true);
      if (currentLocation) {
        lastCameraPositionRef.current = currentLocation;
        const targetBearing = navigationOrientation !== 'north' ? (currentHeadingRef.current || 0) : 0;
        lastCameraBearingRef.current = targetBearing;
        cameraRef.current?.setStop({
          center: currentLocation,
          zoom: customZoom,
          pitch: isNavigating ? 55 : 0,
          bearing: targetBearing,
          duration: 600,
        });
      }
    },
    [currentLocation, cameraRef, isNavigating, navigationOrientation],
  );

  return {
    currentLocation,
    setCurrentLocation,
    hasGpsFix,
    setHasGpsFix,
    speed,
    accuracy,
    gpsError,
    followGPS,
    setFollowGPS,
    zoom,
    setZoom,
    diagStatus,
    heading,
    setHeading,
    currentHeadingRef,
    centerOnUser,
  };
}
