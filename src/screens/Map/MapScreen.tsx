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
import { NavigationLauncher } from '../../services/navigation/NavigationLauncher';
import { MapStyleService } from '../../services/map/MapStyleService';
import { MapType, MapTheme, getMapStyleUrl } from '../../config/mapStyles';
import { CustomMarkerPin } from '../../components/Map/CustomMarkerPin';
import { MapDisplayModal } from '../../components/Map/MapDisplayModal';
import { FloatingMapControls } from '../../components/Map/FloatingMapControls';
import { AddDeliveryModal } from '../../components/AddDeliveryModal';
import { DeliveryListsModal } from '../../components/Deliveries/DeliveryListsModal';
import { SideMenuModal } from '../../components/Map/SideMenuModal';
import { LassoSelectionModal } from '../../components/Map/LassoSelectionModal';
import { ConfigModal } from '../../components/Map/ConfigModal';
import { FuelHUDCard } from '../../components/Map/FuelHUDCard';
import { QuickActionsMenuModal } from '../../components/Map/QuickActionsMenuModal';
import { QuickRgModal } from '../../components/Map/QuickRgModal';
import { StopActionsModal } from '../../components/Map/StopActionsModal';
import Svg, { Polygon, Polyline } from 'react-native-svg';
import type {
  DeliveryEntity,
  GeoJSONFeatureCollection,
  LngLat,
  FailReason,
  Costing,
  RouteStop,
} from '../../types/geo';
import { boundingBox, groupDeliveriesIntoStops } from '../../utils/geo';
import { spacing, radius, shadows, typography } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import {
  Menu,
  Search,
  ScanLine,
  Mic,
  SlidersHorizontal,
  MapPin,
  Route,
  Clock,
  ChevronRight,
  Plus,
  Zap,
  Check,
  X,
  FileSpreadsheet,
  Navigation,
  Phone,
  MessageSquare,
  Package,
  Layers,
  Info,
  RotateCcw,
  Settings as SettingsIcon,
  PenTool,
  Hand,
} from 'lucide-react-native';

/** Point-in-polygon usando ray-casting */
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

// 3 Snap Points for the Bottom Sheet
const SNAP_EXPANDED = SCREEN_HEIGHT * 0.88;
const SNAP_HALF = SCREEN_HEIGHT * 0.54;
const SNAP_COLLAPSED = 105;

const TRANS_EXPANDED = 0;
const TRANS_HALF = SNAP_EXPANDED - SNAP_HALF;
const TRANS_COLLAPSED = SNAP_EXPANDED - SNAP_COLLAPSED;

interface StopTimelineRowProps {
  stop: RouteStop;
  index: number;
  isNext: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  timeStr: string;
  isLastItem: boolean;
  onSelect: (stop: RouteStop) => void;
  onLongPress?: (stop: RouteStop) => void;
}

const StopTimelineRow = React.memo(
  ({
    stop,
    index,
    isNext,
    isCompleted,
    isFailed,
    timeStr,
    isLastItem,
    onSelect,
    onLongPress,
  }: StopTimelineRowProps) => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => createTimelineStyles(colors), [colors]);
    const seqStr = String(stop.stopNumber || index + 1).padStart(2, '0');
    const primaryDelivery = stop.deliveries[0];

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
            {isCompleted ? (
              <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
            ) : isFailed ? (
              <X size={14} color="#FFFFFF" strokeWidth={2.5} />
            ) : (
              <Text
                style={[
                  styles.timelineBadgeText,
                  isNext && styles.timelineBadgeTextNext,
                ]}
              >
                {seqStr}
              </Text>
            )}
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
          onPress={() => onSelect(stop)}
          onLongPress={() => onLongPress?.(stop)}
        >
          {/* Top row: Time + Status Badge + Count Tag */}
          <View style={styles.stopCardHeader}>
            <View style={styles.timeTagRow}>
              <Clock size={12} color={colors.textMuted} />
              <Text style={styles.stopTimeText}>{timeStr}</Text>
            </View>

            <View style={styles.headerBadgesRow}>
              {stop.totalCount > 1 && (
                <View style={styles.multiPackageBadge}>
                  <Package size={11} color={colors.primary} />
                  <Text style={styles.multiPackageText}>
                    {stop.totalCount} entregas
                  </Text>
                </View>
              )}

              <View
                style={[
                  styles.statusPill,
                  isNext && styles.statusPillNext,
                  isCompleted && styles.statusPillCompleted,
                  isFailed && styles.statusPillFailed,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    isNext && styles.statusPillTextNext,
                    isCompleted && styles.statusPillTextCompleted,
                    isFailed && styles.statusPillTextFailed,
                  ]}
                >
                  {isCompleted
                    ? 'Concluída'
                    : isFailed
                    ? 'Insucesso'
                    : isNext
                    ? 'Próxima Parada'
                    : 'Pendente'}
                </Text>
              </View>
            </View>
          </View>

          {/* Main Address line + Chevron */}
          <View style={styles.stopCardBody}>
            <View style={styles.addressWrap}>
              <Text
                style={styles.stopAddressText}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {stop.address || primaryDelivery?.destination || primaryDelivery?.name}
              </Text>
              {stop.bairro ? (
                <Text style={styles.stopBairroText}>
                  {stop.bairro}{stop.city ? ` · ${stop.city}` : ''}
                </Text>
              ) : null}
            </View>
            <ChevronRight size={18} color={colors.textDisabled} />
          </View>
        </Pressable>
      </View>
    );
  },
  (prev, next) =>
    prev.stop.key === next.stop.key &&
    prev.stop.status === next.stop.status &&
    prev.stop.totalCount === next.stop.totalCount &&
    prev.isNext === next.isNext &&
    prev.isCompleted === next.isCompleted &&
    prev.isFailed === next.isFailed &&
    prev.timeStr === next.timeStr &&
    prev.index === next.index &&
    prev.isLastItem === next.isLastItem,
);

