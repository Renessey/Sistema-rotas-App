import { useState, useEffect, useRef, useCallback } from 'react';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { LocationService } from '../../../services/gps/LocationService';
import type { LngLat } from '../../../types/geo';

export function useMapLocation(cameraRef: React.RefObject<CameraRef | null>) {
  const [currentLocation, setCurrentLocation] = useState<LngLat | null>(null);
  const [hasGpsFix, setHasGpsFix] = useState(false);
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [followGPS, setFollowGPS] = useState(false);
  const [zoom, setZoom] = useState(13);
  const [diagStatus, setDiagStatus] = useState<'ok' | 'error' | 'unknown'>('unknown');
  const currentHeadingRef = useRef<number | null>(null);

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
        setHasGpsFix(true);
        setAccuracy(pos.accuracy);
        setSpeed(pos.speed);
        if (pos.heading !== null && pos.heading >= 0) {
          currentHeadingRef.current = pos.heading;
        }
        setGpsError(null);
        setDiagStatus('ok');
        cameraRef.current?.setStop({ center: coords, zoom: 14, duration: 800 });
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
          setCurrentLocation(coords);
          setHasGpsFix(true);
          setAccuracy(update.accuracy);
          setSpeed(update.speed);
          if (update.heading !== null && update.heading >= 0) {
            currentHeadingRef.current = update.heading;
          }
          setGpsError(null);
          setDiagStatus('ok');
          if (followGPS) {
            cameraRef.current?.setStop({ center: coords, zoom: 15, duration: 800 });
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
  }, [followGPS, cameraRef]);

  const centerOnUser = useCallback(
    (customZoom = 16) => {
      if (currentLocation) {
        cameraRef.current?.setStop({ center: currentLocation, zoom: customZoom, duration: 600 });
      }
    },
    [currentLocation, cameraRef],
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
    currentHeadingRef,
    centerOnUser,
  };
}
