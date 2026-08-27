import AsyncStorage from '@react-native-async-storage/async-storage';
import { MapType, MapTheme, getMapStyleUrl } from '../../config/mapStyles';
import type { Costing, RoutingProvider } from '../../types/geo';

export interface MapPreferences {
  mapType: MapType;
  mapTheme: MapTheme;
  hideCompleted: boolean;
  costingMode: Costing;
  routingProvider: RoutingProvider;
}

const STORAGE_KEYS = {
  MAP_TYPE: '@routes_map_type',
  MAP_THEME: '@routes_map_theme',
  HIDE_COMPLETED: '@routes_hide_completed_stops',
  COSTING_MODE: '@routes_costing_mode',
  ROUTING_PROVIDER: '@routes_routing_provider',
};

const DEFAULT_PREFERENCES: MapPreferences = {
  mapType: 'standard',
  mapTheme: 'classic',
  hideCompleted: false,
  costingMode: 'auto',
  routingProvider: 'mapbox',
};

export class MapStyleService {
  private static cachedPrefs: MapPreferences = { ...DEFAULT_PREFERENCES };
  private static initialized = false;

  /**
   * Initializes preferences from AsyncStorage.
   */
  static async loadPreferences(): Promise<MapPreferences> {
    try {
      const [typeVal, themeVal, hideVal, costVal, providerVal] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.MAP_TYPE),
        AsyncStorage.getItem(STORAGE_KEYS.MAP_THEME),
        AsyncStorage.getItem(STORAGE_KEYS.HIDE_COMPLETED),
        AsyncStorage.getItem(STORAGE_KEYS.COSTING_MODE),
        AsyncStorage.getItem(STORAGE_KEYS.ROUTING_PROVIDER),
      ]);

      MapStyleService.cachedPrefs = {
        mapType: (typeVal as MapType) || DEFAULT_PREFERENCES.mapType,
        mapTheme: (themeVal as MapTheme) || DEFAULT_PREFERENCES.mapTheme,
        hideCompleted: hideVal !== null ? hideVal === 'true' : DEFAULT_PREFERENCES.hideCompleted,
        costingMode: (costVal as Costing) || DEFAULT_PREFERENCES.costingMode,
        routingProvider: (providerVal as RoutingProvider) || DEFAULT_PREFERENCES.routingProvider,
      };
      MapStyleService.initialized = true;
      return { ...MapStyleService.cachedPrefs };
    } catch (error) {
      console.warn('[MapStyleService] Error loading preferences:', error);
      return { ...DEFAULT_PREFERENCES };
    }
  }

  /**
   * Updates routing provider and persists to storage.
   */
  static async setRoutingProvider(provider: RoutingProvider): Promise<void> {
    MapStyleService.cachedPrefs.routingProvider = provider;
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ROUTING_PROVIDER, provider);
    } catch (e) {
      console.warn('[MapStyleService] setRoutingProvider error:', e);
    }
  }


  /**
   * Returns current cached preferences synchronously.
   */
  static getCachedPreferences(): MapPreferences {
    return { ...MapStyleService.cachedPrefs };
  }

  /**
   * Updates map type and persists to storage.
   */
  static async setMapType(mapType: MapType): Promise<void> {
    MapStyleService.cachedPrefs.mapType = mapType;
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.MAP_TYPE, mapType);
    } catch (e) {
      console.warn('[MapStyleService] setMapType error:', e);
    }
  }

  /**
   * Updates map theme and persists to storage.
   */
  static async setMapTheme(mapTheme: MapTheme): Promise<void> {
    MapStyleService.cachedPrefs.mapTheme = mapTheme;
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.MAP_THEME, mapTheme);
    } catch (e) {
      console.warn('[MapStyleService] setMapTheme error:', e);
    }
  }

  /**
   * Toggles hiding completed stops and persists to storage.
   */
  static async setHideCompleted(hideCompleted: boolean): Promise<void> {
    MapStyleService.cachedPrefs.hideCompleted = hideCompleted;
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.HIDE_COMPLETED, String(hideCompleted));
    } catch (e) {
      console.warn('[MapStyleService] setHideCompleted error:', e);
    }
  }

  /**
   * Updates routing costing mode (auto, truck, motorcycle, bicycle).
   */
  static async setCostingMode(costingMode: Costing): Promise<void> {
    MapStyleService.cachedPrefs.costingMode = costingMode;
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.COSTING_MODE, costingMode);
    } catch (e) {
      console.warn('[MapStyleService] setCostingMode error:', e);
    }
  }

  /**
   * Gets current style URL based on active preferences.
   */
  static getActiveStyleUrl(): string {
    return getMapStyleUrl(
      MapStyleService.cachedPrefs.mapType,
      MapStyleService.cachedPrefs.mapTheme,
    );
  }
}
