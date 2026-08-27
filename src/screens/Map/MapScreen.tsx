import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import {
  Map as MapLibreMap,
  MapRef,
  Camera,
  CameraRef,
  GeoJSONSource,
  Layer,
  Marker,
} from '@maplibre/maplibre-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { LocationService } from '../../services/gps/LocationService';
import { RoutingService } from '../../services/routing/RoutingService';
import { RouteOptimizationService } from '../../services/routing/RouteOptimizationService';
import { DatabaseService } from '../../storage/DatabaseService';
import { MapStyleService } from '../../services/map/MapStyleService';
import { MapType, MapTheme, getMapStyleUrl } from '../../config/mapStyles';
import { CustomMarkerPin } from '../../components/Map/CustomMarkerPin';
import { MapDisplayModal } from '../../components/Map/MapDisplayModal';
import { FloatingMapControls } from '../../components/Map/FloatingMapControls';
import { AddDeliveryModal } from '../../components/AddDeliveryModal';
import { DeliveryListsModal } from '../../components/Deliveries/DeliveryListsModal';
import { SideMenuModal } from '../../components/Map/SideMenuModal';
import { ConfigModal } from '../../components/Map/ConfigModal';
import { FuelHUDCard } from '../../components/Map/FuelHUDCard';
import { QuickActionsMenuModal } from '../../components/Map/QuickActionsMenuModal';
import { QuickRgModal } from '../../components/Map/QuickRgModal';
import { StopActionsModal } from '../../components/Map/StopActionsModal';
import type {
  DeliveryEntity,
  GeoJSONFeatureCollection,
  LngLat,
  FailReason,
  Costing,
  RouteStop,
} from '../../types/geo';
import { boundingBox, groupDeliveriesIntoStops } from '../../utils/geo';
import { useTheme } from '../../theme/ThemeContext';
import { createScreenStyles } from './MapScreenStyles';

// ─── Componentes extraídos ───────────────────────────────────────────────────
import { LassoOverlay } from './LassoOverlay';
import { PersistentFloatingBar } from './PersistentFloatingBar';
import { StopDetailSheet } from './StopDetailSheet';
import { MapBottomSheet } from './MapBottomSheet';
import type { LassoCanvasRef } from '../../components/Map/LassoCanvas';

// ─── Utilitário: Point-in-Polygon (ray-casting) ──────────────────────────────
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
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

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Bottom Sheet Snap Points ────────────────────────────────────────────────
const SNAP_EXPANDED = SCREEN_HEIGHT * 0.88;
const SNAP_HALF = SCREEN_HEIGHT * 0.54;
const SNAP_COLLAPSED = 105;

const TRANS_EXPANDED = 0;
const TRANS_HALF = SNAP_EXPANDED - SNAP_HALF;
const TRANS_COLLAPSED = SNAP_EXPANDED - SNAP_COLLAPSED;

// ─── Formatadores ────────────────────────────────────────────────────────────
const formatDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

const formatDuration = (s: number) => {
  const mins = Math.round(s / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }
  return `${mins} min`;
};