export default function MapScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createScreenStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);

  // Animated Bottom Sheet Translation
  const sheetTranslateY = useRef(new Animated.Value(TRANS_HALF)).current;
  const currentTranslateRef = useRef(TRANS_HALF);
  const [sheetState, setSheetState] = useState<'expanded' | 'half' | 'collapsed'>('half');

  // GPS state
  const [currentLocation, setCurrentLocation] = useState<LngLat | null>(null);
  const [hasGpsFix, setHasGpsFix] = useState(false);
  const [_speed, setSpeed] = useState<number | null>(null);
  const [_accuracy, setAccuracy] = useState<number | null>(null);
  const [_gpsError, setGpsError] = useState<string | null>(null);
  const [followGPS, setFollowGPS] = useState(false);
  const [_zoom, setZoom] = useState(13);
  const currentHeadingRef = useRef<number | null>(null); // Task 1: heading da bússola

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
  // Task 5: controla se a rota precisa ser (re)otimizada manualmente
  const [routeNeedsOptimization, setRouteNeedsOptimization] = useState(false);

  // Stops / navigation
  const [activeStop, setActiveStop] = useState<RouteStop | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-Lasso Tool (Screenshot 2)
  const mapRef = useRef<MapRef | null>(null);
  const [lassoMode, setLassoMode] = useState(false);
  const [lassoSubMode, setLassoSubMode] = useState<'draw' | 'pan'>('draw');
  const [geoLassoLoops, setGeoLassoLoops] = useState<Array<Array<LngLat>>>([]);
  const [lassoLoops, setLassoLoops] = useState<Array<Array<[number, number]>>>([]);
  const [currentLassoStroke, setCurrentLassoStroke] = useState<Array<[number, number]>>([]);
  const [lassoSelectedStopKeys, setLassoSelectedStopKeys] = useState<Set<string>>(new Set());
  const activeStrokeRef = useRef<Array<[number, number]>>([]);
  const lastPointRef = useRef<[number, number] | null>(null);
  const mapContainerRef = useRef<View | null>(null);
  const mapLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Quick Action Menu & RG Modals (Screenshot 1, 3, 4)
  const [showQuickActionsModal, setShowQuickActionsModal] = useState(false);
  const [showQuickRgModal, setShowQuickRgModal] = useState(false);
  const [showStopActionsModal, setShowStopActionsModal] = useState(false);
  const [selectedStopForActions, setSelectedStopForActions] = useState<RouteStop | null>(null);

  // Task 3: Config Modal + Fuel HUD
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showFuelHUD, setShowFuelHUD] = useState(false);
  const [fuelConfig, setFuelConfig] = useState({ kmPerLiter: 0, pricePerLiter: 0 });

  // Task 4: Diagnóstico status badge
  const [diagStatus, setDiagStatus] = useState<'ok' | 'error' | 'unknown'>('unknown');


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

  // Agrupamento de entregas por endereço único
  const routeStops: RouteStop[] = useMemo(() => {
    return groupDeliveriesIntoStops(orderedDeliveries);
  }, [orderedDeliveries]);

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

  const filteredStops: RouteStop[] = useMemo(() => {
    return groupDeliveriesIntoStops(filteredOrderedDeliveries);
  }, [filteredOrderedDeliveries]);

  // Próxima parada ativa (primeira não concluída)
  const nextStop: RouteStop | null = useMemo(() => {
    return routeStops.find((s) => s.status !== 'completed') ?? null;
  }, [routeStops]);

  /* ─── Bottom Sheet Animation Helper ─── */
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

  /* ─── PanResponder for Dragging Bottom Sheet ─── */
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
        setDiagStatus('error'); // Task 4
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
          currentHeadingRef.current = pos.heading; // Task 1
        }
        setGpsError(null);
        setDiagStatus('ok'); // Task 4
        cameraRef.current?.setStop({
          center: coords,
          zoom: 14,
          duration: 800,
        });
      } catch {
        if (mounted) {
          setGpsError('GPS buscando sinal...');
          setDiagStatus('error'); // Task 4
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
          // Task 1: atualiza heading
          if (update.heading !== null && update.heading >= 0) {
            currentHeadingRef.current = update.heading;
          }
          setGpsError(null);
          setDiagStatus('ok'); // Task 4
          if (followGPS) {
            cameraRef.current?.setStop({
              center: coords,
              zoom: 15,
              duration: 800,
            });
          }
        },
        (error) => {
          if (mounted) {
            setGpsError(`GPS: ${error.message}`);
            setDiagStatus('error'); // Task 4
          }
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
    // Task 5: marcar que precisa otimizar manualmente se há entregas
    if (loaded.filter((d) => d.latitude !== null && d.longitude !== null).length > 0) {
      setRouteNeedsOptimization(true);
    }
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

  /* ─── Optimize Route ─── */
  const optimizeRoute = useCallback(async (originOverride?: LngLat) => {
    if (locatedDeliveries.length === 0) {
      Alert.alert('Sem Entregas', 'Importe uma planilha antes de otimizar a rota.');
      return;
    }
    setOptimizing(true);
    try {
      // 1. Garante GPS real antes de qualquer coisa — até 2 tentativas com 6s cada
      let userCoords: LngLat | null = originOverride || null;

      if (!userCoords) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const freshPos = await LocationService.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 6000,
              maximumAge: 0, // sempre posição fresca, nunca cache
            });
            userCoords = [freshPos.longitude, freshPos.latitude];
            setCurrentLocation(userCoords);
            setHasGpsFix(true);
            console.log(`[Map] GPS confirmado (tentativa ${attempt}):`, userCoords);
            break;
          } catch (gpsErr) {
            console.warn(`[Map] GPS tentativa ${attempt} falhou:`, gpsErr);
            if (attempt === 2 && currentLocation) {
              // Última opção: usa última posição conhecida do estado
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

      console.log('[Map] Ponto de partida da rota (GPS):', userCoords);

      // 2. Agrupa paradas únicas para otimização
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

      // 3. Reordena entregas baseado na ordem otimizada das paradas
      optimization.order.forEach((stopIndex, seqNum) => {
        const targetStop = pendingStops[stopIndex];
        targetStop.deliveries.forEach((del) => {
          DatabaseService.updateDeliverySequence(del.id, seqNum + 1);
        });
      });

      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);

      // 4. Traçado no mapa via Mapbox Directions v5 — waypoint[0] é SEMPRE o GPS atual
      const waypoints: LngLat[] = [
        userCoords, // <-- ponto de partida = posição GPS real
        ...optimization.order.map((i) => stopCoordinates[i]),
      ];
      console.log('[Map] Waypoints enviados ao Mapbox:', waypoints.length, '| início:', waypoints[0]);

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
  }, [currentLocation, locatedDeliveries, costingMode, fitRoute]);

  /* ─── Task 5: Auto-otimização REMOVIDA — o usuário aciona manualmente ─── */
  // O useEffect de auto-otimização foi intencionalmente removido.
  // A rota deve ser otimizada apenas quando o usuário pressionar 'Otimizar Rota'.

  /* ─── Task 2: Multi-Lasso Tool com Fixação Geográfica no Mapa ─── */
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

  const handleConfirmLasso = useCallback(async () => {
    if (geoLassoLoops.length === 0 && lassoLoops.length === 0) {
      handleCancelLasso();
      return;
    }

    setOptimizing(true);

    try {
      // 1. Obtém posição GPS real de partida
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

      // 2. Agrupa as paradas pendentes em clusters na sequência das áreas desenhadas (1, 2, 3...)
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
        if (stopsInThisLoop.length > 0) {
          clusters.push(stopsInThisLoop);
        }
      });

      // Paradas restantes não incluídas em nenhum laço (ficam para o final)
      const unassignedStops: RouteStop[] = [];
      routeStops.forEach((stop) => {
        if (stop.status === 'completed') return;
        if (!addedKeys.has(stop.key)) {
          unassignedStops.push(stop);
        }
      });
      if (unassignedStops.length > 0) {
        clusters.push(unassignedStops);
      }

      // 3. Otimiza cada área/cluster encadeadamente
      // Área 1 parte do GPS do motorista.
      // As próximas áreas partem da última parada da área anterior.
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
            clusterOpt.order.forEach((idx) => {
              finalOrderedStops.push(cluster[idx]);
            });
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

      // 4. Grava a nova sequência de prioridade no banco local SQLite
      let seqIndex = 1;
      finalOrderedStops.forEach((st) => {
        st.deliveries.forEach((del) => {
          DatabaseService.updateDeliverySequence(del.id, seqIndex++);
        });
      });

      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);

      // 5. Traçado da rota pelo Mapbox Directions v5 partindo do GPS e seguindo a ordem dos laços
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

      // 6. Limpa o modo laço e ajusta o enquadramento no mapa
      setLassoMode(false);
      setLassoSubMode('draw');
      setGeoLassoLoops([]);
      setLassoLoops([]);
      activeStrokeRef.current = [];
      lastPointRef.current = null;
      setCurrentLassoStroke([]);
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

  const handleCancelLasso = useCallback(() => {
    setLassoMode(false);
    setLassoSubMode('draw');
    setGeoLassoLoops([]);
    setLassoLoops([]);
    activeStrokeRef.current = [];
    lastPointRef.current = null;
    setCurrentLassoStroke([]);
    setLassoSelectedStopKeys(new Set());
  }, []);

  const handleToggleLasso = useCallback(() => {
    if (lassoMode) {
      handleCancelLasso();
    } else {
      setLassoMode(true);
      setLassoSubMode('draw');
      setGeoLassoLoops([]);
      setLassoLoops([]);
      activeStrokeRef.current = [];
      lastPointRef.current = null;
      setCurrentLassoStroke([]);
      setLassoSelectedStopKeys(new Set());
    }
  }, [lassoMode, handleCancelLasso]);

  const recalculateRoute = useCallback(async () => {
    const remainingStops = routeStops.filter((s) => s.status !== 'completed');
    if (remainingStops.length === 0) {
      setRoute(null);
      setRouteInfo(null);
      return;
    }

    try {
      // Garante GPS real antes de redesenhar a rota
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
        console.log('[Map] recalculateRoute GPS:', userCoords);
      } catch {
        // Usa última posição conhecida como fallback
        userCoords = currentLocation;
        console.warn('[Map] recalculateRoute usando último GPS conhecido:', userCoords);
      }

      if (!userCoords) return;

      const waypoints: LngLat[] = [
        userCoords, // <-- ponto de partida = posição GPS real
        ...remainingStops.map((s) => [s.longitude, s.latitude] as LngLat),
      ];
      console.log('[Map] recalculateRoute waypoints:', waypoints.length, '| início:', waypoints[0]);

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


  /* ─── Stop Actions ─── */
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

  /* ─── Delivery Markers (Grouped Per Address / RouteStop) ─── */
  const deliveryMarkers = useMemo(() => {
    return routeStops
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
            <Pressable
              onPress={() => selectStop(stop)}
              onLongPress={() => {
                setSelectedStopForActions(stop);
                setShowStopActionsModal(true);
              }}
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
            </Pressable>
          </Marker>
        );
      });
  }, [routeStops, nextStop, activeStop, hideCompleted, lassoSelectedStopKeys, selectStop]);

  const currentStyleUrl = getMapStyleUrl(mapType, mapTheme);
  const totalStopsCount = routeStops.length;
  const totalPackagesCount = deliveries.length;

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

  /* ─── Task 2: Multi-Lasso PanResponder (1 dedo = desenha, 2 dedos = move/zoom no mapa) ─── */
  const lassoPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (e) => {
          if (!lassoMode) return false;
          // 1 dedo: captura para desenhar o laço
          // 2 dedos: não captura para permitir movimentar/fazer zoom no mapa
          return e.nativeEvent.touches && e.nativeEvent.touches.length === 1;
        },
        onMoveShouldSetPanResponder: (e) => {
          if (!lassoMode) return false;
          return e.nativeEvent.touches && e.nativeEvent.touches.length === 1;
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderTerminate: () => {
          activeStrokeRef.current = [];
          lastPointRef.current = null;
          setCurrentLassoStroke([]);
        },
        onPanResponderGrant: (e) => {
          if (e.nativeEvent.touches && e.nativeEvent.touches.length > 1) return;
          const { locationX, locationY } = e.nativeEvent;
          activeStrokeRef.current = [[locationX, locationY]];
          lastPointRef.current = [locationX, locationY];
          setCurrentLassoStroke([[locationX, locationY]]);
        },
        onPanResponderMove: (e) => {
          if (e.nativeEvent.touches && e.nativeEvent.touches.length > 1) {
            // Se colocar um 2º dedo durante o traço, descarta o traço para mover o mapa
            activeStrokeRef.current = [];
            lastPointRef.current = null;
            setCurrentLassoStroke([]);
            return;
          }
          const { locationX, locationY } = e.nativeEvent;
          const last = lastPointRef.current;
          if (last) {
            const dist = Math.hypot(locationX - last[0], locationY - last[1]);
            if (dist < 4) return; // Evita sobrecarga de re-renderização
          }
          lastPointRef.current = [locationX, locationY];
          activeStrokeRef.current.push([locationX, locationY]);
          setCurrentLassoStroke([...activeStrokeRef.current]);
        },
        onPanResponderRelease: async () => {
          const stroke = activeStrokeRef.current;
          if (stroke.length < 4) {
            activeStrokeRef.current = [];
            lastPointRef.current = null;
            setCurrentLassoStroke([]);
            return;
          }

          // Converte os pontos da tela para coordenadas geográficas fixadas no mapa
          const sampledStroke = stroke.filter((_, idx) => idx % 2 === 0 || idx === stroke.length - 1);
          const geoPoints: LngLat[] = [];

          if (mapRef.current) {
            for (const pt of sampledStroke) {
              try {
                const lngLat = await mapRef.current.unproject(pt);
                if (lngLat && Array.isArray(lngLat) && lngLat.length >= 2) {
                  geoPoints.push(lngLat as LngLat);
                }
              } catch (e) {
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

          activeStrokeRef.current = [];
          lastPointRef.current = null;
          setCurrentLassoStroke([]);
        },
      }),
    [lassoMode, computeEnclosedStopsFromGeo],
  );

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
      geometry: {
        type: 'Polygon' as const,
        coordinates: [loop],
      },
    }));
    return JSON.stringify({
      type: 'FeatureCollection',
      features,
    });
  }, [geoLassoLoops]);

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

        {/* Route Polyline (Linha Azul Perfeita) */}
        {routeGeoJsonString && (
          <GeoJSONSource
            id="route-source"
            data={routeGeoJsonString}
          >
            <Layer
              id="route-casing"
              type="line"
              source="route-source"
              paint={{
                'line-color': '#FFFFFF',
                'line-width': 8,
                'line-opacity': 0.95,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-line"
              type="line"
              source="route-source"
              paint={{
                'line-color': '#2563EB',
                'line-width': 5.5,
                'line-opacity': 1.0,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}

        {/* Renderização Geográfica Fixa dos Laços no Mapa (Move e dá Zoom com o Mapa) */}
        {geoLassoGeoJsonString && (
          <GeoJSONSource
            id="lasso-geo-source"
            data={geoLassoGeoJsonString}
          >
            <Layer
              id="lasso-polygon-fill"
              type="fill"
              source="lasso-geo-source"
              paint={{
                'fill-color': 'rgba(99, 102, 241, 0.22)',
              }}
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

        {/* Badges Numéricos '1', '2', '3' Ancorados Geograficamente no Mapa */}
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
                <Text style={styles.loopBadgeText}>{loopIdx + 1}</Text>
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

      {/* Multi-Lasso Overlay — Freehand SVG Drawing (Screenshot 2) */}
      {lassoMode && (
        <View
          style={[StyleSheet.absoluteFill, styles.lassoOverlay]}
          pointerEvents="box-none"
        >
          {/* Active 1-Finger Drawing Canvas Layer */}
          <View
            {...lassoPanResponder.panHandlers}
            style={StyleSheet.absoluteFill}
            pointerEvents={lassoSubMode === 'draw' ? 'auto' : 'none'}
          >
            {/* SVG Canvas for active drawing stroke */}
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              {currentLassoStroke.length > 1 && (
                <Polyline
                  points={currentLassoStroke.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                  stroke="#818CF8"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </Svg>
          </View>

          {/* Top HUD Bar (Screenshot 2) */}
          <View style={[styles.lassoTopHud, { top: insets.top + 8 }]} pointerEvents="none">
            <View style={styles.lassoHudCol}>
              <Text style={styles.lassoHudLabel}>RESTANTE</Text>
              <View style={styles.lassoHudRow}>
                <Clock size={13} color="#818CF8" />
                <Text style={styles.lassoHudVal}>
                  {routeInfo ? formatDuration(routeInfo.duration) : '3h 58m'}
                </Text>
              </View>
            </View>
            <View style={styles.lassoHudDivider} />
            <View style={styles.lassoHudCol}>
              <Text style={styles.lassoHudLabel}>ENTREGAS</Text>
              <View style={styles.lassoHudRow}>
                <Package size={13} color="#10B981" />
                <Text style={styles.lassoHudVal}>
                  {completedIds.size}/{totalPackagesCount}
                </Text>
              </View>
            </View>
            <View style={styles.lassoHudDivider} />
            <View style={styles.lassoHudCol}>
              <Text style={styles.lassoHudLabel}>DIST.</Text>
              <View style={styles.lassoHudRow}>
                <Route size={13} color="#38BDF8" />
                <Text style={styles.lassoHudVal}>
                  {routeInfo ? formatDistance(routeInfo.distance) : '40.5 km'}
                </Text>
              </View>
            </View>
          </View>

          {/* Bottom Floating Bar in Lasso Mode (Screenshot 2) */}
          <View
            style={[styles.lassoBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}
            pointerEvents="box-none"
          >
            {/* Close Button */}
            <Pressable
              style={({ pressed }) => [styles.lassoRoundDarkBtn, pressed && styles.btnPressed]}
              onPress={handleCancelLasso}
              hitSlop={12}
            >
              <X size={22} color="#FFFFFF" />
            </Pressable>

            {/* Undo Button */}
            <Pressable
              style={({ pressed }) => [styles.lassoRoundWhiteBtn, pressed && styles.btnPressed]}
              onPress={handleUndoLasso}
              hitSlop={12}
            >
              <RotateCcw size={20} color="#0F172A" />
            </Pressable>

            {/* Mode Switch Button: Desenhar vs Mover Mapa */}
            <Pressable
              style={({ pressed }) => [
                styles.lassoToggleModeBtn,
                lassoSubMode === 'draw' ? styles.lassoToggleModeBtnDraw : styles.lassoToggleModeBtnPan,
                pressed && styles.btnPressed,
              ]}
              onPress={() => setLassoSubMode(lassoSubMode === 'draw' ? 'pan' : 'draw')}
              hitSlop={8}
            >
              {lassoSubMode === 'draw' ? (
                <>
                  <PenTool size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.lassoToggleModeText}>DESENHAR</Text>
                </>
              ) : (
                <>
                  <Hand size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.lassoToggleModeText}>MOVER MAPA</Text>
                </>
              )}
            </Pressable>

            {/* Confirm & Optimize Button */}
            <Pressable
              style={({ pressed }) => [styles.lassoConfirmBtn, pressed && styles.btnPressed]}
              onPress={handleConfirmLasso}
              hitSlop={8}
            >
              <Text style={styles.lassoConfirmBtnText}>CONFIRMAR E OTIMIZAR</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Persistent Floating Action Bar on Map: Otimizar Rota & Finalizar Rota (Sempre acima do modal arrastável) */}
      {!lassoMode && (
        <Animated.View
          style={[
            styles.persistentFloatingBar,
            {
              bottom: SNAP_EXPANDED + 12,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            style={({ pressed }) => [
              styles.floatingOptBtn,
              routeNeedsOptimization && styles.floatingOptBtnActive,
              pressed && styles.btnPressed,
            ]}
            onPress={() => optimizeRoute()}
            disabled={optimizing}
          >
            {optimizing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Zap size={16} color="#FFFFFF" />
                <Text style={styles.floatingOptBtnText}>
                  {routeNeedsOptimization ? 'Otimizar Rota' : 'Reotimizar'}
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.floatingFinishBtn, pressed && styles.btnPressed]}
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
            <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.floatingFinishBtnText}>Finalizar</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Task 3: Fuel HUD Card */}
      <FuelHUDCard
        visible={showFuelHUD}
        kmPerLiter={fuelConfig.kmPerLiter}
        pricePerLiter={fuelConfig.pricePerLiter}
        distanceRemainingM={routeInfo?.distance ?? 0}
        durationRemainingS={routeInfo?.duration ?? 0}
        onClose={() => setShowFuelHUD(false)}
      />

      {/* Floating Action Controls on Right (Esconde suavemente ao arrastar o modal para cima) */}
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

      {/* Side Menu Modal */}
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

      {/* Task 3: Config Modal (Configurações Rápidas do mapa) */}
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

      {/* Quick Actions Popup Menu */}
      <QuickActionsMenuModal
        visible={showQuickActionsModal}
        onClose={() => setShowQuickActionsModal(false)}
        onReoptimize={() => optimizeRoute(currentLocation || undefined)}
        onShareRoute={() => {
          Alert.alert('Compartilhar Rota', 'Link de rota gerado com sucesso!');
        }}
      />

      {/* Quick RG Generator Modal (Screenshot 3) */}
      <QuickRgModal
        visible={showQuickRgModal}
        onClose={() => setShowQuickRgModal(false)}
      />

      {/* Stop Actions Modal (Screenshot 4) */}
      <StopActionsModal
        visible={showStopActionsModal}
        stop={selectedStopForActions}
        onClose={() => {
          setShowStopActionsModal(false);
          setSelectedStopForActions(null);
        }}
        onMarkPackages={() => {
          Alert.alert('Marcar Pacotes', 'Pacotes marcados como conferidos.');
        }}
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


      {/* ── DRAGGABLE BOTTOM SHEET ── */}
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
        {/* Drag Handle Area */}
        <View {...panResponder.panHandlers} style={styles.dragZone}>
          <Pressable onPress={handleToggleSnap} hitSlop={10} style={styles.handleContainer}>
            <View style={styles.handle} />
          </Pressable>

          {/* 1. Search Bar Header */}
          <View style={styles.searchRow}>
            {/* Hamburger Button */}
            <Pressable
              style={styles.iconBtn}
              onPress={() => setShowMenuModal(true)}
              hitSlop={8}
            >
              <Menu size={22} color={colors.primary} />
            </Pressable>

            {/* Search Input Box */}
            <View style={styles.searchInputContainer}>
              <Search size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar endereço ou parada…"
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pressable
                  onPress={() => {
                    Alert.alert('Scanner', 'Scanner de código de barras');
                  }}
                  hitSlop={6}
                >
                  <ScanLine size={18} color={colors.primary} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Alert.alert('Voz', 'Comando de voz ativado');
                  }}
                  hitSlop={6}
                >
                  <Mic size={18} color={colors.primary} />
                </Pressable>
              </View>
            </View>


            {/* Options / Quick Actions Button (Screenshot 1 & 5) */}
            <Pressable
              style={styles.iconBtn}
              onPress={() => setShowQuickActionsModal(true)}
              hitSlop={8}
            >
              <SlidersHorizontal size={20} color={colors.primary} />
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
            {/* 1. Header: Rotas & Status (Sempre presente na tela) */}
            <View style={styles.rotasHeaderRow}>
              <Text style={styles.rotasTitle}>Rotas</Text>
              <View
                style={[
                  styles.rotasStatusBadge,
                  filteredStops.length === 0
                    ? { backgroundColor: colors.warningGhost }
                    : optimizing
                    ? { backgroundColor: colors.primaryGhost }
                    : { backgroundColor: colors.successGhost },
                ]}
              >
                <View
                  style={[
                    styles.rotasStatusDot,
                    filteredStops.length === 0
                      ? { backgroundColor: colors.warning }
                      : optimizing
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.success },
                  ]}
                />
                <Text
                  style={[
                    styles.rotasStatusText,
                    filteredStops.length === 0
                      ? { color: colors.warning }
                      : optimizing
                      ? { color: colors.primary }
                      : { color: colors.success },
                  ]}
                >
                  {filteredStops.length === 0
                    ? 'Aguardando paradas'
                    : optimizing
                    ? 'Otimizando rota...'
                    : `${totalStopsCount} ${totalStopsCount === 1 ? 'parada ativa' : 'paradas ativas'}`}
                </Text>
              </View>
            </View>

            {/* 2. Metrics Card (Paradas, Distância e Duração - Sempre visível mostrando as métricas da importação) */}
            <View style={styles.metricsCard}>
              <View style={styles.metricCol}>
                <MapPin size={18} color={colors.primary} />
                <Text style={styles.metricVal}>{totalStopsCount}</Text>
                <Text style={styles.metricLbl}>Paradas</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricCol}>
                <Route size={18} color={colors.primary} />
                <Text style={styles.metricVal}>
                  {routeInfo ? formatDistance(routeInfo.distance) : totalStopsCount > 0 ? 'Calculando...' : '0 km'}
                </Text>
                <Text style={styles.metricLbl}>Distância</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricCol}>
                <Clock size={18} color={colors.primary} />
                <Text style={styles.metricVal}>
                  {routeInfo ? formatDuration(routeInfo.duration) : '--:--'}
                </Text>
                <Text style={styles.metricLbl}>Duração</Text>
              </View>
            </View>

            {filteredStops.length === 0 ? (
              /* ── EMPTY STATE / AGUARDANDO PARADAS ── */
              <View>
                {/* 3. Route Origin Row */}
                <View style={styles.originSection}>
                  <View style={styles.originDotCol}>
                    <View style={styles.originDot} />
                    <View style={styles.originLine} />
                  </View>

                  <Pressable
                    style={styles.originInfo}
                    onPress={() => {
                      if (currentLocation) {
                        cameraRef.current?.setStop({ center: currentLocation, zoom: 16, duration: 600 });
                        optimizeRoute(currentLocation);
                      } else {
                        Alert.alert('GPS', 'Aguardando sinal de GPS...');
                      }
                    }}
                  >
                    <View style={styles.originTextWrap}>
                      <Text style={styles.originTitle}>Origem da rota</Text>
                      <Text style={styles.originSubtitle}>
                        {currentLocation ? 'Início na sua posição GPS' : 'Buscando GPS...'}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textDisabled} />
                  </Pressable>
                </View>

                {/* 4. Add Stop Row */}
                <View style={styles.addStopSection}>
                  <View style={styles.originDotCol}>
                    <View style={styles.addDot}>
                      <Plus size={14} color="#FFFFFF" />
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
                    <ChevronRight size={18} color={colors.textDisabled} />
                  </Pressable>
                </View>
              </View>
            ) : (
              /* ── ACTIVE / PARADAS IMPORTADAS LISTADAS NORMALMENTE ABAIXO ── */
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
                      if (currentLocation) {
                        cameraRef.current?.setStop({ center: currentLocation, zoom: 16, duration: 600 });
                        optimizeRoute(currentLocation);
                      } else {
                        Alert.alert('GPS', 'Aguardando sinal de GPS...');
                      }
                    }}
                  >
                    <View style={styles.originTextWrap}>
                      <Text style={styles.originTitle}>Origem da rota</Text>
                      <Text style={styles.originSubtitle}>
                        {currentLocation ? 'Início na sua localização GPS (Toque para reotimizar)' : 'Buscando GPS...'}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textDisabled} />
                  </Pressable>
                </View>

                {/* 2. Subheader: Reotimizar & N paradas */}
                <View style={styles.statusSubheader}>
                  <Pressable
                    style={[styles.optimizedBadge, optimizing && styles.btnDisabled]}
                    onPress={() => optimizeRoute(currentLocation || undefined)}
                    disabled={optimizing}
                  >
                    <Zap size={14} color={colors.primary} />
                    <Text style={styles.optimizedText}>
                      {optimizing ? 'Otimizando...' : 'Reotimizar Rota'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.stopsCountWrap}
                    onPress={() => {
                      Alert.alert(
                        'Resumo da Rota',
                        `${totalStopsCount} paradas únicas agrupadas no mapa (${totalPackagesCount} pacotes/pedidos totais).`,
                      );
                    }}
                  >
                    <Text style={styles.stopsCountText}>
                      {totalStopsCount} paradas · {totalPackagesCount} pacotes
                    </Text>
                    <Info size={14} color={colors.primary} />
                  </Pressable>
                </View>

                {/* 3. Timeline List of Grouped Stops */}
                <View style={styles.timelineContainer}>
                  {filteredStops.map((stop, index) => {
                    const isCompleted = stop.status === 'completed';
                    const isFailed = stop.status === 'failed';
                    const isNext = nextStop?.key === stop.key;
                    const timeStr = stopTimes[index] || '02:00';
                    const isLastItem = index === filteredStops.length - 1;

                    return (
                      <StopTimelineRow
                        key={stop.key}
                        stop={stop}
                        index={index}
                        isNext={isNext}
                        isCompleted={isCompleted}
                        isFailed={isFailed}
                        timeStr={timeStr}
                        isLastItem={isLastItem}
                        onSelect={selectStop}
                        onLongPress={(st) => {
                          setSelectedStopForActions(st);
                          setShowStopActionsModal(true);
                        }}
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
            {filteredStops.length === 0 ? (
              <Pressable
                style={({ pressed }) => [
                  styles.importSheetBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => navigation.navigate('Import')}
              >
                <FileSpreadsheet size={18} color="#FFFFFF" />
                <Text style={styles.importSheetBtnText}>Importar planilha</Text>
              </Pressable>
            ) : (
              <View style={styles.bottomActionsRow}>
                {/* Task 5: Botão Otimizar — desabilitado (cinza) quando rota está atualizada */}
                <Pressable
                  style={({ pressed }) => [
                    styles.reoptimizeBtn,
                    routeNeedsOptimization && styles.reoptimizeBtnActive,
                    (optimizing || !routeNeedsOptimization) && styles.btnDisabled,
                    pressed && routeNeedsOptimization && styles.btnPressed,
                  ]}
                  onPress={() => {
                    if (routeNeedsOptimization) optimizeRoute();
                  }}
                  disabled={optimizing || !routeNeedsOptimization}
                >
                  {optimizing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Zap size={16} color={routeNeedsOptimization ? '#FFFFFF' : colors.textMuted} />
                      <Text style={[styles.reoptimizeBtnText, routeNeedsOptimization && styles.reoptimizeBtnTextActive]}>
                        {routeNeedsOptimization ? 'Otimizar Rota' : 'Otimizado'}
                      </Text>
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
                  <Check size={18} color="#FFFFFF" />
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
                  PARADA {String(activeStop.stopNumber).padStart(2, '0')}
                  {activeStop.totalCount > 1 ? ` · ${activeStop.totalCount} ENTREGAS NESTE ENDEREÇO` : ''}
                </Text>
                <Text style={styles.modalStopName}>
                  {activeStop.address}
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setActiveStop(null)}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {activeStop.bairro || activeStop.city ? (
              <Text style={styles.modalMetaText}>
                {[activeStop.bairro, activeStop.city].filter(Boolean).join(' · ')}
              </Text>
            ) : null}

            {/* Deliveries inside this stop */}
            <ScrollView style={styles.modalDeliveriesList} showsVerticalScrollIndicator={false}>
              {activeStop.deliveries.map((del, idx) => (
                <View key={del.id} style={styles.modalDeliveryItem}>
                  <View style={styles.modalDeliveryHeader}>
                    <Text style={styles.modalDeliveryTitle}>
                      {activeStop.totalCount > 1 ? `Entrega #${idx + 1}: ` : ''}
                      {del.destination || del.name}
                    </Text>
                    {del.pedido ? (
                      <View style={styles.orderPill}>
                        <Text style={styles.orderPillText}>Pedido: {del.pedido}</Text>
                      </View>
                    ) : null}
                  </View>
                  {del.telefone ? (
                    <Text style={styles.modalDeliverySub}>📞 {del.telefone}</Text>
                  ) : null}
                  {del.notes ? (
                    <Text style={styles.modalDeliveryNotes}>📝 {del.notes}</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>

            {/* Quick action buttons */}
            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.modalActionBtn}
                onPress={() =>
                  NavigationLauncher.openNavigation(
                    [activeStop.longitude, activeStop.latitude],
                    activeStop.address,
                    'waze',
                  )
                }
              >
                <Navigation size={15} color={colors.primary} />
                <Text style={styles.modalActionBtnText}>Waze</Text>
              </Pressable>
              <Pressable
                style={styles.modalActionBtn}
                onPress={() =>
                  NavigationLauncher.openNavigation(
                    [activeStop.longitude, activeStop.latitude],
                    activeStop.address,
                    'google_maps',
                  )
                }
              >
                <MapPin size={15} color={colors.primary} />
                <Text style={styles.modalActionBtnText}>Google Maps</Text>
              </Pressable>
              {activeStop.deliveries[0]?.phone || activeStop.deliveries[0]?.telefone ? (
                <Pressable
                  style={styles.modalActionBtn}
                  onPress={() => {
                    const firstD = activeStop.deliveries[0];
                    NavigationLauncher.openWhatsApp(
                      (firstD.phone || firstD.telefone)!,
                      firstD.name,
                      firstD.address,
                    );
                  }}
                >
                  <MessageSquare size={15} color={colors.success} />
                  <Text style={[styles.modalActionBtnText, { color: colors.success }]}>WhatsApp</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Delivery Status buttons */}
            <View style={styles.modalStatusRow}>
              <Pressable
                style={[styles.modalStatusBtn, { backgroundColor: colors.success }]}
                onPress={() => completeStop(activeStop)}
              >
                <Check size={16} color="#FFFFFF" />
                <Text style={styles.modalStatusBtnText}>
                  {activeStop.totalCount > 1 ? `Concluir (${activeStop.totalCount} Entregas)` : 'Marcar Entregue'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalStatusBtn, { backgroundColor: colors.danger }]}
                onPress={() => skipStop(activeStop, 'absent')}
              >
                <X size={16} color="#FFFFFF" />
                <Text style={styles.modalStatusBtnText}>Não Entregue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Delivery Lists Modal */}
      <DeliveryListsModal
        visible={showListsModal}
        onClose={() => setShowListsModal(false)}
        onListChanged={() => reloadDeliveries()}
      />

      {/* Loading Modal Overlay com Texto Explicativo */}
      {optimizing && (
        <View style={styles.loadingModalOverlay} pointerEvents="auto">
          <View style={styles.loadingModalCard}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingModalTitle}>Otimizando rotas</Text>
            <Text style={styles.loadingModalSub}>Calculando a melhor sequência e tempo estimado com Mapbox...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const createTimelineStyles = (colors: any) =>
  StyleSheet.create({
    stopTimelineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: spacing.xs,
    },
    nodeColumn: {
      alignItems: 'center',
      width: 44,
      marginRight: spacing.xs,
    },
    timelineBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
      ...shadows.sm,
    },
    // Parada atual/próxima: Azul Escuro
    timelineBadgeNext: {
      backgroundColor: '#1D4ED8',
      borderColor: '#1D4ED8',
    },
    timelineBadgeCompleted: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    timelineBadgeFailed: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
    },
    timelineBadgeText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textSecondary,
    },
    timelineBadgeTextNext: {
      color: '#FFFFFF',
    },
    timelineVerticalLine: {
      width: 2,
      flex: 1,
      minHeight: 48,
      backgroundColor: colors.border,
      marginTop: -2,
    },

    stopCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.xs,
      marginBottom: spacing.sm,
      ...shadows.sm,
    },
    stopCardNext: {
      borderColor: '#1D4ED8',
      backgroundColor: colors.surfaceElevated,
      ...shadows.md,
    },
    stopCardPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.99 }],
    },
    stopCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    timeTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    stopTimeText: {
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: '600',
    },
    headerBadgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    multiPackageBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primaryGhost,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.full,
      gap: 3,
    },
    multiPackageText: {
      ...typography.caption,
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusPillNext: {
      backgroundColor: colors.primaryGhost,
      borderColor: colors.primary,
    },
    statusPillCompleted: {
      backgroundColor: colors.successGhost,
      borderColor: colors.success + '44',
    },
    statusPillFailed: {
      backgroundColor: colors.dangerGhost,
      borderColor: colors.danger + '44',
    },
    statusPillText: {
      ...typography.caption,
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
    },
    statusPillTextNext: {
      color: colors.primary,
    },
    statusPillTextCompleted: {
      color: colors.success,
    },
    statusPillTextFailed: {
      color: colors.danger,
    },

    stopCardBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    addressWrap: {
      flex: 1,
      gap: 2,
    },
    stopAddressText: {
      ...typography.bodyMedium,
      fontWeight: '700',
      color: colors.text,
    },
    stopBairroText: {
      ...typography.caption,
      color: colors.textMuted,
    },
  });

const createScreenStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      backgroundColor: colors.primary,
    },

    /* ── Multi-Lasso Overlay (Screenshot 2) ── */
    lassoOverlay: {
      backgroundColor: 'rgba(15, 23, 42, 0.25)',
      zIndex: 35,
    },
    lassoTopHud: {
      position: 'absolute',
      alignSelf: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderRadius: radius.xxl,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
      gap: spacing.md,
      ...shadows.xl,
    },
    lassoHudCol: {
      alignItems: 'center',
      gap: 2,
    },
    lassoHudLabel: {
      fontSize: 9,
      fontWeight: '800',
      color: '#94A3B8',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    lassoHudRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    lassoHudVal: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    lassoHudDivider: {
      width: 1,
      height: 22,
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    lassoBottomBar: {
      position: 'absolute',
      bottom: 0,
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      zIndex: 40,
    },
    lassoRoundDarkBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#0F172A',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
      ...shadows.md,
    },
    lassoRoundWhiteBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.md,
    },
    lassoConfirmBtn: {
      flex: 1,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#059669',
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.lg,
    },
    lassoConfirmBtnText: {
      fontSize: 13,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 0.8,
    },
    lassoToggleModeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
      paddingHorizontal: spacing.md,
      borderRadius: 24,
      gap: 6,
      ...shadows.md,
    },
    lassoToggleModeBtnDraw: {
      backgroundColor: '#7C3AED',
      borderWidth: 1,
      borderColor: '#A78BFA',
    },
    lassoToggleModeBtnPan: {
      backgroundColor: '#2563EB',
      borderWidth: 1,
      borderColor: '#60A5FA',
    },
    lassoToggleModeText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
    },

    /* ── Persistent Floating Action Bar on Map ── */
    persistentFloatingBar: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      zIndex: 40,
    },
    floatingOptBtn: {
      flex: 1.2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1D4ED8',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      gap: 6,
      ...shadows.lg,
    },
    floatingOptBtnActive: {
      backgroundColor: '#6366F1',
    },
    floatingOptBtnText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    floatingFinishBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#059669',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      gap: 6,
      ...shadows.lg,
    },
    floatingFinishBtnText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },


    /* ── Bottom Sheet ── */
    bottomSheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      borderWidth: 1,
      borderColor: colors.border,
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
      backgroundColor: colors.borderStrong,
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
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      height: 46,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs + 2,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      fontWeight: '500',
      paddingVertical: 0,
    },

    sheetScroll: {
      flex: 1,
    },
    sheetScrollContent: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xxl + 40,
    },

    /* ── Rotas Header ── */
    rotasHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
      marginTop: 2,
    },
    rotasTitle: {
      ...typography.displayMedium,
      color: colors.text,
    },
    rotasStatusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.successGhost,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
      gap: 6,
    },
    rotasStatusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    rotasStatusText: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.success,
    },

    /* ── Metrics Card ── */
    metricsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      marginVertical: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    metricCol: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    metricVal: {
      ...typography.bodyMedium,
      fontWeight: '800',
      color: colors.text,
      marginTop: 2,
    },
    metricLbl: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
    },
    metricDivider: {
      width: 1,
      height: 32,
      backgroundColor: colors.border,
    },

    /* ── Origin Row ── */
    originSection: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
    },
    originDotCol: {
      alignItems: 'center',
      width: 44,
    },
    originDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.primary,
      borderWidth: 3,
      borderColor: colors.primaryGhost,
    },
    originLine: {
      width: 2,
      height: 24,
      backgroundColor: colors.border,
    },
    originInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginLeft: spacing.xs,
    },
    originTextWrap: {
      gap: 1,
    },
    originTitle: {
      ...typography.bodySmall,
      fontWeight: '700',
      color: colors.text,
    },
    originSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
    },

    /* ── Add Stop Row ── */
    addStopSection: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
    },
    addDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },

    /* ── Status Subheader ── */
    statusSubheader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs + 2,
      marginBottom: spacing.xs,
    },
    optimizedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primaryGhost,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.full,
      gap: 5,
    },
    optimizedText: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.primary,
    },
    stopsCountWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    stopsCountText: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.textSecondary,
    },

    timelineContainer: {
      marginTop: spacing.xs,
    },

    /* ── Bottom Actions Bar ── */
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      ...shadows.lg,
    },
    importSheetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      gap: spacing.xs + 2,
    },
    importSheetBtnText: {
      fontSize: 14,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    bottomActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    reoptimizeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryGhost,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      gap: 6,
      borderWidth: 1,
      borderColor: colors.primary + '33',
    },
    // Task 5: estilo ativo quando routeNeedsOptimization = true
    reoptimizeBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primaryDark || colors.primary,
      ...shadows.md,
    },
    reoptimizeBtnText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '700',
    },
    reoptimizeBtnTextActive: {
      color: '#FFFFFF',
    },
    finishRouteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.success,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      gap: 6,
    },
    finishRouteBtnText: {
      fontSize: 14,
      color: '#FFFFFF',
      fontWeight: '700',
    },

    btnDisabled: {
      opacity: 0.6,
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },

    /* ── Stop Modal Detail ── */
    stopModalOverlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 50,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
    },
    stopModalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      gap: spacing.sm,
      maxHeight: '80%',
      ...shadows.xl,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginTop: spacing.xs,
    },
    modalStopBadge: {
      ...typography.label,
      color: colors.primary,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    modalStopName: {
      ...typography.title,
      color: colors.text,
      fontWeight: '800',
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalMetaText: {
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: '600',
    },
    modalDeliveriesList: {
      maxHeight: 180,
      marginVertical: spacing.xs,
    },
    modalDeliveryItem: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.xs,
      gap: 2,
    },
    modalDeliveryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalDeliveryTitle: {
      ...typography.bodySmall,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },
    orderPill: {
      backgroundColor: colors.primaryGhost,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    orderPillText: {
      ...typography.caption,
      fontSize: 10,
      fontWeight: '700',
      color: colors.primary,
    },
    modalDeliverySub: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    modalDeliveryNotes: {
      ...typography.caption,
      color: colors.textMuted,
      fontStyle: 'italic',
    },

    modalActionsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginVertical: spacing.xs,
    },
    modalActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    modalActionBtnText: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.text,
    },
    modalStatusRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    modalStatusBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      gap: 6,
      ...shadows.sm,
    },
    modalStatusBtnText: {
      fontSize: 14,
      color: '#FFFFFF',
      fontWeight: '700',
    },

    /* Loop Badges ('1', '2', '3') */
    loopBadgeContainer: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    loopBadgeCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#6366F1',
      borderWidth: 2.5,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.md,
      elevation: 8,
    },
    loopBadgeText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
    },

    /* Loading Modal Overlay com Texto Explicativo */
    loadingModalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(10, 15, 30, 0.75)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      paddingHorizontal: spacing.lg,
    },
    loadingModalCard: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      ...shadows.xl,
      elevation: 12,
    },
    loadingModalTitle: {
      ...typography.title,
      color: colors.text,
      fontWeight: '800',
      fontSize: 17,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    loadingModalSub: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
  });

