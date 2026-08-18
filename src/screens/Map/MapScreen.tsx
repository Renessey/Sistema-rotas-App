import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
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
  ViewAnnotation,
} from '@maplibre/maplibre-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { LocationService } from '../../services/gps/LocationService';
import { ValhallaService } from '../../services/routing/ValhallaService';
import { RouteOptimizationService } from '../../services/routing/RouteOptimizationService';
import { DatabaseService } from '../../storage/DatabaseService';
import { NavigationLauncher } from '../../services/navigation/NavigationLauncher';
import type {
  DeliveryEntity,
  GeoJSONFeatureCollection,
  LngLat,
  FailReason,
} from '../../types/geo';
import { haversine, estimateDurationMeters, boundingBox } from '../../utils/geo';
import { colors, spacing, radius, shadows, typography, statusConfig } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const OFF_ROUTE_THRESHOLD_M = 60;

export default function MapScreen({ navigation }: Props) {
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
  useEffect(() => {
    const loaded = DatabaseService.getAllDeliveries();
    setDeliveries(loaded);
    const completed = new Set(
      loaded.filter((d) => d.status === 'completed').map((d) => d.id),
    );
    setCompletedIds(completed);
  }, []);

  /* ─── Panel animation ─── */
  useEffect(() => {
    Animated.timing(panelAnim, {
      toValue: activeStop ? 1 : 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
    setShowPanel(!!activeStop);
  }, [activeStop, panelAnim]);

  /* ─── Optimization + Route ─── */
  const optimizeRoute = useCallback(async () => {
    if (locatedDeliveries.length === 0) {
      Alert.alert('Sem Entregas', 'Importe uma planilha com entregas localizadas antes de otimizar a rota.');
      return;
    }
    setOptimizing(true);
    try {
      const stops = locatedDeliveries.map((d) => [d.longitude!, d.latitude!] as LngLat);
      const optimization = await RouteOptimizationService.optimize(
        currentLocation,
        stops,
        { useDuration: false },
      );

      setOrder(optimization.order);

      // Persist sequence to DB
      optimization.order.forEach((stopIdx, sequence) => {
        DatabaseService.updateDeliverySequence(locatedDeliveries[stopIdx].id, sequence);
      });

      // Route geometry
      const waypoints = [currentLocation, ...optimization.order.map((i) => stops[i])];
      const result = await ValhallaService.route(waypoints, { costing: 'auto' });
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
  }, [currentLocation, locatedDeliveries]);

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

  /* ─── Off-route detection ─── */
  const deviatedRef = useRef(0);
  useEffect(() => {
    if (!navigationActive || !route || !nextStop) return;
    const nextCoords: LngLat = [nextStop.longitude!, nextStop.latitude!];
    const distToNext = haversine(currentLocation, nextCoords);
    const threshold = OFF_ROUTE_THRESHOLD_M + (accuracy ?? 0);
    if (distToNext > threshold + 500) {
      deviatedRef.current += 1;
      if (deviatedRef.current >= 5) {
        deviatedRef.current = 0;
        recalculateRoute();
      }
    } else {
      deviatedRef.current = 0;
    }
  }, [currentLocation, navigationActive, route, nextStop, accuracy]);

  const recalculateRoute = useCallback(async () => {
    if (!nextStop) return;
    const remaining = orderedDeliveries.filter(
      (d) => !completedIds.has(d.id) && d.status !== 'completed',
    );
    if (remaining.length === 0) return;
    const stops = remaining.map((d) => [d.longitude!, d.latitude!] as LngLat);
    const result = await ValhallaService.route([currentLocation, ...stops], { costing: 'auto' });
    setRoute(result.geojson);
    setRouteInfo({ distance: result.distance, duration: result.duration });
  }, [nextStop, orderedDeliveries, completedIds, currentLocation]);

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
    DatabaseService.updateDeliveryStatus(activeStop.id, 'completed', { deliveredAt: Date.now() });
    setCompletedIds((prev) => new Set(prev).add(activeStop.id));
    setActiveStop(null);
    if (navigationActive) recalculateRoute();
  }, [activeStop, navigationActive, recalculateRoute]);

  const skipStop = useCallback((reason: FailReason = 'absent') => {
    if (!activeStop) return;
    DatabaseService.updateDeliveryStatus(activeStop.id, 'failed', { failReason: reason });
    setCompletedIds((prev) => new Set(prev).add(activeStop.id));
    setActiveStop(null);
  }, [activeStop]);

  const handleManualDrag = useCallback(
    (delivery: DeliveryEntity, lngLat: LngLat) => {
      if (!delivery.latitude || !delivery.longitude) return;
      DatabaseService.updateDeliveryCoords(delivery.id, lngLat[1], lngLat[0], lngLat[1], lngLat[0], 'manual');
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === delivery.id
            ? { ...d, latitude: lngLat[1], longitude: lngLat[0], snappedLatitude: lngLat[1], snappedLongitude: lngLat[0], geocodingSource: 'manual' }
            : d,
        ),
      );
      if (navigationActive) recalculateRoute();
    },
    [navigationActive, recalculateRoute],
  );

  /* ─── Markers ─── */
  const deliveryMarkers = useMemo(() => {
    const sequenceMap = new Map<number, number>();
    order.forEach((stopIdx, i) => {
      const d = locatedDeliveries[stopIdx];
      if (d) sequenceMap.set(d.id, i);
    });

    return locatedDeliveries.map((d) => {
      const isActive = activeStop?.id === d.id;
      const isNext = nextStop?.id === d.id;
      const isDone = completedIds.has(d.id) || d.status === 'completed';
      const seq = sequenceMap.get(d.id);
      const coords: LngLat = [d.longitude!, d.latitude!];

      const markerColor = isDone
        ? colors.success
        : isNext
          ? colors.primary
          : isActive
            ? colors.warning
            : colors.danger;

      return (
        <ViewAnnotation
          key={d.id}
          id={`delivery-${d.id}`}
          lngLat={coords}
          anchor="center"
          draggable={manualCorrection && isActive}
          onDragEnd={(e) => handleManualDrag(d, e.nativeEvent.lngLat)}
          onPress={() => selectStop(d)}
        >
          <View style={[
            markerStyles.pin,
            { backgroundColor: markerColor },
            isNext && markerStyles.pinNext,
            isActive && markerStyles.pinActive,
          ]}>
            <Text style={markerStyles.pinText}>{seq !== undefined ? seq + 1 : '?'}</Text>
            {isNext && <View style={markerStyles.pinPulse} />}
          </View>
        </ViewAnnotation>
      );
    });
  }, [locatedDeliveries, order, activeStop, nextStop, completedIds, manualCorrection, handleManualDrag, selectStop]);

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
    outputRange: [300, 0],
  });

  const speedKmh = speed !== null ? Math.round(speed * 3.6) : null;
  const remainingStops = orderedDeliveries.filter((d) => !completedIds.has(d.id)).length;

  /* ─── Render ─── */
  return (
    <View style={styles.container}>
      <MapLibreMap
        style={styles.map}
        mapStyle="https://api.maptiler.com/maps/streets-v2/style.json?key=gK1k9hgPpqK3yZo3UbrJ"
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
              paint={{ 'line-color': '#000', 'line-width': 10, 'line-opacity': 0.07 }}
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
                'line-color': '#fff',
                'line-width': 2,
                'line-opacity': 0.5,
                'line-dasharray': [0, 4],
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}

        {/* User location */}
        <ViewAnnotation id="user-location" lngLat={currentLocation} anchor="center">
          <View style={styles.userMarkerRing}>
            <View style={styles.userMarkerOuter}>
              <View style={styles.userMarkerInner} />
            </View>
          </View>
        </ViewAnnotation>

        {/* Delivery markers */}
        {deliveryMarkers}
      </MapLibreMap>

      {/* ── HUD Top Bar ── */}
      <View style={[styles.hudTop, { top: insets.top + spacing.sm }]}>
        {/* Speed */}
        <View style={styles.hudCard}>
          <Text style={styles.hudBig}>{speedKmh ?? '—'}</Text>
          <Text style={styles.hudSub}>km/h</Text>
        </View>

        {/* Optimize / Route info */}
        <View style={styles.hudCenter}>
          {routeInfo ? (
            <Pressable style={styles.routeInfoCard} onPress={fitRoute}>
              <Text style={styles.routeInfoPrimary}>
                {formatDistance(routeInfo.distance)} · {formatDuration(routeInfo.duration)}
              </Text>
              <Text style={styles.routeInfoSub}>
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
                <Text style={styles.optimizeBtnText}>⚡ Otimizar Rota</Text>
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

      {/* Right controls */}
      <View style={styles.controlsRight}>
        <Pressable
          style={[styles.ctrlBtn, followGPS && { backgroundColor: colors.primary }]}
          onPress={() => {
            const next = !followGPS;
            setFollowGPS(next);
            cameraRef.current?.setStop({ center: currentLocation, zoom: 15, duration: 800 });
          }}
        >
          <Text style={[styles.ctrlBtnText, followGPS && { color: '#fff' }]}>⌖</Text>
        </Pressable>
        <View style={styles.ctrlDivider} />
        <Pressable style={styles.ctrlBtn} onPress={() => cameraRef.current?.zoomTo(zoom + 1, { duration: 300 })}>
          <Text style={styles.ctrlBtnText}>+</Text>
        </Pressable>
        <View style={styles.ctrlDivider} />
        <Pressable style={styles.ctrlBtn} onPress={() => cameraRef.current?.zoomTo(zoom - 1, { duration: 300 })}>
          <Text style={styles.ctrlBtnText}>−</Text>
        </Pressable>
      </View>

      {/* "Fit route" fab */}
      {route && (
        <Pressable style={styles.fitFab} onPress={fitRoute}>
          <Text style={styles.fitFabText}>🎯</Text>
        </Pressable>
      )}

      {/* ── Stop detail panel (Bottom Sheet) ── */}
      {showPanel && activeStop && (
        <Animated.View style={[styles.panel, { transform: [{ translateY: panelTranslate }], paddingBottom: insets.bottom + spacing.xl }]}>
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
    </View>
  );
}

/* ─── Styles ─── */
const markerStyles = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
    ...shadows.md,
  },
  pinNext: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderColor: '#fff',
    borderWidth: 3,
  },
  pinActive: {
    borderColor: colors.warning,
    borderWidth: 3,
  },
  pinText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  pinPulse: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: colors.primary,
    opacity: 0.4,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  // HUD Top
  hudTop: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hudCard: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    minWidth: 56,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.md,
  },
  hudBig: { ...typography.title, color: colors.text },
  hudSub: { ...typography.caption, color: colors.textMuted },
  hudCenter: { flex: 1 },
  routeInfoCard: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.md,
  },
  routeInfoPrimary: { ...typography.bodyMedium, color: colors.text },
  routeInfoSub: { ...typography.caption, color: colors.textMuted },
  optimizeBtn: {
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    ...shadows.colored(colors.success),
  },
  optimizeBtnText: { color: '#fff', ...typography.bodyMedium, fontWeight: '700' },

  // GPS error
  gpsError: {
    position: 'absolute',
    top: 90,
    alignSelf: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadows.md,
  },
  gpsErrorText: { color: '#fff', ...typography.bodySmall, fontWeight: '600' },

  // Controls right
  controlsRight: {
    position: 'absolute',
    right: spacing.md,
    bottom: 240,
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.md,
  },
  ctrlBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  ctrlBtnText: { fontSize: 22, color: colors.text, fontWeight: '700' },
  ctrlDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  // Fit FAB
  fitFab: {
    position: 'absolute',
    right: spacing.md,
    bottom: 340,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  fitFabText: { fontSize: 20 },

  // User marker
  userMarkerRing: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  userMarkerOuter: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary + '40',
    borderWidth: 2, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
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
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
    ...shadows.xl,
  },
  panelHandle: {
    alignSelf: 'center',
    width: 40, height: 4,
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
  panelCloseText: { fontSize: 18, color: colors.textMuted },
  panelAddress: { ...typography.body, color: colors.textSecondary },
  panelMeta: { ...typography.bodySmall, color: colors.textMuted },
  panelDist: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },

  externalRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  externalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
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
});