// ─── MapScreen ───────────────────────────────────────────────────────────────
export default function MapScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createScreenStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef | null>(null);

  // ── Animated Bottom Sheet ──
  const sheetTranslateY = useRef(new Animated.Value(TRANS_HALF)).current;
  const currentTranslateRef = useRef(TRANS_HALF);
  const [sheetState, setSheetState] = useState<'expanded' | 'half' | 'collapsed'>('half');

  // ── GPS state ──
  const [currentLocation, setCurrentLocation] = useState<LngLat | null>(null);
  const [hasGpsFix, setHasGpsFix] = useState(false);
  const [_speed, setSpeed] = useState<number | null>(null);
  const [_accuracy, setAccuracy] = useState<number | null>(null);
  const [_gpsError, setGpsError] = useState<string | null>(null);
  const [followGPS, setFollowGPS] = useState(false);
  const [_zoom, setZoom] = useState(13);
  const currentHeadingRef = useRef<number | null>(null);

  // ── Map display settings & preferences ──
  const [mapType, setMapType] = useState<MapType>('standard');
  const [mapTheme, setMapTheme] = useState<MapTheme>('classic');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [costingMode, setCostingMode] = useState<Costing>('auto');
  const [showLayersModal, setShowLayersModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showListsModal, setShowListsModal] = useState(false);

  // ── Deliveries + route ──
  const [deliveries, setDeliveries] = useState<DeliveryEntity[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [route, setRoute] = useState<GeoJSONFeatureCollection | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [routeNeedsOptimization, setRouteNeedsOptimization] = useState(false);

  // ── Stops / navigation ──
  const [activeStop, setActiveStop] = useState<RouteStop | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // ── Multi-Lasso Tool ──
  const [lassoMode, setLassoMode] = useState(false);
  const [lassoSubMode, setLassoSubMode] = useState<'draw' | 'pan'>('draw');
  const [geoLassoLoops, setGeoLassoLoops] = useState<Array<Array<LngLat>>>([]);
  const [lassoLoops, setLassoLoops] = useState<Array<Array<[number, number]>>>([]);
  const [lassoSelectedStopKeys, setLassoSelectedStopKeys] = useState<Set<string>>(new Set());
  const lassoCanvasRef = useRef<LassoCanvasRef>(null);

  // ── Quick Action Menu & RG Modals ──
  const [showQuickActionsModal, setShowQuickActionsModal] = useState(false);
  const [showQuickRgModal, setShowQuickRgModal] = useState(false);
  const [showStopActionsModal, setShowStopActionsModal] = useState(false);
  const [selectedStopForActions, setSelectedStopForActions] = useState<RouteStop | null>(null);

  // ── Config Modal + Fuel HUD ──
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showFuelHUD, setShowFuelHUD] = useState(false);
  const [fuelConfig, setFuelConfig] = useState({ kmPerLiter: 0, pricePerLiter: 0 });

  // ── Diagnóstico status badge ──
  const [diagStatus, setDiagStatus] = useState<'ok' | 'error' | 'unknown'>('unknown');

  // ── Keep currentTranslateRef in sync with animated value ──
  useEffect(() => {
    const id = sheetTranslateY.addListener(({ value }) => {
      currentTranslateRef.current = value;
    });
    return () => sheetTranslateY.removeListener(id);
  }, [sheetTranslateY]);

  // ── Load preferences on mount ──
  useEffect(() => {
    (async () => {
      const prefs = await MapStyleService.loadPreferences();
      setMapType(prefs.mapType);
      setMapTheme(prefs.mapTheme);
      setHideCompleted(prefs.hideCompleted);
      setCostingMode(prefs.costingMode);
    })();
  }, []);

  // ─── Memos de entregas/paradas ────────────────────────────────────────────
  const locatedDeliveries = useMemo(
    () => deliveries.filter((d) => d.latitude !== null && d.longitude !== null),
    [deliveries],
  );

  const orderedDeliveries = useMemo(() => {
    if (order.length > 0) {
      return order.map((idx) => locatedDeliveries[idx]).filter(Boolean);
    }
    return locatedDeliveries;
  }, [order, locatedDeliveries]);

  const routeStops: RouteStop[] = useMemo(
    () => groupDeliveriesIntoStops(orderedDeliveries),
    [orderedDeliveries],
  );

  const filteredOrderedDeliveries = useMemo(() => {
    if (!searchQuery.trim()) return orderedDeliveries;
    const q = searchQuery.toLowerCase();
    return orderedDeliveries.filter(
      (d) =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.address || '').toLowerCase().includes(q) ||
        (d.orderCode && d.orderCode.toLowerCase().includes(q)) ||
        (d.destination && d.destination.toLowerCase().includes(q)) ||
        (d.neighborhood && d.neighborhood.toLowerCase().includes(q)),
    );
  }, [orderedDeliveries, searchQuery]);

  const filteredStops: RouteStop[] = useMemo(
    () => groupDeliveriesIntoStops(filteredOrderedDeliveries),
    [filteredOrderedDeliveries],
  );

  const nextStop: RouteStop | null = useMemo(
    () => routeStops.find((s) => s.status !== 'completed') ?? null,
    [routeStops],
  );

  const stopTimes = useMemo(() => {
    const baseHour = 2;
    let baseMinute = 3;
    return filteredStops.map((_, i) => {
      if (i === 0) baseMinute = 3;
      else if (i === 1) baseMinute = 8;
      else if (i === 2) baseMinute = 24;
      else if (i === 3) baseMinute = 28;
      else if (i === 4) baseMinute = 30;
      else baseMinute += 6;
      const hourStr = String(baseHour).padStart(2, '0');
      const minStr = String(baseMinute % 60).padStart(2, '0');
      return `${hourStr}:${minStr}`;
    });
  }, [filteredStops]);

  const totalStopsCount = routeStops.length;
  const totalPackagesCount = deliveries.length;
  const currentStyleUrl = getMapStyleUrl(mapType, mapTheme);

  // ─── Bottom Sheet Animation ───────────────────────────────────────────────
  const animateToState = useCallback(
    (nextState: 'expanded' | 'half' | 'collapsed') => {
      setSheetState(nextState);
      const targetTrans =
        nextState === 'expanded'
          ? TRANS_EXPANDED
          : nextState === 'half'
          ? TRANS_HALF
          : TRANS_COLLAPSED;

      Animated.spring(sheetTranslateY, {
        toValue: targetTrans,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }).start();
    },
    [sheetTranslateY],
  );

  const panStartTranslate = useRef(TRANS_HALF);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          panStartTranslate.current = currentTranslateRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const newTrans = panStartTranslate.current + gestureState.dy;
          const clamped = Math.max(TRANS_EXPANDED, Math.min(TRANS_COLLAPSED, newTrans));
          sheetTranslateY.setValue(clamped);
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentT = currentTranslateRef.current;
          const vy = gestureState.vy;

          if (vy > 0.4) {
            animateToState(currentT < TRANS_HALF - 40 ? 'half' : 'collapsed');
            return;
          }
          if (vy < -0.4) {
            animateToState(currentT > TRANS_HALF + 40 ? 'half' : 'expanded');
            return;
          }

          const distToExpanded = Math.abs(currentT - TRANS_EXPANDED);
          const distToHalf = Math.abs(currentT - TRANS_HALF);
          const distToCollapsed = Math.abs(currentT - TRANS_COLLAPSED);
          const minDist = Math.min(distToExpanded, distToHalf, distToCollapsed);

          if (minDist === distToCollapsed) animateToState('collapsed');
          else if (minDist === distToHalf) animateToState('half');
          else animateToState('expanded');
        },
      }),
    [animateToState, sheetTranslateY],
  );

  const handleToggleSnap = () => {
    if (sheetState === 'collapsed') animateToState('half');
    else if (sheetState === 'half') animateToState('expanded');
    else animateToState('half');
  };

  // ─── GPS Tracking ─────────────────────────────────────────────────────────
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
  }, [followGPS]);

  // ─── Load Deliveries ──────────────────────────────────────────────────────
  const reloadDeliveries = useCallback(() => {
    const active = DatabaseService.getActiveList();
    const loaded = DatabaseService.getAllDeliveries(active?.id);
    setDeliveries(loaded);
    const completed = new Set(
      loaded.filter((d) => d.status === 'completed').map((d) => d.id),
    );
    setCompletedIds(completed);
    setRoute(null);
    setRouteInfo(null);
    if (loaded.filter((d) => d.latitude !== null && d.longitude !== null).length > 0) {
      setRouteNeedsOptimization(true);
    }
  }, []);

  useEffect(() => {
    reloadDeliveries();
  }, [reloadDeliveries]);

  // ─── Camera Fit ───────────────────────────────────────────────────────────
  const fitRoute = useCallback(() => {
    const coords: LngLat[] = [];
    if (route) {
      route.features.forEach(
        (f) =>
          f.geometry.type === 'LineString' &&
          f.geometry.coordinates.forEach((c) => coords.push(c as LngLat)),
      );
    }
    if (currentLocation) coords.push(currentLocation);
    locatedDeliveries.forEach((d) => coords.push([d.longitude!, d.latitude!]));

    if (coords.length > 0) {
      const [w, s, e, n] = boundingBox(coords);
      cameraRef.current?.fitBounds(
        [w, s, e, n],
        { padding: { top: 80, right: 40, bottom: 280, left: 40 }, duration: 800 },
      );
    }
  }, [route, currentLocation, locatedDeliveries]);

  // ─── Optimize Route ───────────────────────────────────────────────────────
  const optimizeRoute = useCallback(
    async (originOverride?: LngLat) => {
      if (locatedDeliveries.length === 0) {
        Alert.alert('Sem Entregas', 'Importe uma planilha antes de otimizar a rota.');
        return;
      }
      setOptimizing(true);
      try {
        let userCoords: LngLat | null = originOverride || null;

        if (!userCoords) {
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const freshPos = await LocationService.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 6000,
                maximumAge: 0,
              });
              userCoords = [freshPos.longitude, freshPos.latitude];
              setCurrentLocation(userCoords);
              setHasGpsFix(true);
              console.log(`[Map] GPS confirmado (tentativa ${attempt}):`, userCoords);
              break;
            } catch (gpsErr) {
              console.warn(`[Map] GPS tentativa ${attempt} falhou:`, gpsErr);
              if (attempt === 2 && currentLocation) {
                userCoords = currentLocation;
                console.warn('[Map] Usando última posição GPS conhecida:', userCoords);
              }
            }
          }
        }

        if (!userCoords) {
          Alert.alert(
            'GPS Indisponível',
            'Não foi possível obter sua localização. Ative o GPS e aguarde o sinal antes de otimizar a rota.',
          );
          setOptimizing(false);
          return;
        }

        const uniqueStops = groupDeliveriesIntoStops(locatedDeliveries);
        const pendingStops = uniqueStops.filter((s) => s.status !== 'completed');

        if (pendingStops.length === 0) {
          Alert.alert('Aviso', 'Todas as entregas já foram concluídas.');
          setOptimizing(false);
          return;
        }

        const stopCoordinates: LngLat[] = pendingStops.map((s) => [s.longitude, s.latitude]);

        const optimization = await RouteOptimizationService.optimize(
          userCoords,
          stopCoordinates,
          { useDuration: true },
        );

        optimization.order.forEach((stopIndex, seqNum) => {
          const targetStop = pendingStops[stopIndex];
          targetStop.deliveries.forEach((del) => {
            DatabaseService.updateDeliverySequence(del.id, seqNum + 1);
          });
        });

        const active = DatabaseService.getActiveList();
        const reloaded = DatabaseService.getAllDeliveries(active?.id);
        setDeliveries(reloaded);

        const waypoints: LngLat[] = [
          userCoords,
          ...optimization.order.map((i) => stopCoordinates[i]),
        ];

        const result = await RoutingService.route(waypoints, {
          costing: costingMode,
          heading: currentHeadingRef.current,
        });
        setRoute(result.geojson);
        setRouteInfo({ distance: result.distance, duration: result.duration });
        setRouteNeedsOptimization(false);

        setTimeout(() => fitRoute(), 400);
      } catch (error) {
        console.warn('[Map] optimize failed', error);
        Alert.alert('Erro', 'Não foi possível otimizar a rota. Verifique a conexão com a internet.');
      } finally {
        setOptimizing(false);
      }
    },
    [currentLocation, locatedDeliveries, costingMode, fitRoute],
  );

  // ─── Recalculate Route ────────────────────────────────────────────────────
  const recalculateRoute = useCallback(async () => {
    const remainingStops = routeStops.filter((s) => s.status !== 'completed');
    if (remainingStops.length === 0) {
      setRoute(null);
      setRouteInfo(null);
      return;
    }

    try {
      let userCoords: LngLat | null = null;
      try {
        const freshPos = await LocationService.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 6000,
          maximumAge: 0,
        });
        userCoords = [freshPos.longitude, freshPos.latitude];
        setCurrentLocation(userCoords);
        setHasGpsFix(true);
      } catch {
        userCoords = currentLocation;
      }

      if (!userCoords) return;

      const waypoints: LngLat[] = [
        userCoords,
        ...remainingStops.map((s) => [s.longitude, s.latitude] as LngLat),
      ];

      const result = await RoutingService.route(waypoints, {
        costing: costingMode,
        heading: currentHeadingRef.current,
      });
      setRoute(result.geojson);
      setRouteInfo({ distance: result.distance, duration: result.duration });
    } catch (e) {
      console.warn('[Map] recalculateRoute error', e);
    }
  }, [routeStops, currentLocation, costingMode]);

  // ─── Stop Actions ─────────────────────────────────────────────────────────
  const selectStop = useCallback((stop: RouteStop) => {
    setActiveStop(stop);
    cameraRef.current?.setStop({
      center: [stop.longitude, stop.latitude],
      zoom: 16,
      duration: 600,
    });
  }, []);

  const completeStop = useCallback(
    (stop: RouteStop) => {
      stop.deliveries.forEach((d) => {
        DatabaseService.updateDeliveryStatus(d.id, 'completed', { deliveredAt: Date.now() });
      });
      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);
      const completed = new Set(
        reloaded.filter((d) => d.status === 'completed').map((d) => d.id),
      );
      setCompletedIds(completed);
      setActiveStop(null);
      recalculateRoute();
    },
    [recalculateRoute],
  );

  const skipStop = useCallback(
    (stop: RouteStop, reason: FailReason = 'absent') => {
      stop.deliveries.forEach((d) => {
        DatabaseService.updateDeliveryStatus(d.id, 'failed', { failReason: reason });
      });
      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);
      setActiveStop(null);
      recalculateRoute();
    },
    [recalculateRoute],
  );

  // ─── Multi-Lasso Tool ─────────────────────────────────────────────────────
  const computeEnclosedStopsFromGeo = useCallback(
    (geoLoops: Array<Array<LngLat>>) => {
      if (geoLoops.length === 0 || routeStops.length === 0) {
        setLassoSelectedStopKeys(new Set());
        return;
      }
      const enclosedKeys = new Set<string>();
      routeStops.forEach((stop) => {
        const stopCoord: [number, number] = [stop.longitude, stop.latitude];
        for (const loop of geoLoops) {
          if (loop.length >= 3 && pointInPolygon(stopCoord, loop)) {
            enclosedKeys.add(stop.key);
            break;
          }
        }
      });
      setLassoSelectedStopKeys(enclosedKeys);
    },
    [routeStops],
  );

  const handleCancelLasso = useCallback(() => {
    setLassoMode(false);
    setLassoSubMode('draw');
    setGeoLassoLoops([]);
    setLassoLoops([]);
    lassoCanvasRef.current?.clearStroke();
    setLassoSelectedStopKeys(new Set());
  }, []);

  const handleUndoLasso = useCallback(() => {
    if (geoLassoLoops.length > 0) {
      const nextGeoLoops = geoLassoLoops.slice(0, -1);
      setGeoLassoLoops(nextGeoLoops);
      setLassoLoops((prev) => prev.slice(0, -1));
      computeEnclosedStopsFromGeo(nextGeoLoops);
    } else {
      setLassoSelectedStopKeys(new Set());
    }
  }, [geoLassoLoops, computeEnclosedStopsFromGeo]);

  const handleToggleLasso = useCallback(() => {
    if (lassoMode) {
      handleCancelLasso();
    } else {
      setLassoMode(true);
      setLassoSubMode('draw');
      setGeoLassoLoops([]);
      setLassoLoops([]);
      lassoCanvasRef.current?.clearStroke();
      setLassoSelectedStopKeys(new Set());
    }
  }, [lassoMode, handleCancelLasso]);

  const handleConfirmLasso = useCallback(async () => {
    if (geoLassoLoops.length === 0 && lassoLoops.length === 0) {
      handleCancelLasso();
      return;
    }
    setOptimizing(true);
    try {
      let userCoords = currentLocation;
      if (!userCoords) {
        try {
          const freshPos = await LocationService.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          });
          userCoords = [freshPos.longitude, freshPos.latitude];
          setCurrentLocation(userCoords);
          setHasGpsFix(true);
        } catch {
          userCoords = currentLocation;
        }
      }

      if (!userCoords) {
        Alert.alert('GPS Indisponível', 'Ative o GPS para otimizar as rotas pelas áreas selecionadas.');
        setOptimizing(false);
        return;
      }

      const addedKeys = new Set<string>();
      const clusters: RouteStop[][] = [];

      geoLassoLoops.forEach((loop) => {
        const stopsInThisLoop: RouteStop[] = [];
        routeStops.forEach((stop) => {
          if (stop.status === 'completed') return;
          if (addedKeys.has(stop.key)) return;
          const stopCoord: [number, number] = [stop.longitude, stop.latitude];
          if (pointInPolygon(stopCoord, loop)) {
            stopsInThisLoop.push(stop);
            addedKeys.add(stop.key);
          }
        });
        if (stopsInThisLoop.length > 0) clusters.push(stopsInThisLoop);
      });

      const unassignedStops: RouteStop[] = [];
      routeStops.forEach((stop) => {
        if (stop.status === 'completed') return;
        if (!addedKeys.has(stop.key)) unassignedStops.push(stop);
      });
      if (unassignedStops.length > 0) clusters.push(unassignedStops);

      const finalOrderedStops: RouteStop[] = [];
      let currentStartPoint: LngLat = userCoords;

      for (const cluster of clusters) {
        if (cluster.length === 1) {
          finalOrderedStops.push(cluster[0]);
          currentStartPoint = [cluster[0].longitude, cluster[0].latitude];
        } else if (cluster.length > 1) {
          const clusterCoords: LngLat[] = cluster.map((s) => [s.longitude, s.latitude]);
          try {
            const clusterOpt = await RouteOptimizationService.optimize(
              currentStartPoint,
              clusterCoords,
              { useDuration: true },
            );
            clusterOpt.order.forEach((idx) => finalOrderedStops.push(cluster[idx]));
            const lastStop = cluster[clusterOpt.order[clusterOpt.order.length - 1]];
            currentStartPoint = [lastStop.longitude, lastStop.latitude];
          } catch (optErr) {
            console.warn('[Lasso] Cluster optimization fallback to linear order:', optErr);
            cluster.forEach((s) => finalOrderedStops.push(s));
            const lastStop = cluster[cluster.length - 1];
            currentStartPoint = [lastStop.longitude, lastStop.latitude];
          }
        }
      }

      let seqIndex = 1;
      finalOrderedStops.forEach((st) => {
        st.deliveries.forEach((del) => {
          DatabaseService.updateDeliverySequence(del.id, seqIndex++);
        });
      });

      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);

      const waypoints: LngLat[] = [
        userCoords,
        ...finalOrderedStops.map((s) => [s.longitude, s.latitude] as LngLat),
      ];

      const result = await RoutingService.route(waypoints, {
        costing: costingMode,
        heading: currentHeadingRef.current,
      });

      setRoute(result.geojson);
      setRouteInfo({ distance: result.distance, duration: result.duration });
      setRouteNeedsOptimization(false);

      setLassoMode(false);
      setLassoSubMode('draw');
      setGeoLassoLoops([]);
      setLassoLoops([]);
      lassoCanvasRef.current?.clearStroke();
      setLassoSelectedStopKeys(new Set());

      setTimeout(() => fitRoute(), 400);
    } catch (error) {
      console.warn('[Map] handleConfirmLasso failed:', error);
      Alert.alert('Erro', 'Não foi possível otimizar as rotas pelas áreas selecionadas.');
    } finally {
      setOptimizing(false);
    }
  }, [
    geoLassoLoops,
    lassoLoops,
    currentLocation,
    routeStops,
    costingMode,
    fitRoute,
    handleCancelLasso,
  ]);

  // ─── Lasso PanResponder (otimizado com LassoCanvas ref) ───────────────────
  const lassoPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (e) => {
          if (!lassoMode) return false;
          return e.nativeEvent.touches && e.nativeEvent.touches.length === 1;
        },
        onMoveShouldSetPanResponder: (e) => {
          if (!lassoMode) return false;
          return e.nativeEvent.touches && e.nativeEvent.touches.length === 1;
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderTerminate: () => {
          lassoCanvasRef.current?.clearStroke();
        },
        onPanResponderGrant: (e) => {
          if (e.nativeEvent.touches && e.nativeEvent.touches.length > 1) return;
          const { locationX, locationY } = e.nativeEvent;
          // Inicia o traçado via ref imperativo — sem setState, sem re-render
          lassoCanvasRef.current?.beginStroke(locationX, locationY);
        },
        onPanResponderMove: (e) => {
          if (e.nativeEvent.touches && e.nativeEvent.touches.length > 1) {
            // 2º dedo: descarta o traçado para mover o mapa
            lassoCanvasRef.current?.clearStroke();
            return;
          }
          const { locationX, locationY } = e.nativeEvent;
          // Adiciona ponto via ref — atualiza SVG sem re-render React
          lassoCanvasRef.current?.addPoint(locationX, locationY);
        },
        onPanResponderRelease: async () => {
          const stroke = lassoCanvasRef.current?.getPoints() ?? [];
          lassoCanvasRef.current?.clearStroke();

          if (stroke.length < 4) return;

          // Converte pontos de tela para coordenadas geográficas
          const sampledStroke = stroke.filter(
            (_, idx) => idx % 2 === 0 || idx === stroke.length - 1,
          );
          const geoPoints: LngLat[] = [];

          if (mapRef.current) {
            for (const pt of sampledStroke) {
              try {
                const lngLat = await mapRef.current.unproject(pt);
                if (lngLat && Array.isArray(lngLat) && lngLat.length >= 2) {
                  geoPoints.push(lngLat as LngLat);
                }
              } catch {
                // ignore
              }
            }
          }

          if (geoPoints.length >= 3) {
            const closedGeoLoop: LngLat[] = [...geoPoints, geoPoints[0]];
            setGeoLassoLoops((prev) => {
              const updated = [...prev, closedGeoLoop];
              computeEnclosedStopsFromGeo(updated);
              return updated;
            });
          }

          const newScreenLoop: [number, number][] = [...stroke, stroke[0]];
          setLassoLoops((prev) => [...prev, newScreenLoop]);
        },
      }),
    [lassoMode, computeEnclosedStopsFromGeo],
  );

  // ─── Delivery Markers ─────────────────────────────────────────────────────
  const deliveryMarkers = useMemo(
    () =>
      routeStops
        .filter((stop) => {
          if (!hideCompleted) return true;
          return stop.status !== 'completed';
        })
        .map((stop) => {
          const isNext = nextStop?.key === stop.key;
          const isActive = activeStop?.key === stop.key;
          const isDone = stop.status === 'completed';
          const isFailed = stop.status === 'failed';
          const isLassoSelected = lassoSelectedStopKeys.has(stop.key);
          const coords: LngLat = [stop.longitude, stop.latitude];

          return (
            <Marker
              key={`stop-${stop.key}`}
              id={`stop-${stop.key}`}
              lngLat={coords}
              anchor="bottom"
              onPress={() => selectStop(stop)}
            >
              <CustomMarkerPin
                sequenceNumber={stop.stopNumber}
                status={stop.status}
                isActive={isActive}
                isNext={isNext}
                isCompleted={isDone}
                isFailed={isFailed}
                isLassoSelected={isLassoSelected}
                count={stop.totalCount}
              />
            </Marker>
          );
        }),
    [routeStops, nextStop, activeStop, hideCompleted, lassoSelectedStopKeys, selectStop],
  );

  // ─── GeoJSON Strings (memoizados) ─────────────────────────────────────────
  const routeGeoJsonString = useMemo(() => {
    if (!route || !route.features || route.features.length === 0) return null;
    const coords = route.features[0]?.geometry?.coordinates;
    if (!coords || !Array.isArray(coords) || coords.length < 2) return null;
    return JSON.stringify(route);
  }, [route]);

  const geoLassoGeoJsonString = useMemo(() => {
    if (geoLassoLoops.length === 0) return null;
    const features = geoLassoLoops.map((loop, idx) => ({
      type: 'Feature' as const,
      id: `lasso-loop-${idx}`,
      properties: { index: idx + 1 },
      geometry: { type: 'Polygon' as const, coordinates: [loop] },
    }));
    return JSON.stringify({ type: 'FeatureCollection', features });
  }, [geoLassoLoops]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Background Map ── */}
      <MapLibreMap
        ref={mapRef}
        style={styles.map}
        mapStyle={currentStyleUrl}
        compass={false}
        scaleBar={false}
        onRegionDidChange={(e) => {
          setZoom(e.nativeEvent.zoom);
          if (e.nativeEvent.userInteraction && followGPS) {
            setFollowGPS(false);
          }
        }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [-42.8188, -22.9192], zoom: 13 }}
          minZoom={3}
          maxZoom={20}
        />

        {/* Route Polyline */}
        {routeGeoJsonString && (
          <GeoJSONSource id="route-source" data={routeGeoJsonString}>
            <Layer
              id="route-casing"
              type="line"
              source="route-source"
              paint={{ 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.95 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-line"
              type="line"
              source="route-source"
              paint={{ 'line-color': '#2563EB', 'line-width': 5.5, 'line-opacity': 1.0 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}

        {/* Lasso Polygons (geográficos, ancorados no mapa) */}
        {geoLassoGeoJsonString && (
          <GeoJSONSource id="lasso-geo-source" data={geoLassoGeoJsonString}>
            <Layer
              id="lasso-polygon-fill"
              type="fill"
              source="lasso-geo-source"
              paint={{ 'fill-color': 'rgba(99, 102, 241, 0.22)' }}
            />
            <Layer
              id="lasso-polygon-stroke"
              type="line"
              source="lasso-geo-source"
              paint={{
                'line-color': '#4F46E5',
                'line-width': 2.8,
                'line-dasharray': [3, 2],
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}

        {/* Badges numéricos '1', '2', '3' dos laços */}
        {geoLassoLoops.map((loop, loopIdx) => {
          if (loop.length < 3) return null;
          const lngs = loop.map((p) => p[0]);
          const lats = loop.map((p) => p[1]);
          const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
          const maxLat = Math.max(...lats);
          return (
            <Marker
              key={`geo-loop-badge-${loopIdx}`}
              id={`geo-loop-badge-${loopIdx}`}
              lngLat={[avgLng, maxLat]}
              anchor="bottom"
            >
              <View style={styles.loopBadgeCircle}>
                <Text style={styles.loopBadgeText} accessibilityLabel={`Área ${loopIdx + 1}`}>
                  {loopIdx + 1}
                </Text>
              </View>
            </Marker>
          );
        })}

        {/* Current User Marker */}
        {currentLocation && (
          <Marker id="user-location" lngLat={currentLocation} anchor="center">
            <View style={styles.userMarkerRing}>
              <View style={styles.userMarkerOuter}>
                <View style={styles.userMarkerInner} />
              </View>
            </View>
          </Marker>
        )}

        {/* Custom Delivery Markers */}
        {deliveryMarkers}
      </MapLibreMap>

      {/* ── Multi-Lasso Overlay ── */}
      {lassoMode && (
        <LassoOverlay
          lassoPanHandlers={lassoPanResponder.panHandlers}
          lassoSubMode={lassoSubMode}
          lassoCanvasRef={lassoCanvasRef}
          routeInfoDuration={routeInfo ? formatDuration(routeInfo.duration) : '3h 58m'}
          routeInfoDistance={routeInfo ? formatDistance(routeInfo.distance) : '40.5 km'}
          completedCount={completedIds.size}
          totalPackagesCount={totalPackagesCount}
          onCancel={handleCancelLasso}
          onUndo={handleUndoLasso}
          onToggleMode={() => setLassoSubMode(lassoSubMode === 'draw' ? 'pan' : 'draw')}
          onConfirm={handleConfirmLasso}
        />
      )}

      {/* ── Persistent Floating Bar (Otimizar / Finalizar) ── */}
      {!lassoMode && (
        <PersistentFloatingBar
          sheetTranslateY={sheetTranslateY}
          snapExpandedBottom={SNAP_EXPANDED}
          routeNeedsOptimization={routeNeedsOptimization}
          optimizing={optimizing}
          onOptimize={() => optimizeRoute()}
        />
      )}

      {/* ── Fuel HUD Card ── */}
      <FuelHUDCard
        visible={showFuelHUD}
        kmPerLiter={fuelConfig.kmPerLiter}
        pricePerLiter={fuelConfig.pricePerLiter}
        distanceRemainingM={routeInfo?.distance ?? 0}
        durationRemainingS={routeInfo?.duration ?? 0}
        onClose={() => setShowFuelHUD(false)}
      />

      {/* ── Floating Action Controls (Right) ── */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: sheetTranslateY.interpolate({
              inputRange: [TRANS_EXPANDED, TRANS_HALF, TRANS_COLLAPSED],
              outputRange: [0, 0.2, 1],
              extrapolate: 'clamp',
            }),
            transform: [
              {
                translateX: sheetTranslateY.interpolate({
                  inputRange: [TRANS_EXPANDED, TRANS_HALF, TRANS_COLLAPSED],
                  outputRange: [70, 30, 0],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
        ]}
        pointerEvents={sheetState === 'expanded' ? 'none' : 'box-none'}
      >
        <FloatingMapControls
          followGPS={followGPS}
          hasRoute={!!route}
          lassoMode={lassoMode}
          diagStatus={diagStatus}
          onOpenLayers={() => setShowLayersModal(true)}
          onFitBounds={fitRoute}
          onToggleFollowGPS={() => {
            const next = !followGPS;
            setFollowGPS(next);
            if (currentLocation) {
              cameraRef.current?.setStop({ center: currentLocation, zoom: 15, duration: 800 });
            }
          }}
          onToggleLasso={handleToggleLasso}
          onOpenSettings={() => setShowConfigModal(true)}
        />
      </Animated.View>

      {/* ── Map Layers Modal ── */}
      <MapDisplayModal
        visible={showLayersModal}
        selectedType={mapType}
        selectedTheme={mapTheme}
        hideCompleted={hideCompleted}
        costingMode={costingMode}
        onClose={() => setShowLayersModal(false)}
        onSelectType={async (t) => {
          setMapType(t);
          await MapStyleService.setMapType(t);
        }}
        onSelectTheme={async (th) => {
          setMapTheme(th);
          await MapStyleService.setMapTheme(th);
        }}
        onToggleHideCompleted={async (val) => {
          setHideCompleted(val);
          await MapStyleService.setHideCompleted(val);
        }}
        onSelectCostingMode={async (cm) => {
          setCostingMode(cm);
          await MapStyleService.setCostingMode(cm);
          if (route) recalculateRoute();
        }}
      />

      {/* ── Add Delivery Modal ── */}
      <AddDeliveryModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={() => {
          setShowAddModal(false);
          reloadDeliveries();
        }}
      />

      {/* ── Side Menu Modal ── */}
      <SideMenuModal
        visible={showMenuModal}
        onClose={() => setShowMenuModal(false)}
        onImportPress={() => navigation.navigate('Import')}
        onAddStopPress={() => setShowAddModal(true)}
        onFitRoutePress={fitRoute}
        onLayersPress={() => setShowLayersModal(true)}
        onSettingsPress={() => navigation.navigate('Settings')}
        onDiagnosticPress={() => navigation.navigate('Diagnostic')}
        onListsPress={() => setShowListsModal(true)}
        onClearRoutePress={() => {
          Alert.alert(
            'Limpar Rota',
            'Deseja apagar todas as paradas e a rota atual?',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Limpar Tudo',
                style: 'destructive',
                onPress: () => {
                  DatabaseService.clearDeliveries();
                  setDeliveries([]);
                  setOrder([]);
                  setRoute(null);
                  setRouteInfo(null);
                  setCompletedIds(new Set());
                  setRouteNeedsOptimization(false);
                },
              },
            ],
          );
        }}
        totalDeliveriesCount={deliveries.length}
      />

      {/* ── Config Modal ── */}
      <ConfigModal
        visible={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onReoptimize={() => optimizeRoute(currentLocation || undefined)}
        onFuelConfirmed={(cfg) => {
          setFuelConfig({
            kmPerLiter: parseFloat(cfg.kmPerLiter.replace(',', '.')) || 0,
            pricePerLiter: parseFloat(cfg.pricePerLiter.replace(',', '.')) || 0,
          });
          setShowFuelHUD(true);
        }}
        routeDistanceKm={(routeInfo?.distance ?? 0) / 1000}
        routeDurationMin={Math.round((routeInfo?.duration ?? 0) / 60)}
      />

      {/* ── Quick Actions Modal ── */}
      <QuickActionsMenuModal
        visible={showQuickActionsModal}
        onClose={() => setShowQuickActionsModal(false)}
        onReoptimize={() => optimizeRoute(currentLocation || undefined)}
        onShareRoute={() => Alert.alert('Compartilhar Rota', 'Link de rota gerado com sucesso!')}
      />

      {/* ── Quick RG Modal ── */}
      <QuickRgModal
        visible={showQuickRgModal}
        onClose={() => setShowQuickRgModal(false)}
      />

      {/* ── Stop Actions Modal ── */}
      <StopActionsModal
        visible={showStopActionsModal}
        stop={selectedStopForActions}
        onClose={() => {
          setShowStopActionsModal(false);
          setSelectedStopForActions(null);
        }}
        onMarkPackages={() => Alert.alert('Marcar Pacotes', 'Pacotes marcados como conferidos.')}
        onGenerateDoc={() => {
          setShowStopActionsModal(false);
          setShowQuickRgModal(true);
        }}
        onAddStop={() => setShowAddModal(true)}
        onEditStop={() => {
          if (selectedStopForActions) {
            Alert.alert('Editar Parada', `Editar: ${selectedStopForActions.address}`);
          }
        }}
        onRemoveStop={() => {
          if (selectedStopForActions) {
            Alert.alert('Remover Parada', 'Deseja remover esta parada?', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Remover',
                style: 'destructive',
                onPress: () => {
                  selectedStopForActions.deliveries.forEach((d) => {
                    DatabaseService.deleteDelivery(d.id);
                  });
                  reloadDeliveries();
                },
              },
            ]);
          }
        }}
      />

      {/* ── Draggable Bottom Sheet ── */}
      <MapBottomSheet
        sheetTranslateY={sheetTranslateY}
        snapExpanded={SNAP_EXPANDED}
        panHandlers={panResponder.panHandlers}
        sheetState={sheetState}
        onToggleSnap={handleToggleSnap}
        paddingBottom={Math.max(insets.bottom, 12)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filteredStops={filteredStops}
        nextStop={nextStop}
        stopTimes={stopTimes}
        totalStopsCount={totalStopsCount}
        totalPackagesCount={totalPackagesCount}
        routeInfo={routeInfo}
        optimizing={optimizing}
        routeNeedsOptimization={routeNeedsOptimization}
        currentLocation={currentLocation}
        onOpenMenu={() => setShowMenuModal(true)}
        onOpenQuickActions={() => setShowQuickActionsModal(true)}
        onSelectStop={selectStop}
        onLongPressStop={(stop) => {
          setSelectedStopForActions(stop);
          setShowStopActionsModal(true);
        }}
        onOptimize={(origin) => optimizeRoute(origin)}
        onCenterGps={() => {
          if (currentLocation) {
            cameraRef.current?.setStop({ center: currentLocation, zoom: 16, duration: 600 });
          }
        }}
        onAddStop={() => setShowAddModal(true)}
        onNavigateImport={() => navigation.navigate('Import')}
        formatDistance={formatDistance}
        formatDuration={formatDuration}
      />

      {/* ── Stop Detail Sheet ── */}
      {activeStop && (
        <StopDetailSheet
          activeStop={activeStop}
          onClose={() => setActiveStop(null)}
          onComplete={completeStop}
          onSkip={skipStop}
        />
      )}

      {/* ── Delivery Lists Modal ── */}
      <DeliveryListsModal
        visible={showListsModal}
        onClose={() => setShowListsModal(false)}
        onListChanged={() => reloadDeliveries()}
      />

      {/* ── Loading Overlay ── */}
      {optimizing && (
        <View style={styles.loadingModalOverlay} pointerEvents="auto">
          <View style={styles.loadingModalCard}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingModalTitle}>Otimizando rotas</Text>
            <Text style={styles.loadingModalSub}>
              Calculando a melhor sequência e tempo estimado com Mapbox...
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
