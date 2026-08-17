import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation, {
  GeolocationResponse,
  GeolocationError,
  GeolocationOptions,
} from '@react-native-community/geolocation';
import type { LngLat } from '../../types/geo';

/** Current device location with all available GPS attributes */
export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null; // bearing (0-360, -1 when unavailable)
  speed: number | null; // m/s
  timestamp: number;
}

export type LocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'GPS_DISABLED'
  | 'TIMEOUT'
  | 'POSITION_UNAVAILABLE'
  | 'UNKNOWN';

export interface LocationError {
  code: LocationErrorCode;
  message: string;
  nativeCode?: number;
}

const DEFAULT_OPTIONS: GeolocationOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 10000,
  distanceFilter: 0,
};

const ERROR_CODE_MAP: Record<number, LocationErrorCode> = {
  1: 'PERMISSION_DENIED',
  2: 'POSITION_UNAVAILABLE',
  3: 'TIMEOUT',
};

/**
 * LocationService — Phase 3.
 *
 * Single source of truth for GPS on the device:
 * - permission handling (granted / denied)
 * - current position (lat, lng, accuracy, heading/bearing, speed)
 * - real-time position listener (watch)
 * - GPS disabled / permission denied handling
 */
export class LocationService {
  private static watcher: (() => void) | null = null;

  static get defaultOptions(): GeolocationOptions {
    return { ...DEFAULT_OPTIONS };
  }

  /** True when the app is listening for position updates */
  static get isWatching(): boolean {
    return LocationService.watcher !== null;
  }

  /**
   * Requests location permission.
   * Returns 'granted' | 'denied' | 'blocked'.
   */
  static async requestPermission(): Promise<'granted' | 'denied' | 'blocked'> {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
        if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
        return 'denied';
      } catch (err) {
        console.warn('[LocationService] permission error', err);
        return 'denied';
      }
    }

    // iOS: prompt happens on first request; assume granted here,
    // failures surface through getCurrentPosition errors.
    return 'granted';
  }

  /**
   * One-shot current position with full attributes.
   * Never assumes the GPS fix is exactly over a road — consumers must snap.
   */
  static getCurrentPosition(options = DEFAULT_OPTIONS): Promise<LocationUpdate> {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position: GeolocationResponse) => {
          resolve(LocationService.toUpdate(position));
        },
        (error: GeolocationError) => reject(LocationService.toError(error)),
        options,
      );
    });
  }

  /** Convenience: [longitude, latitude] only */
  static async getCurrentCoords(options?: GeolocationOptions): Promise<LngLat> {
    const pos = await LocationService.getCurrentPosition(options);
    return [pos.longitude, pos.latitude];
  }

  /**
   * Starts a real-time listener. Returns an unsubscribe function.
   */
  static watchPosition(
    onUpdate: (update: LocationUpdate) => void,
    onError: (error: LocationError) => void,
    options = DEFAULT_OPTIONS,
  ): () => void {
    const watchId = Geolocation.watchPosition(
      (position: GeolocationResponse) => onUpdate(LocationService.toUpdate(position)),
      (error: GeolocationError) => onError(LocationService.toError(error)),
      options,
    );

    const stop = () => Geolocation.clearWatch(watchId);
    LocationService.watcher = stop;
    return stop;
  }

  /** Stops the active watcher, if any */
  static stopWatching(): void {
    LocationService.watcher?.();
    LocationService.watcher = null;
  }

  /**
   * Maps a native geolocation error to a structured error.
   * GPS disabled on Android surfaces as POSITION_UNAVAILABLE (code 2).
   */
  private static toError(error: GeolocationError): LocationError {
    return {
      code: ERROR_CODE_MAP[error.code] ?? 'UNKNOWN',
      message: error.message,
      nativeCode: error.code,
    };
  }

  private static toUpdate(position: GeolocationResponse): LocationUpdate {
    const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
    return {
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      altitude: altitude ?? null,
      heading: heading ?? null,
      speed: speed ?? null,
      timestamp: position.timestamp,
    };
  }
}
