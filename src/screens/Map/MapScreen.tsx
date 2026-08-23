import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  TextInput,
  ScrollView,
  PanResponder,
} from 'react-native';
import {
  Map as MapLibreMap,
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
import { ValhallaService } from '../../services/routing/ValhallaService';
import { RouteOptimizationService } from '../../services/routing/RouteOptimizationService';
import { DatabaseService } from '../../storage/DatabaseService';
import { NavigationLauncher } from '../../services/navigation/NavigationLauncher';
import { MapStyleService } from '../../services/map/MapStyleService';
import { MapType, MapTheme, getMapStyleUrl } from '../../config/mapStyles';
import { CustomMarkerPin } from '../../components/Map/CustomMarkerPin';
import { MapDisplayModal } from '../../components/Map/MapDisplayModal';
import { FloatingMapControls } from '../../components/Map/FloatingMapControls';
import { AddDeliveryModal } from '../../components/AddDeliveryModal';
import { DeliveryListsModal } from '../../components/Deliveries/DeliveryListsModal';
import { SideMenuModal } from '../../components/Map/SideMenuModal';
import type {
  DeliveryEntity,
  GeoJSONFeatureCollection,
  LngLat,
  FailReason,
  Costing,
} from '../../types/geo';
import { boundingBox } from '../../utils/geo';
import { spacing, radius, shadows } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// 3 Snap Points for the Bottom Sheet
const SNAP_EXPANDED = SCREEN_HEIGHT * 0.88;
const SNAP_HALF = SCREEN_HEIGHT * 0.54;
const SNAP_COLLAPSED = 105;

const TRANS_EXPANDED = 0;
const TRANS_HALF = SNAP_EXPANDED - SNAP_HALF;
const TRANS_COLLAPSED = SNAP_EXPANDED - SNAP_COLLAPSED;

interface StopItemProps {
  delivery: DeliveryEntity;
  index: number;
  isNext: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  timeStr: string;
  isLastItem: boolean;
  onSelect: (delivery: DeliveryEntity) => void;
}

const StopTimelineRow = React.memo(
  ({
    delivery,
    index,
    isNext,
    isCompleted,
    isFailed,
    timeStr,
    isLastItem,
    onSelect,
  }: StopItemProps) => {
    const seqStr = String(index + 1).padStart(2, '0');

    return (
      <View style={styles.stopTimelineRow}>
        {/* Left Column: Timeline Line + Badge Node */}
        <View style={styles.nodeColumn}>
          <View
            style={[
              styles.timelineBadge,
              isNext && styles.timelineBadgeNext,
              isCompleted && styles.timelineBadgeCompleted,
              isFailed && styles.timelineBadgeFailed,
            ]}
          >
            <Text
              style={[
                styles.timelineBadgeText,
                (isCompleted || isFailed) && styles.timelineBadgeTextWhite,
              ]}
            >
              {isCompleted ? '✓' : isFailed ? '✕' : seqStr}
            </Text>
          </View>
          {!isLastItem && <View style={styles.timelineVerticalLine} />}
        </View>

        {/* Right Column: Stop Card */}
        <Pressable
          style={({ pressed }) => [
            styles.stopCard,
            isNext && styles.stopCardNext,
            pressed && styles.stopCardPressed,
          ]}
          onPress={() => onSelect(delivery)}
        >
          {/* Top row: Time + Status Badge */}
          <View style={styles.stopCardHeader}>
            <Text style={styles.stopTimeText}>{timeStr}</Text>

            <View
              style={[
                styles.statusPill,
                isCompleted && styles.statusPillCompleted,
                isFailed && styles.statusPillFailed,
              ]}
            >
              <Text style={styles.statusPillIcon}>
                {isCompleted ? '✅' : isFailed ? '❌' : '📦'}
              </Text>
              <Text style={styles.statusPillText}>
                {isCompleted ? 'Entregue' : isFailed ? 'Insucesso' : 'Pendente'}
              </Text>
            </View>
          </View>

          {/* Main Address line + Chevron */}
          <View style={styles.stopCardBody}>
            <Text
              style={styles.stopAddressText}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {delivery.destination || delivery.address || delivery.name}
              {delivery.bairro ? ` · ${delivery.bairro}` : ''}
              {delivery.city ? `, ${delivery.city}` : ''}
              {delivery.zipCode ? ` (${delivery.zipCode})` : ''}
            </Text>
            <Text style={styles.cardChevron}>›</Text>
          </View>
        </Pressable>
      </View>
    );
  },
  (prev, next) =>
    prev.delivery.id === next.delivery.id &&
    prev.delivery.status === next.delivery.status &&
    prev.isNext === next.isNext &&
    prev.isCompleted === next.isCompleted &&
    prev.isFailed === next.isFailed &&
    prev.timeStr === next.timeStr &&
    prev.index === next.index &&
    prev.isLastItem === next.isLastItem,
);

export default function MapScreen({ navigation }: Props) {
  const { colors: _themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);

  // Animated Bottom Sheet Translation (Hardware-accelerated Native Driver 60-120 FPS)
  const sheetTranslateY = useRef(new Animated.Value(TRANS_HALF)).current;
  const currentTranslateRef = useRef(TRANS_HALF);
  const [sheetState, setSheetState] = useState<'expanded' | 'half' | 'collapsed'>('half');

  // GPS state
  const [currentLocation, setCurrentLocation] = useState<LngLat>([-42.8188, -22.9192]);
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [followGPS, setFollowGPS] = useState(false);
  const [zoom, setZoom] = useState(13);

  // Map display settings & preferences
  const [mapType, setMapType] = useState<MapType>('standard');
  const [mapTheme, setMapTheme] = useState<MapTheme>('classic');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [costingMode, setCostingMode] = useState<Costing>('auto');
  const [showLayersModal, setShowLayersModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showListsModal, setShowListsModal] = useState(false);

  // Deliveries + route
  const [deliveries, setDeliveries] = useState<DeliveryEntity[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [route, setRoute] = useState<GeoJSONFeatureCollection | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [_routeNetwork, setRouteNetwork] = useState(true);

  // Stops / navigation
  const [activeStop, setActiveStop] = useState<DeliveryEntity | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Keep currentTranslateRef in sync with animated value
  useEffect(() => {
    const id = sheetTranslateY.addListener(({ value }) => {
      currentTranslateRef.current = value;
    });
    return () => sheetTranslateY.removeListener(id);
  }, [sheetTranslateY]);

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      const prefs = await MapStyleService.loadPreferences();
      setMapType(prefs.mapType);
      setMapTheme(prefs.mapTheme);
      setHideCompleted(prefs.hideCompleted);
      setCostingMode(prefs.costingMode);
    })();
  }, []);

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

  const nextStop = useMemo(() => {
    return (
      orderedDeliveries.find((d) => !completedIds.has(d.id) && d.status !== 'completed') ?? null
    );
  }, [orderedDeliveries, completedIds]);

  /* ─── Bottom Sheet Animation Helper (Native Driver) ─── */
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

  /* ─── PanResponder for Dragging the Bottom Sheet ─── */
  const panStartTranslate = useRef(TRANS_HALF);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dy) > 4;
        },
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
            if (currentT < TRANS_HALF - 40) {
              animateToState('half');
            } else {
              animateToState('collapsed');
            }
            return;
          }

          if (vy < -0.4) {
            if (currentT > TRANS_HALF + 40) {
              animateToState('half');
            } else {
              animateToState('expanded');
            }
            return;
          }

          const distToExpanded = Math.abs(currentT - TRANS_EXPANDED);
          const distToHalf = Math.abs(currentT - TRANS_HALF);
          const distToCollapsed = Math.abs(currentT - TRANS_COLLAPSED);

          const minDist = Math.min(distToExpanded, distToHalf, distToCollapsed);

          if (minDist === distToCollapsed) {
            animateToState('collapsed');
          } else if (minDist === distToHalf) {
            animateToState('half');
          } else {
            animateToState('expanded');
          }
        },
      }),
    [animateToState, sheetTranslateY],
  );

  const handleToggleSnap = () => {
    if (sheetState === 'collapsed') {
      animateToState('half');
    } else if (sheetState === 'half') {
      animateToState('expanded');
    } else {
      animateToState('half');
    }
  };

  /* ─── GPS Tracking ─── */
  useEffect(() => {
    let mounted = true;
    let stopWatching: (() => void) | undefined;

    (async () => {
      const permission = await LocationService.requestPermission();
      if (!mounted) return;
      if (permission === 'denied' || permission === 'blocked') {
        setGpsError('Permissão de localização negada.');
        return;
      }

      try {
        const pos = await LocationService.getCurrentPosition();
        if (!mounted) return;
        setCurrentLocation([pos.longitude, pos.latitude]);
        setAccuracy(pos.accuracy);
        setSpeed(pos.speed);
        cameraRef.current?.setStop({
          center: [pos.longitude, pos.latitude],
          zoom: 14,
          duration: 800,
        });
      } catch {
        if (mounted) setGpsError('GPS desligado ou indisponível.');
      }

      stopWatching = LocationService.watchPosition(
        (update) => {
          if (!mounted) return;
          setCurrentLocation([update.longitude, update.latitude]);
          setAccuracy(update.accuracy);
          setSpeed(update.speed);
          setGpsError(null);
          if (followGPS) {
            cameraRef.current?.setStop({
              center: [update.longitude, update.latitude],
              zoom: 15,
              duration: 800,
            });
          }
        },
        (error) => {
          if (mounted) setGpsError(`GPS: ${error.message}`);
        },
      );
    })();

    return () => {
      mounted = false;
      stopWatching?.();
    };
  }, [followGPS]);

  /* ─── Load Deliveries ─── */
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
  }, []);

  useEffect(() => {
    reloadDeliveries();
  }, [reloadDeliveries]);

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

  /* ─── Camera Fit ─── */
  const fitRoute = useCallback(() => {
    const coords: LngLat[] = [];
    if (route) {
      route.features.forEach((f) =>
        f.geometry.type === 'LineString' &&
        f.geometry.coordinates.forEach((c) => coords.push(c as LngLat)),
      );
    }
    coords.push(currentLocation);
    locatedDeliveries.forEach((d) => coords.push([d.longitude!, d.latitude!]));

    if (coords.length > 0) {
      const [w, s, e, n] = boundingBox(coords);
      cameraRef.current?.fitBounds(
        [w, s, e, n],
        { padding: { top: 80, right: 40, bottom: 280, left: 40 }, duration: 800 },
      );
    }
  }, [route, currentLocation, locatedDeliveries]);

  /* ─── Optimize Route ─── */
  const optimizeRoute = useCallback(async () => {
    if (locatedDeliveries.length === 0) {
      Alert.alert('Sem Entregas', 'Importe uma planilha antes de otimizar a rota.');
      return;
    }
    setOptimizing(true);
    try {
      // 1. Obtém posição mais recente do GPS do usuário
      let userCoords = currentLocation;
      try {
        const freshPos = await LocationService.getCurrentPosition();
        userCoords = [freshPos.longitude, freshPos.latitude];
        setCurrentLocation(userCoords);
      } catch {
        // mantém currentLocation
      }

      const pendingIndices: number[] = [];
      const stops = locatedDeliveries.map((d, idx) => {
        if (d.status !== 'completed') pendingIndices.push(idx);
        return [d.snappedLongitude ?? d.longitude!, d.snappedLatitude ?? d.latitude!] as LngLat;
      });

      const optimizationStops = pendingIndices.map((i) => stops[i]);

      if (optimizationStops.length === 0) {
        Alert.alert('Aviso', 'Todas as entregas já foram concluídas.');
        setOptimizing(false);
        return;
      }

      // 2. Otimização TSP temporal (visando menor tempo de entrega)
      const optimization = await RouteOptimizationService.optimize(
        userCoords,
        optimizationStops,
        { useDuration: true },
      );

      const newOrder = optimization.order.map((i) => pendingIndices[i]);
      setOrder(newOrder);

      // 3. Salva a sequência no banco de dados
      newOrder.forEach((stopIdx, sequenceIndex) => {
        DatabaseService.updateDeliverySequence(locatedDeliveries[stopIdx].id, sequenceIndex + 1);
      });

      // Recarrega do banco para sincronizar estados das entregas
      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);

      // 4. Calcula o traçado 100% sobre a malha viária real iniciando no GPS
      const waypoints = [userCoords, ...newOrder.map((i) => stops[i])];
      const result = await ValhallaService.route(waypoints, { costing: costingMode });
      setRoute(result.geojson);
      setRouteInfo({ distance: result.distance, duration: result.duration });
      setRouteNetwork(result.fromRoadNetwork);

      setTimeout(() => fitRoute(), 400);
    } catch (error) {
      console.warn('[Map] optimize failed', error);
      Alert.alert('Erro', 'Não foi possível otimizar a rota.');
    } finally {
      setOptimizing(false);
    }
  }, [currentLocation, locatedDeliveries, costingMode, fitRoute]);

  /* ─── Auto Proximity Optimization on Load/Import ─── */
  useEffect(() => {
    if (route || locatedDeliveries.length === 0 || !currentLocation || optimizing) return;

    // Run proximity optimization from current GPS location
    optimizeRoute();
  }, [locatedDeliveries.length, currentLocation, optimizeRoute, optimizing, route]);

  const recalculateRoute = useCallback(async () => {
    const remaining = orderedDeliveries.filter(
      (d) => !completedIds.has(d.id) && d.status !== 'completed',
    );
    if (remaining.length === 0) {
      setRoute(null);
      setRouteInfo(null);
      return;
    }

    try {
      let userCoords = currentLocation;
      try {
        const freshPos = await LocationService.getCurrentPosition();
        userCoords = [freshPos.longitude, freshPos.latitude];
        setCurrentLocation(userCoords);
      } catch {
        // mantém currentLocation
      }

      const stops = remaining.map(
        (d) => [d.snappedLongitude ?? d.longitude!, d.snappedLatitude ?? d.latitude!] as LngLat,
      );
      const result = await ValhallaService.route([userCoords, ...stops], {
        costing: costingMode,
      });
      setRoute(result.geojson);
      setRouteInfo({ distance: result.distance, duration: result.duration });
      setRouteNetwork(result.fromRoadNetwork);
    } catch (e) {
      console.warn('[Map] recalculateRoute error', e);
    }
  }, [orderedDeliveries, completedIds, currentLocation, costingMode]);

  /* ─── Stop Actions ─── */
  const selectStop = useCallback((delivery: DeliveryEntity) => {
    setActiveStop(delivery);
    if (delivery.latitude !== null && delivery.longitude !== null) {
      cameraRef.current?.setStop({
        center: [delivery.longitude, delivery.latitude],
        zoom: 16,
        duration: 600,
      });
    }
  }, []);

  const completeStop = useCallback(
    (delivery: DeliveryEntity) => {
      const stopId = delivery.id;
      DatabaseService.updateDeliveryStatus(stopId, 'completed', { deliveredAt: Date.now() });
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === stopId ? { ...d, status: 'completed', deliveredAt: Date.now() } : d,
        ),
      );
      setCompletedIds((prev) => new Set(prev).add(stopId));
      setActiveStop(null);
      recalculateRoute();
    },
    [recalculateRoute],
  );

  const skipStop = useCallback(
    (delivery: DeliveryEntity, reason: FailReason = 'absent') => {
      const stopId = delivery.id;
      DatabaseService.updateDeliveryStatus(stopId, 'failed', { failReason: reason });
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === stopId ? { ...d, status: 'failed', failReason: reason } : d,
        ),
      );
      setCompletedIds((prev) => new Set(prev).add(stopId));
      setActiveStop(null);
      recalculateRoute();
    },
    [recalculateRoute],
  );

  /* ─── Delivery Markers ─── */
  const deliveryMarkers = useMemo(() => {
    const sequenceMap = new Map<number, number>();
    order.forEach((stopIdx, i) => {
      const d = locatedDeliveries[stopIdx];
      if (d) sequenceMap.set(d.id, i);
    });

    const grouped = new Map<string, { deliveries: DeliveryEntity[] }>();
    locatedDeliveries.forEach((d) => {
      const key = `${d.longitude!.toFixed(6)},${d.latitude!.toFixed(6)}`;
      if (!grouped.has(key)) grouped.set(key, { deliveries: [] });
      grouped.get(key)!.deliveries.push(d);
    });

    return Array.from(grouped.entries())
      .filter(([_, group]) => {
        if (!hideCompleted) return true;
        return !group.deliveries.every(
          (d) => completedIds.has(d.id) || d.status === 'completed',
        );
      })
      .map(([key, group]) => {
        const ds = group.deliveries;
        const primaryD = ds[0];
        const seq = sequenceMap.get(primaryD.id);

        const isActive = !!(activeStop && ds.some((d) => d.id === activeStop.id));
        const isNext = !!(nextStop && ds.some((d) => d.id === nextStop.id));
        const isDone = ds.every((d) => completedIds.has(d.id) || d.status === 'completed');
        const isFailed = ds.some((d) => d.status === 'failed');

        const coords: LngLat = [primaryD.longitude!, primaryD.latitude!];

        return (
          <Marker
            key={key}
            id={`group-${key}`}
            lngLat={coords}
            anchor="bottom"
            onPress={() => selectStop(primaryD)}
          >
            <Pressable onPress={() => selectStop(primaryD)}>
              <CustomMarkerPin
                sequenceNumber={seq !== undefined ? seq + 1 : '?'}
                status={primaryD.status}
                isActive={isActive}
                isNext={isNext}
                isCompleted={isDone}
                isFailed={isFailed}
                count={ds.length}
              />
            </Pressable>
          </Marker>
        );
      });
  }, [locatedDeliveries, order, activeStop, nextStop, completedIds, hideCompleted, selectStop]);

  const currentStyleUrl = getMapStyleUrl(mapType, mapTheme);
  const totalStopsCount = orderedDeliveries.length;

  const stopTimes = useMemo(() => {
    const baseHour = 2;
    let baseMinute = 3;
    return orderedDeliveries.map((_, i) => {
      if (i === 0) baseMinute = 3;
      else if (i === 1) baseMinute = 8;
      else if (i === 2) baseMinute = 24;
      else if (i === 3) baseMinute = 28;
      else if (i === 4) baseMinute = 30;
      else baseMinute += 5;

      const hourStr = String(baseHour).padStart(2, '0');
      const minStr = String(baseMinute % 60).padStart(2, '0');
      return `${hourStr}:${minStr}`;
    });
  }, [orderedDeliveries]);

  return (
    <View style={styles.container}>
      {/* ── Background Map ── */}
      <MapLibreMap
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
        {route && (
          <GeoJSONSource id="route-source" data={route}>
            <Layer
              id="route-casing"
              type="line"
              paint={{
                'line-color': '#FFFFFF',
                'line-width': 8,
                'line-opacity': 0.85,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-line"
              type="line"
              paint={{
                'line-color': '#2563EB',
                'line-width': 5.5,
                'line-opacity': 0.98,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}

        {/* Current User Marker */}
        <Marker id="user-location" lngLat={currentLocation} anchor="center">
          <View style={styles.userMarkerRing}>
            <View style={styles.userMarkerOuter}>
              <View style={styles.userMarkerInner} />
            </View>
          </View>
        </Marker>

        {/* Custom Delivery Markers */}
        {deliveryMarkers}
      </MapLibreMap>

      {/* Floating Action Controls on Right */}
      <FloatingMapControls
        followGPS={followGPS}
        hasRoute={!!route}
        onOpenLayers={() => setShowLayersModal(true)}
        onFitBounds={fitRoute}
        onToggleFollowGPS={() => {
          const next = !followGPS;
          setFollowGPS(next);
          cameraRef.current?.setStop({ center: currentLocation, zoom: 15, duration: 800 });
        }}
      />

      {/* Map Layers Modal */}
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

      {/* Add Delivery Modal */}
      <AddDeliveryModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={() => {
          setShowAddModal(false);
          reloadDeliveries();
        }}
      />

      {/* Side Menu Modal (Hamburger Menu ☰) */}
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
                },
              },
            ],
          );
        }}
        totalDeliveriesCount={deliveries.length}
      />

      {/* ── DRAGGABLE BOTTOM SHEET (Photos 1 & 2) ── */}
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            height: SNAP_EXPANDED,
            transform: [{ translateY: sheetTranslateY }],
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        {/* Drag Handle Area (PanResponder Attached) */}
        <View {...panResponder.panHandlers} style={styles.dragZone}>
          <Pressable onPress={handleToggleSnap} hitSlop={10} style={styles.handleContainer}>
            <View style={styles.handle} />
          </Pressable>

          {/* 1. Search Bar Header */}
          <View style={styles.searchRow}>
            {/* Hamburger Button ☰ */}
            <Pressable
              style={styles.iconBtn}
              onPress={() => setShowMenuModal(true)}
              hitSlop={8}
            >
              <Text style={styles.hamburgerIcon}>☰</Text>
            </Pressable>

            {/* Search Input Box */}
            <View style={styles.searchInputContainer}>
              <Text style={styles.searchLensIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar e adicionar..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              <Pressable
                onPress={() => {
                  Alert.alert('Scanner de Código', 'Abrindo leitor de código de barras/QR para bipar encomendas...');
                }}
                hitSlop={6}
              >
                <Text style={styles.scannerIcon}>⛶</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  Alert.alert('Busca por Voz', 'Fale o endereço ou nome do destinatário...');
                }}
                hitSlop={6}
              >
                <Text style={styles.micIcon}>🎙️</Text>
              </Pressable>
            </View>

            {/* Filter / Sliders Button 🎚️ */}
            <Pressable
              style={styles.iconBtn}
              onPress={() => setShowLayersModal(true)}
              hitSlop={8}
            >
              <Text style={styles.slidersIcon}>🎚️</Text>
            </Pressable>
          </View>
        </View>

        {/* Scrollable Content */}
        {sheetState !== 'collapsed' && (
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredOrderedDeliveries.length === 0 ? (
              /* ── EMPTY STATE / ROTAS OVERVIEW (Screenshot 2) ── */
              <View>
                {/* 1. Header: Rotas & Status */}
                <View style={styles.rotasHeaderRow}>
                  <Text style={styles.rotasTitle}>Rotas</Text>
                  <View style={styles.rotasStatusBadge}>
                    <View style={styles.rotasStatusDot} />
                    <Text style={styles.rotasStatusText}>Em progresso</Text>
                  </View>
                </View>

                {/* 2. Metrics Card (3 columns) */}
                <View style={styles.metricsCard}>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricIcon}>📍</Text>
                    <Text style={styles.metricVal}>{totalStopsCount}</Text>
                    <Text style={styles.metricLbl}>Paradas</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricCol}>
                    <Text style={styles.metricIcon}>🛣️</Text>
                    <Text style={styles.metricVal}>
                      {routeInfo ? formatDistance(routeInfo.distance) : '0 km'}
                    </Text>
                    <Text style={styles.metricLbl}>Distância</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricCol}>
                    <Text style={styles.metricIcon}>🕒</Text>
                    <Text style={styles.metricVal}>
                      {routeInfo ? formatDuration(routeInfo.duration) : '--:--'}
                    </Text>
                    <Text style={styles.metricLbl}>Duração</Text>
                  </View>
                </View>

                {/* 3. Route Origin Row */}
                <View style={styles.originSection}>
                  <View style={styles.originDotCol}>
                    <View style={styles.originDot} />
                    <View style={styles.originLine} />
                  </View>

                  <Pressable
                    style={styles.originInfo}
                    onPress={() => {
                      Alert.alert(
                        'Origem da Rota',
                        'Início da otimização configurado na sua localização GPS atual.',
                      );
                    }}
                  >
                    <View style={styles.originTextWrap}>
                      <Text style={styles.originTitle}>Origem da rota</Text>
                      <Text style={styles.originSubtitle}>Início da otimização</Text>
                    </View>
                    <Text style={styles.chevronIcon}>›</Text>
                  </Pressable>
                </View>

                {/* 4. Add Stop Row */}
                <View style={styles.addStopSection}>
                  <View style={styles.originDotCol}>
                    <View style={styles.addDot}>
                      <Text style={styles.addDotPlus}>+</Text>
                    </View>
                    <View style={styles.originLine} />
                  </View>

                  <Pressable
                    style={styles.originInfo}
                    onPress={() => setShowAddModal(true)}
                  >
                    <View style={styles.originTextWrap}>
                      <Text style={styles.originTitle}>Adicionar</Text>
                      <Text style={styles.originSubtitle}>Toque aqui para começar</Text>
                    </View>
                    <Text style={styles.chevronIcon}>›</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* ── ACTIVE / OPTIMIZED DELIVERIES (Screenshot 1) ── */
              <View>
                {/* 1. Route Origin Section */}
                <View style={styles.originSection}>
                  <View style={styles.originDotCol}>
                    <View style={styles.originDot} />
                    <View style={styles.originLine} />
                  </View>

                  <Pressable
                    style={styles.originInfo}
                    onPress={() => {
                      Alert.alert(
                        'Origem da Rota',
                        'Início da otimização configurado na sua localização GPS atual.',
                      );
                    }}
                  >
                    <View style={styles.originTextWrap}>
                      <Text style={styles.originTitle}>Origem da rota</Text>
                      <Text style={styles.originSubtitle}>Início da otimização</Text>
                    </View>
                    <Text style={styles.chevronIcon}>›</Text>
                  </Pressable>
                </View>

                {/* 2. Subheader: ⚡ Reotimizar Rota & N paradas ⓘ */}
                <View style={styles.statusSubheader}>
                  <Pressable
                    style={[styles.optimizedBadge, optimizing && styles.btnDisabled]}
                    onPress={optimizeRoute}
                    disabled={optimizing}
                  >
                    <Text style={styles.optimizedLightning}>⚡</Text>
                    <Text style={styles.optimizedText}>
                      {optimizing ? 'Otimizando...' : 'Reotimizar Rota'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.stopsCountWrap}
                    onPress={() => {
                      Alert.alert(
                        'Informações da Rota',
                        `${totalStopsCount} paradas no total. ${
                          completedIds.size
                        } concluídas, ${totalStopsCount - completedIds.size} pendentes.`,
                      );
                    }}
                  >
                    <Text style={styles.stopsCountText}>{totalStopsCount} paradas</Text>
                    <Text style={styles.infoIcon}>ⓘ</Text>
                  </Pressable>
                </View>

                {/* 3. Timeline List of Stops */}
                <View style={styles.timelineContainer}>
                  {filteredOrderedDeliveries.map((delivery, index) => {
                    const isCompleted =
                      completedIds.has(delivery.id) || delivery.status === 'completed';
                    const isFailed = delivery.status === 'failed';
                    const isNext = nextStop?.id === delivery.id;
                    const timeStr = stopTimes[index] || '02:00';
                    const isLastItem = index === filteredOrderedDeliveries.length - 1;

                    return (
                      <StopTimelineRow
                        key={delivery.id}
                        delivery={delivery}
                        index={index}
                        isNext={isNext}
                        isCompleted={isCompleted}
                        isFailed={isFailed}
                        timeStr={timeStr}
                        isLastItem={isLastItem}
                        onSelect={selectStop}
                      />
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* 5. Sticky Bottom Action Button */}
        {sheetState !== 'collapsed' && (
          <View style={styles.bottomBar}>
            {filteredOrderedDeliveries.length === 0 ? (
              <Pressable
                style={({ pressed }) => [
                  styles.importSheetBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => navigation.navigate('Import')}
              >
                <Text style={styles.importSheetBtnIcon}>📄</Text>
                <Text style={styles.importSheetBtnText}>Importar planilha</Text>
              </Pressable>
            ) : (
              <View style={styles.bottomActionsRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.reoptimizeBtn,
                    optimizing && styles.btnDisabled,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={optimizeRoute}
                  disabled={optimizing}
                >
                  {optimizing ? (
                    <ActivityIndicator size="small" color="#2563EB" />
                  ) : (
                    <>
                      <Text style={styles.reoptimizeBtnIcon}>⚡</Text>
                      <Text style={styles.reoptimizeBtnText}>Otimizar</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.finishRouteBtn,
                    pressed && styles.btnPressed,
                    { flex: 1 },
                  ]}
                  onPress={() => {
                    Alert.alert(
                      'Finalizar Rota',
                      'Deseja concluir o itinerário da rota atual?',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Finalizar',
                          style: 'destructive',
                          onPress: () => {
                            Alert.alert('Sucesso', 'Rota finalizada com sucesso!');
                          },
                        },
                      ],
                    );
                  }}
                >
                  <Text style={styles.finishRouteBtnIcon}>✓</Text>
                  <Text style={styles.finishRouteBtnText}>Finalizar rota</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </Animated.View>

      {/* Stop Detail Sheet */}
      {activeStop && (
        <View style={styles.stopModalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setActiveStop(null)} />
          <View style={[styles.stopModalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={styles.handle} />
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalStopBadge}>
                  PARADA{' '}
                  {String(
                    orderedDeliveries.findIndex((d) => d.id === activeStop.id) + 1,
                  ).padStart(2, '0')}
                </Text>
                <Text style={styles.modalStopName}>
                  {activeStop.destination || activeStop.name || 'Destino'}
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setActiveStop(null)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.modalAddressText}>
              {activeStop.destination || activeStop.address}
            </Text>

            {(activeStop.bairro || activeStop.city) ? (
              <Text style={styles.modalMetaText}>
                📍 {[activeStop.bairro, activeStop.city].filter(Boolean).join(' · ')}
                {activeStop.zipCode ? ` · CEP: ${activeStop.zipCode}` : ''}
              </Text>
            ) : null}

            {activeStop.latitude !== null && activeStop.longitude !== null ? (
              <Text style={styles.modalMetaText}>
                🌐 Lat: {activeStop.latitude} | Lon: {activeStop.longitude}
              </Text>
            ) : null}

            {activeStop.pedido ? (
              <Text style={styles.modalMetaText}>📦 Pedido: {activeStop.pedido}</Text>
            ) : null}

            {activeStop.telefone || activeStop.phone ? (
              <Text style={styles.modalMetaText}>📞 {activeStop.telefone || activeStop.phone}</Text>
            ) : null}

            {/* Quick action buttons */}
            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.modalActionBtn}
                onPress={() =>
                  activeStop.latitude !== null &&
                  NavigationLauncher.openNavigation(
                    [activeStop.longitude!, activeStop.latitude!],
                    activeStop.address,
                    'waze',
                  )
                }
              >
                <Text style={styles.modalActionBtnText}>🗺️ Waze</Text>
              </Pressable>
              <Pressable
                style={styles.modalActionBtn}
                onPress={() =>
                  activeStop.latitude !== null &&
                  NavigationLauncher.openNavigation(
                    [activeStop.longitude!, activeStop.latitude!],
                    activeStop.address,
                    'google_maps',
                  )
                }
              >
                <Text style={styles.modalActionBtnText}>📍 Google</Text>
              </Pressable>
              {activeStop.phone ? (
                <Pressable
                  style={styles.modalActionBtn}
                  onPress={() =>
                    NavigationLauncher.openWhatsApp(
                      activeStop.phone!,
                      activeStop.name,
                      activeStop.address,
                    )
                  }
                >
                  <Text style={styles.modalActionBtnText}>💬 WhatsApp</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Delivery Status buttons */}
            <View style={styles.modalStatusRow}>
              <Pressable
                style={[styles.modalStatusBtn, { backgroundColor: '#10B981' }]}
                onPress={() => completeStop(activeStop)}
              >
                <Text style={styles.modalStatusBtnText}>✅ Marcar Entregue</Text>
              </Pressable>
              <Pressable
                style={[styles.modalStatusBtn, { backgroundColor: '#EF4444' }]}
                onPress={() => skipStop(activeStop, 'absent')}
              >
                <Text style={styles.modalStatusBtnText}>❌ Não Entregue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Delivery Lists Modal (Lista 1, Lista 2, Lista 3...) */}
      <DeliveryListsModal
        visible={showListsModal}
        onClose={() => setShowListsModal(false)}
        onListChanged={() => reloadDeliveries()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  map: {
    flex: 1,
  },
  userMarkerRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  userMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2563EB',
  },

  /* ── Bottom Sheet ── */
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomWidth: 0,
    ...shadows.xl,
  },
  dragZone: {
    paddingBottom: spacing.xs,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  handle: {
    width: 46,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
  },

  /* ── Search Bar Row ── */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  hamburgerIcon: {
    fontSize: 24,
    color: '#2563EB',
    fontWeight: '700',
  },
  slidersIcon: {
    fontSize: 22,
    color: '#2563EB',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 46,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: spacing.xs + 2,
  },
  searchLensIcon: {
    fontSize: 16,
    color: '#64748B',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
    paddingVertical: 0,
  },
  scannerIcon: {
    fontSize: 20,
    color: '#2563EB',
    paddingHorizontal: 4,
  },
  micIcon: {
    fontSize: 18,
    color: '#2563EB',
    paddingLeft: 4,
  },

  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl + 40,
  },

  /* ── Rotas Header (Screenshot 2) ── */
  rotasHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    marginTop: 2,
  },
  rotasTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  rotasStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    gap: 6,
  },
  rotasStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  rotasStatusText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },

  /* ── Metrics Card (Screenshot 2) ── */
  metricsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  metricIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  metricLbl: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
  },

  /* ── Add Stop Row (Screenshot 2) ── */
  addStopSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs + 2,
    marginTop: 4,
  },
  addDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDotPlus: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563EB',
    marginTop: -2,
  },

  /* ── Import Sheet Button (Screenshot 2) ── */
  importSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: radius.lg,
    paddingVertical: 14,
    gap: spacing.sm,
    ...shadows.md,
  },
  importSheetBtnIcon: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  importSheetBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Origin Section ── */
  originSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs + 2,
    marginTop: 2,
  },
  originDotCol: {
    width: 38,
    alignItems: 'center',
    paddingTop: 4,
  },
  originDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#EFF6FF',
  },
  originLine: {
    width: 2.5,
    height: 24,
    backgroundColor: '#2563EB',
    marginTop: 3,
  },
  originInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.xs,
  },
  originTextWrap: {
    gap: 2,
  },
  originTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  originSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  chevronIcon: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2563EB',
    paddingRight: 6,
  },

  /* ── Status Subheader ── */
  statusSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optimizedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  optimizedLightning: {
    fontSize: 16,
    color: '#2563EB',
  },
  optimizedText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2563EB',
  },
  stopsCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopsCountText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  infoIcon: {
    fontSize: 14,
    color: '#64748B',
  },

  /* ── Timeline Stops List ── */
  timelineContainer: {
    marginTop: spacing.xs,
  },
  stopTimelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing.sm,
  },
  nodeColumn: {
    width: 38,
    alignItems: 'center',
  },
  timelineBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineBadgeNext: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  timelineBadgeCompleted: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  timelineBadgeFailed: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
  },
  timelineBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#2563EB',
  },
  timelineBadgeTextWhite: {
    color: '#FFFFFF',
  },
  timelineVerticalLine: {
    width: 2.5,
    flex: 1,
    backgroundColor: '#2563EB',
    marginVertical: -2,
  },

  /* ── Stop Card ── */
  stopCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing.md - 1,
    marginLeft: spacing.xs,
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
    gap: spacing.xs,
    ...shadows.sm,
  },
  stopCardNext: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFC',
  },
  stopCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  stopCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stopTimeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
    gap: 4,
  },
  statusPillCompleted: {
    backgroundColor: '#10B981',
  },
  statusPillFailed: {
    backgroundColor: '#EF4444',
  },
  statusPillIcon: {
    fontSize: 11,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stopCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  stopAddressText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
  },
  cardChevron: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2563EB',
    paddingLeft: 4,
  },

  /* ── Sticky Bottom Bar ── */
  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs + 2,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  finishRouteBtn: {
    backgroundColor: '#2563EB',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.colored('#2563EB'),
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  finishBtnIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  finishRouteBtnIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginRight: 6,
  },
  finishRouteBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  bottomActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  reoptimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 6,
  },
  reoptimizeBtnIcon: {
    fontSize: 16,
    color: '#2563EB',
  },
  reoptimizeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2563EB',
  },

  /* ── Empty State ── */
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  importQuickBtn: {
    marginTop: spacing.sm,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  importQuickBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },

  /* ── Stop Modal Sheet ── */
  stopModalOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  stopModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs + 2,
    gap: spacing.sm,
    ...shadows.xl,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalStopBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.5,
  },
  modalStopName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  modalAddressText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 20,
  },
  modalMetaText: {
    fontSize: 13,
    color: '#64748B',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalActionBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  modalStatusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalStatusBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStatusBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
