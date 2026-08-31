import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MapStyleService } from '../../../services/map/MapStyleService';
import { MapType, MapTheme, getMapStyleUrl } from '../../../config/mapStyles';
import { OFFLINE_STYLE_URL } from '../../../services/OfflineMapService';
import { RoutingService } from '../../../services/routing/RoutingService';
import { GeocodingService } from '../../../services/geocoding/GeocodingService';
import type { Costing } from '../../../types/geo';

const FUEL_STORAGE_KEY = '@rotasimples:fuel_config';
const OFFLINE_MODE_STORAGE_KEY = '@rotasimples:offline_mode_active';

export function useMapPreferences() {
  const [mapType, setMapType] = useState<MapType>('standard');
  const [mapTheme, setMapTheme] = useState<MapTheme>('classic');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [costingMode, setCostingMode] = useState<Costing>('auto');
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Fuel HUD
  const [showFuelHUD, setShowFuelHUD] = useState(true);
  const [fuelConfig, setFuelConfig] = useState({ kmPerLiter: 10, pricePerLiter: 5.89 });

  useEffect(() => {
    (async () => {
      const prefs = await MapStyleService.loadPreferences();
      setMapType(prefs.mapType);
      setMapTheme(prefs.mapTheme);
      setHideCompleted(prefs.hideCompleted);
      setCostingMode(prefs.costingMode);

      try {
        const rawOffline = await AsyncStorage.getItem(OFFLINE_MODE_STORAGE_KEY);
        if (rawOffline !== null) {
          const active = JSON.parse(rawOffline);
          setIsOfflineMode(active);
          RoutingService.setForceOffline(active);
          GeocodingService.setForceOffline(active);
        }
      } catch {}

      try {
        const rawFuel = await AsyncStorage.getItem(FUEL_STORAGE_KEY);
        if (rawFuel) {
          const parsed = JSON.parse(rawFuel);
          const kmL = parseFloat(String(parsed.kmPerLiter).replace(',', '.')) || 10;
          const priceL = parseFloat(String(parsed.pricePerLiter).replace(',', '.')) || 5.89;
          setFuelConfig({ kmPerLiter: kmL, pricePerLiter: priceL });
        }
      } catch {}
    })();
  }, []);

  const updateOfflineMode = useCallback(async (active: boolean) => {
    setIsOfflineMode(active);
    RoutingService.setForceOffline(active);
    GeocodingService.setForceOffline(active);
    try {
      await AsyncStorage.setItem(OFFLINE_MODE_STORAGE_KEY, JSON.stringify(active));
    } catch {}
  }, []);

  const updateMapType = useCallback(async (type: MapType) => {
    setMapType(type);
    await MapStyleService.setMapType(type);
  }, []);

  const updateMapTheme = useCallback(async (theme: MapTheme) => {
    setMapTheme(theme);
    await MapStyleService.setMapTheme(theme);
  }, []);

  const updateHideCompleted = useCallback(async (hide: boolean) => {
    setHideCompleted(hide);
    await MapStyleService.setHideCompleted(hide);
  }, []);

  const updateCostingMode = useCallback(async (mode: Costing) => {
    setCostingMode(mode);
    await MapStyleService.setCostingMode(mode);
  }, []);

  const currentStyleUrl = useMemo(() => {
    if (isOfflineMode) {
      return OFFLINE_STYLE_URL;
    }
    return getMapStyleUrl(mapType, mapTheme);
  }, [isOfflineMode, mapType, mapTheme]);

  return {
    mapType,
    mapTheme,
    hideCompleted,
    costingMode,
    currentStyleUrl,
    updateMapType,
    updateMapTheme,
    updateHideCompleted,
    updateCostingMode,
    showFuelHUD,
    setShowFuelHUD,
    fuelConfig,
    setFuelConfig,
    isOfflineMode,
    updateOfflineMode,
  };
}
