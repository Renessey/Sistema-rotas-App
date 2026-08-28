import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapStyleService } from '../../../services/map/MapStyleService';
import { MapType, MapTheme, getMapStyleUrl } from '../../../config/mapStyles';
import type { Costing } from '../../../types/geo';

export function useMapPreferences() {
  const [mapType, setMapType] = useState<MapType>('standard');
  const [mapTheme, setMapTheme] = useState<MapTheme>('classic');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [costingMode, setCostingMode] = useState<Costing>('auto');

  // Fuel HUD
  const [showFuelHUD, setShowFuelHUD] = useState(false);
  const [fuelConfig, setFuelConfig] = useState({ kmPerLiter: 0, pricePerLiter: 0 });

  useEffect(() => {
    (async () => {
      const prefs = await MapStyleService.loadPreferences();
      setMapType(prefs.mapType);
      setMapTheme(prefs.mapTheme);
      setHideCompleted(prefs.hideCompleted);
      setCostingMode(prefs.costingMode);
    })();
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

  const currentStyleUrl = useMemo(
    () => getMapStyleUrl(mapType, mapTheme),
    [mapType, mapTheme],
  );

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
  };
}
