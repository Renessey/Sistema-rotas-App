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
import { BottomNavBar } from '../../components/Navigation/BottomNavBar';
import type {
  DeliveryEntity,
  GeoJSONFeatureCollection,
  LngLat,
  FailReason,
  Costing,
} from '../../types/geo';
import { haversine, estimateDurationMeters, boundingBox, minDistanceToPolyline } from '../../utils/geo';
import { colors, spacing, radius, shadows, typography, statusConfig } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const OFF_ROUTE_THRESHOLD_M = 35;

export default function MapScreen({ navigation }: Props) {
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const panelAnim = useRef(new Animated.Value(0)).current;

  // GPS state
  const [currentLocation, setCurrentLocation] = useState<LngLat>([-43.0, -22.9]);
  const [heading, setHeading] = useState<number | null>(null);
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

  // Deliveries + route
  const [deliveries, setDeliveries] = useState<DeliveryEntity[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [route, setRoute] = useState<GeoJSONFeatureCollection | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [routeNetwork, setRouteNetwork] = useState(true);

  // Stops / navigation
  const [activeStop, setActiveStop] = useState<DeliveryEntity | null>(null);
  const [navigationActive, setNavigationActive] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [manualCorrection, setManualCorrection] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

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
    return order.map((idx) => locatedDeliveries[idx]).filter(Boolean);
  }, [order, locatedDeliveries]);

  const nextStop = useMemo(() => {
    return orderedDeliveries.find((d) => !completedIds.has(d.id) && d.status !== 'completed') ?? null;
  }, [orderedDeliveries, completedIds]);

  const pendingDeliveriesCount = useMemo(() => {
    return deliveries.filter((d) => d.status === 'pending' || d.status === 'in_progress').length;
  }, [deliveries]);

  /* ─── GPS ─── */
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
        setHeading(pos.heading);
        setSpeed(pos.speed);
        cameraRef.current?.setStop({ center: [pos.longitude, pos.latitude], zoom: 14, duration: 800 });
      } catch {
        if (mounted) setGpsError('GPS desligado ou indisponível.');
      }

      stopWatching = LocationService.watchPosition(
        (update) => {
          if (!mounted) return;
          setCurrentLocation([update.longitude, update.latitude]);
          setAccuracy(update.accuracy);
          setHeading(update.heading);
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

  /* ─── Load deliveries ─── */
  const reloadDeliveries = useCallback(() => {
    const loaded = DatabaseService.getAllDeliveries();
    setDeliveries(loaded);
    const completed = new Set(
      loaded.filter((d) => d.status === 'completed').map((d) => d.id),
    );
    setCompletedIds(completed);
  }, []);

  useEffect(() => {
    reloadDeliveries();
  }, [reloadDeliveries]);

  /* ─── Panel animation ─── */
  useEffect(() => {
    Animated.timing(panelAnim, {
      toValue: activeStop ? 1 : 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
    setShowPanel(!!activeStop);
  }, [activeStop, panelAnim]);

  /* ─── Rebuild Saved Route ─── */
  useEffect(() => {
    if (route || locatedDeliveries.length === 0 || !currentLocation || accuracy === null) return;

    const hasSequence = locatedDeliveries.some((d) => d.sequence !== null);
    if (hasSequence) {
      const savedOrder = locatedDeliveries
        .map((d, index) => ({ index, sequence: d.sequence }))
        .filter((x) => x.sequence !== null)
        .sort((a, b) => a.sequence! - b.sequence!)
        .map((x) => x.index);

      setOrder(savedOrder);

      const stops = locatedDeliveries.map((d) => [d.snappedLongitude ?? d.longitude!, d.snappedLatitude ?? d.latitude!] as LngLat);
      const waypoints = [currentLocation, ...savedOrder.map((i) => stops[i])];

      ValhallaService.route(waypoints, { costing: costingMode }).then((result) => {
        setRoute(result.geojson);
        setRouteInfo({ distance: result.distance, duration: result.duration });
        setRouteNetwork(result.fromRoadNetwork);
      }).catch((e) => console.warn('Saved route failed', e));
    }
  }, [locatedDeliveries, currentLocation, accuracy, route, costingMode]);

  /* ─── Camera fit ─── */
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
        { padding: { top: 80, right: 40, bottom: 220, left: 40 }, duration: 800 },
      );
    }
  }, [route, currentLocation, locatedDeliveries]);

  /* ─── Optimization + Route ─── */
  const optimizeRoute = useCallback(async () => {
    if (locatedDeliveries.length === 0) {
      Alert.alert('Sem Entregas', 'Importe uma planilha com entregas localizadas antes de otimizar a rota.');
      return;
    }
    setOptimizing(true);
    try {
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

      const optimization = await RouteOptimizationService.optimize(
        currentLocation,
        optimizationStops,
        { useDuration: false },
      );

      const newOrder = optimization.order.map((i) => pendingIndices[i]);
      setOrder(newOrder);

      // Persist sequence to DB
      newOrder.forEach((stopIdx, sequence) => {
        DatabaseService.updateDeliverySequence(locatedDeliveries[stopIdx].id, sequence);
      });

      // Route geometry
      const waypoints = [currentLocation, ...newOrder.map((i) => stops[i])];
      const result = await ValhallaService.route(waypoints, { costing: costingMode });
      setRoute(result.geojson);
      setRouteInfo({ distance: result.distance, duration: result.duration });
      setRouteNetwork(result.fromRoadNetwork);

      // Auto-fit camera
      setTimeout(() => fitRoute(), 300);
    } catch (error) {
      console.warn('[Map] optimize failed', error);
      Alert.alert('Erro', 'Não foi possível otimizar a rota. Verifique a conexão.');
    } finally {
      setOptimizing(false);
    }
  }, [currentLocation, locatedDeliveries, costingMode, fitRoute]);

  /* ─── Route Polyline (Flat coordinates for fast off-route checks) ─── */
  const routePolyline = useMemo(() => {
    if (!route) return [];
    const points: LngLat[] = [];
    route.features.forEach((f) => {
      if (f.geometry?.coordinates) {
        f.geometry.coordinates.forEach((c) => points.push(c));
      }
    });
    return points;
  }, [route]);

  /* ─── Real-Time Recalculate & Off-Route Detection ─── */
  const isRecalculatingRef = useRef(false);
  const lastRecalculateTimeRef = useRef(0);
  const consecutiveDeviationsRef = useRef(0);

  const recalculateRoute = useCallback(async () => {
    if (isRecalculatingRef.current) return;
    const remaining = orderedDeliveries.filter(
      (d) => !completedIds.has(d.id) && d.status !== 'completed',
    );
    if (remaining.length === 0) return;

    isRecalculatingRef.current = true;
    try {
      const stops = remaining.map((d) => [d.snappedLongitude ?? d.longitude!, d.snappedLatitude ?? d.latitude!] as LngLat);
      const result = await ValhallaService.route([currentLocation, ...stops], { costing: costingMode });
      setRoute(result.geojson);
      setRouteInfo({ distance: result.distance, duration: result.duration });
      setRouteNetwork(result.fromRoadNetwork);
      lastRecalculateTimeRef.current = Date.now();
    } catch (e) {
      console.warn('[Map] recalculateRoute error', e);
    } finally {
      isRecalculatingRef.current = false;
    }
  }, [orderedDeliveries, completedIds, currentLocation, costingMode]);

  // Monitor off-route continuously as user moves
  useEffect(() => {
    if (!route || routePolyline.length === 0 || !nextStop) return;

    if (Date.now() - lastRecalculateTimeRef.current < 2500) return;
    if (isRecalculatingRef.current) return;

    const distToRoute = minDistanceToPolyline(currentLocation, routePolyline);
    const dynamicThreshold = OFF_ROUTE_THRESHOLD_M + Math.min(accuracy ?? 0, 20);

    if (distToRoute > dynamicThreshold) {
      consecutiveDeviationsRef.current += 1;
      if (consecutiveDeviationsRef.current >= 2 || distToRoute > 70) {
        consecutiveDeviationsRef.current = 0;
        recalculateRoute();
      }
    } else {
      consecutiveDeviationsRef.current = 0;
    }
  }, [currentLocation, route, routePolyline, nextStop, accuracy, recalculateRoute]);

  /* ─── Stop actions ─── */
  const selectStop = useCallback((delivery: DeliveryEntity) => {
    setActiveStop(delivery);
    setManualCorrection(false);
    if (delivery.latitude !== null && delivery.longitude !== null) {
      cameraRef.current?.setStop({
        center: [delivery.longitude, delivery.latitude],
        zoom: 16,
        duration: 600,
      });
    }
  }, []);

  const startNavigation = useCallback(() => {
    setNavigationActive(true);
    if (!route) optimizeRoute();
    setManualCorrection(false);
    cameraRef.current?.setStop({ center: currentLocation, zoom: 15, duration: 800 });
  }, [route, optimizeRoute, currentLocation]);

  const completeStop = useCallback(() => {
    if (!activeStop) return;
    const stopId = activeStop.id;
    DatabaseService.updateDeliveryStatus(stopId, 'completed', { deliveredAt: Date.now() });
    setDeliveries((prev) =>
      prev.map((d) => (d.id === stopId ? { ...d, status: 'completed', deliveredAt: Date.now() } : d)),
    );
    setCompletedIds((prev) => new Set(prev).add(stopId));
    setActiveStop(null);
    if (navigationActive || hideCompleted) recalculateRoute();
  }, [activeStop, navigationActive, hideCompleted, recalculateRoute]);

  const skipStop = useCallback((reason: FailReason = 'absent') => {
    if (!activeStop) return;
    const stopId = activeStop.id;
    DatabaseService.updateDeliveryStatus(stopId, 'failed', { failReason: reason });
    setDeliveries((prev) =>
      prev.map((d) => (d.id === stopId ? { ...d, status: 'failed', failReason: reason } : d)),
    );
    setCompletedIds((prev) => new Set(prev).add(stopId));
    setActiveStop(null);
    if (navigationActive) recalculateRoute();
  }, [activeStop, navigationActive, recalculateRoute]);

  /* ─── Custom Pin Markers (TASK-06 / TASK-07) ─── */
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
        // If hide completed is active, exclude points where all orders are completed
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
        const zIndex = isNext || isActive ? 999 : 1;

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

  /* ─── Helpers ─── */
  const formatDistance = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  const formatDuration = (s: number) => {
    const mins = Math.round(s / 60);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${mins} min`;
  };

  const activeStopIndex = activeStop
    ? orderedDeliveries.findIndex((d) => d.id === activeStop.id)
    : -1;

  const activeStopDistance = activeStop
    ? activeStopIndex > 0
      ? haversine(
          [orderedDeliveries[activeStopIndex - 1].longitude!, orderedDeliveries[activeStopIndex - 1].latitude!],
          [activeStop.longitude!, activeStop.latitude!],
        )
      : haversine(currentLocation, [activeStop.longitude!, activeStop.latitude!])
    : 0;

  const panelTranslate = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [360, 0],
  });

  const speedKmh = speed !== null ? Math.round(speed * 3.6) : null;
  const remainingStops = orderedDeliveries.filter((d) => !completedIds.has(d.id)).length;
  const currentStyleUrl = getMapStyleUrl(mapType, mapTheme);

  return (
    <View style={styles.container}>
      <MapLibreMap
        style={styles.map}
        mapStyle={currentStyleUrl}
        compass={true}
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
          initialViewState={{ center: [-43.0, -22.9], zoom: 12 }}
          minZoom={3}
          maxZoom={20}
        />

        {/* Route line */}
        {route && (
          <GeoJSONSource id="route-source" data={route}>
            <Layer
              id="route-shadow"
              type="line"
              paint={{ 'line-color': '#000000', 'line-width': 10, 'line-opacity': 0.12 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-line"
              type="line"
              paint={{ 'line-color': colors.primary, 'line-width': 6, 'line-opacity': 0.95 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-dash"
              type="line"
              paint={{
                'line-color': '#FFFFFF',
                'line-width': 2,
                'line-opacity': 0.6,
                'line-dasharray': [0, 4],
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}

        {/* User location */}
        <Marker id="user-location" lngLat={currentLocation} anchor="center">
          <View style={styles.userMarkerRing}>
            <View style={styles.userMarkerOuter}>
              <View style={styles.userMarkerInner} />
            </View>
          </View>
        </Marker>

        {/* Delivery markers */}
        {deliveryMarkers}
      </MapLibreMap>

      {/* ── Top Header Bar (Voltar + HUD) ── */}
      <View
        style={[
          styles.topContainer,
          { top: Math.max(insets.top, spacing.xs) + spacing.xs },
        ]}
        pointerEvents="box-none"
      >
        {/* Linha superior: Botão Voltar */}
        <View style={styles.topNavRow} pointerEvents="box-none">
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <Text style={styles.backButtonIcon}>←</Text>
          </Pressable>
        </View>

        {/* Linha inferior: Controles HUD (km/h, Otimizar/Rota, GPS) */}
        <View style={styles.hudTop} pointerEvents="box-none">
          {/* Speed */}
          <View style={styles.hudCard}>
            <Text style={styles.hudBig}>{speedKmh ?? '—'}</Text>
            <Text style={styles.hudSub}>km/h</Text>
          </View>

          {/* Optimize / Route info */}
          <View style={styles.hudCenter}>
            {routeInfo ? (
              <Pressable style={styles.routeInfoCard} onPress={fitRoute}>
                <Text style={styles.routeInfoPrimary} numberOfLines={1} adjustsFontSizeToFit>
                  {formatDistance(routeInfo.distance)} · {formatDuration(routeInfo.duration)}
                </Text>
                <Text style={styles.routeInfoSub} numberOfLines={1}>
                  {remainingStops} parada{remainingStops !== 1 ? 's' : ''} restante{remainingStops !== 1 ? 's' : ''}
                  {!routeNetwork ? ' · aprox.' : ''}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.optimizeBtn, optimizing && { opacity: 0.7 }]}
                onPress={optimizeRoute}
                disabled={optimizing}
              >
                {optimizing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.optimizeBtnText} numberOfLines={1}>⚡ Otimizar Rota</Text>
                )}
              </Pressable>
            )}
          </View>

          {/* Accuracy */}
          <View style={styles.hudCard}>
            <Text style={styles.hudBig}>{accuracy !== null ? Math.round(accuracy) : '—'}</Text>
            <Text style={styles.hudSub}>GPS±m</Text>
          </View>
        </View>

        {/* GPS Error */}
        {gpsError && (
          <View style={styles.gpsError}>
            <Text style={styles.gpsErrorText}>⚠️ {gpsError}</Text>
          </View>
        )}
      </View>

      {/* Floating Action Controls (Camadas, FitBounds, Seguir GPS, Zoom, Atualizar) */}
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
        onZoomIn={() => cameraRef.current?.zoomTo(zoom + 1, { duration: 300 })}
        onZoomOut={() => cameraRef.current?.zoomTo(zoom - 1, { duration: 300 })}
        onRefresh={() => {
          reloadDeliveries();
          if (route) recalculateRoute();
        }}
      />

      {/* Modal de Exibição / Camadas do Mapa */}
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

      {/* ── Stop detail panel (Bottom Sheet) ── */}
      {showPanel && activeStop && (
        <Animated.View
          style={[
            styles.panel,
            {
              transform: [{ translateY: panelTranslate }],
              paddingBottom: insets.bottom + spacing.xl + 50,
            },
          ]}
        >
          {/* Handle */}
          <View style={styles.panelHandle} />

          {/* Header */}
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelBadge}>
                PARADA {activeStopIndex >= 0 ? String(activeStopIndex + 1).padStart(2, '0') : '—'}
              </Text>
              <Text style={styles.panelName}>{activeStop.name}</Text>
            </View>
            <Pressable style={styles.panelClose} onPress={() => setActiveStop(null)}>
              <Text style={styles.panelCloseText}>✕</Text>
            </Pressable>
          </View>

          {/* Address */}
          <Text style={styles.panelAddress}>
            {activeStop.address}{activeStop.number ? `, ${activeStop.number}` : ''}
            {activeStop.complement ? ` (${activeStop.complement})` : ''}
          </Text>
          {activeStop.neighborhood ? (
            <Text style={styles.panelMeta}>📍 {activeStop.neighborhood} · {activeStop.city}/{activeStop.state}</Text>
          ) : null}
          {activeStop.cep ? <Text style={styles.panelMeta}>📮 CEP {activeStop.cep}</Text> : null}
          {activeStop.orderCode ? <Text style={styles.panelMeta}>📋 Pedido: {activeStop.orderCode}</Text> : null}
          {activeStop.phone ? <Text style={styles.panelMeta}>📞 {activeStop.phone}</Text> : null}
          {activeStop.notes ? <Text style={styles.panelMeta}>💬 {activeStop.notes}</Text> : null}

          <Text style={styles.panelDist}>
            📏 {formatDistance(activeStopDistance)} · ⏱ {formatDuration(estimateDurationMeters(activeStopDistance))}
          </Text>

          {/* External navigation */}
          <View style={styles.externalRow}>
            <Pressable
              style={styles.externalBtn}
              onPress={() => activeStop.latitude !== null && NavigationLauncher.openNavigation(
                [activeStop.longitude!, activeStop.latitude!], activeStop.address, 'waze',
              )}
            >
              <Text style={styles.externalBtnText}>🗺️ Waze</Text>
            </Pressable>
            <Pressable
              style={styles.externalBtn}
              onPress={() => activeStop.latitude !== null && NavigationLauncher.openNavigation(
                [activeStop.longitude!, activeStop.latitude!], activeStop.address, 'google_maps',
              )}
            >
              <Text style={styles.externalBtnText}>📍 Google</Text>
            </Pressable>
            {activeStop.phone && (
              <Pressable
                style={styles.externalBtn}
                onPress={() => NavigationLauncher.openWhatsApp(
                  activeStop.phone!,
                  activeStop.name,
                  `${activeStop.address}${activeStop.number ? ', ' + activeStop.number : ''}`,
                )}
              >
                <Text style={styles.externalBtnText}>💬 WhatsApp</Text>
              </Pressable>
            )}
            {activeStop.phone && (
              <Pressable
                style={styles.externalBtn}
                onPress={() => NavigationLauncher.callPhone(activeStop.phone!)}
              >
                <Text style={styles.externalBtnText}>📞 Ligar</Text>
              </Pressable>
            )}
          </View>

          {/* Action buttons */}
          {!navigationActive ? (
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={startNavigation}>
              <Text style={styles.actionBtnText}>🚀 Iniciar Navegação</Text>
            </Pressable>
          ) : (
            <View style={styles.actionRow}>
              <Pressable style={[styles.actionBtn, { backgroundColor: colors.success, flex: 1 }]} onPress={completeStop}>
                <Text style={styles.actionBtnText}>✅ Concluir</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, { backgroundColor: colors.danger, flex: 1 }]} onPress={() => skipStop('absent')}>
                <Text style={styles.actionBtnText}>❌ Pular</Text>
              </Pressable>
            </View>
          )}

          <Pressable
            style={[styles.actionBtn, { backgroundColor: manualCorrection ? colors.success : colors.warning }]}
            onPress={() => setManualCorrection((v) => !v)}
          >
            <Text style={styles.actionBtnText}>
              {manualCorrection ? '✔ Salvar Posição' : '✎ Ajustar Pino no Mapa'}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Barra de Navegação Inferior (Fixa na tela do mapa) */}
      <View style={styles.bottomNavWrapper} pointerEvents="box-none">
        <BottomNavBar
          activeTab="Map"
          onSelectTab={(tab) => {
            if (tab === 'Home') navigation.navigate('Home');
            else if (tab === 'Deliveries') navigation.navigate('Deliveries');
            else if (tab === 'Settings') navigation.navigate('Settings');
          }}
          pendingCount={pendingDeliveriesCount}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  topContainer: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 999,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  backButtonPressed: {
    backgroundColor: colors.surfaceElevated,
    transform: [{ scale: 0.95 }],
  },
  backButtonIcon: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '700',
    marginTop: -1,
  },

  // HUD Top
  hudTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  hudCard: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.md,
  },
  hudBig: { ...typography.titleSmall, color: colors.text, fontWeight: '700' },
  hudSub: { fontSize: 10, color: colors.textMuted, marginTop: 1, fontWeight: '500' },
  hudCenter: {
    flex: 1,
    minWidth: 0,
  },
  routeInfoCard: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.md,
  },
  routeInfoPrimary: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  routeInfoSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  optimizeBtn: {
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.colored(colors.success),
  },
  optimizeBtnText: { color: '#fff', ...typography.bodySmall, fontWeight: '700' },

  // GPS error
  gpsError: {
    alignSelf: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    ...shadows.md,
  },
  gpsErrorText: { color: '#fff', ...typography.bodySmall, fontWeight: '600' },

  // User marker
  userMarkerRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary + '40',
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },

  // Bottom Sheet Panel
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    gap: spacing.sm,
    zIndex: 100,
    ...shadows.xl,
  },
  panelHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  panelBadge: { ...typography.label, color: colors.primary, letterSpacing: 1 },
  panelName: { ...typography.title, color: colors.text, maxWidth: '85%' },
  panelClose: { padding: spacing.xs },
  panelCloseText: { fontSize: 16, color: colors.textMuted },
  panelAddress: { ...typography.body, color: colors.textSecondary },
  panelMeta: { ...typography.bodySmall, color: colors.textMuted },
  panelDist: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },

  externalRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  externalBtnText: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', ...typography.bodyMedium, fontWeight: '800' },

  bottomNavWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
});
