import { MapStyleService } from '../src/services/map/MapStyleService';
import { getMapStyleUrl, MAP_TYPES, MAP_THEMES } from '../src/config/mapStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] || null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

describe('Map Styles & Preferences Module', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  test('MAP_TYPES and MAP_THEMES contain all required options', () => {
    expect(MAP_TYPES.map((t) => t.id)).toEqual(['standard', 'satellite', 'terrain']);
    expect(MAP_THEMES.map((th) => th.id)).toEqual(['classic', 'apple', 'minimal', 'dark']);
  });

  test('getMapStyleUrl returns correct style URLs for different themes', () => {
    const standardClassic = getMapStyleUrl('standard', 'classic');
    expect(standardClassic).toContain('navigation-day-v1');

    const standardDark = getMapStyleUrl('standard', 'dark');
    expect(standardDark).toContain('navigation-night-v1');

    const standardApple = getMapStyleUrl('standard', 'apple');
    expect(standardApple).toContain('streets-v12');

    const standardMinimal = getMapStyleUrl('standard', 'minimal');
    expect(standardMinimal).toContain('light-v11');

    const satelliteClassic = getMapStyleUrl('satellite', 'classic');
    expect(satelliteClassic).toContain('satellite-streets-v12');

    const terrainClassic = getMapStyleUrl('terrain', 'classic');
    expect(terrainClassic).toContain('outdoors-v12');
  });

  test('MapStyleService loads default preferences when empty', async () => {
    const prefs = await MapStyleService.loadPreferences();
    expect(prefs.mapType).toBe('standard');
    expect(prefs.mapTheme).toBe('classic');
    expect(prefs.hideCompleted).toBe(false);
    expect(prefs.costingMode).toBe('auto');
  });

  test('MapStyleService persists and updates map type', async () => {
    await MapStyleService.setMapType('satellite');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@routes_map_type', 'satellite');

    const prefs = await MapStyleService.loadPreferences();
    expect(prefs.mapType).toBe('satellite');
  });

  test('MapStyleService persists and updates map theme', async () => {
    await MapStyleService.setMapTheme('dark');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@routes_map_theme', 'dark');

    const prefs = await MapStyleService.loadPreferences();
    expect(prefs.mapTheme).toBe('dark');
  });

  test('MapStyleService toggles hideCompleted preference', async () => {
    await MapStyleService.setHideCompleted(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@routes_hide_completed_stops', 'true');

    const prefs = await MapStyleService.loadPreferences();
    expect(prefs.hideCompleted).toBe(true);
  });

  test('MapStyleService updates costing mode', async () => {
    await MapStyleService.setCostingMode('truck');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@routes_costing_mode', 'truck');

    const prefs = await MapStyleService.loadPreferences();
    expect(prefs.costingMode).toBe('truck');
  });
});
