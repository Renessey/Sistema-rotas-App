import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import {
  Map as MapLibreMap,
  Camera,
  CameraRef,
  GeoJSONSource,
  Layer,
  ViewAnnotation,
} from '@maplibre/maplibre-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { LocationService } from '../../services/gps/LocationService';
import { ValhallaService } from '../../services/routing/ValhallaService';
import { RouteOptimizationService } from '../../services/routing/RouteOptimizationService';
import { DatabaseService } from '../../storage/DatabaseService';
import type {
  DeliveryEntity,
  GeoJSONFeatureCollection,
  LngLat,
} from '../../types/geo';
import { SNAP_CONFIG } from '../../types/geo';
import { haversine, estimateDurationMeters, isBearingReliable, boundingBox } from '../../utils/geo';
import { colors, spacing, radius } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const OFF_ROUTE_THRESHOLD_M = 60;

export default function MapScreen({ navigation }: Props) {
  const cameraRef = useRef<CameraRef>(null);

  // GPS state
  const [currentLocation, setCurrentLocation] = useState<LngLat>([-46.6333, -23.5505]);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [followGPS, setFollowGPS] = useState(false);

  // Camera state - zoom and followGPS control camera behavior
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

  /* ------------------------------ GPS (Phase 3) ------------------------------ */
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
      } catch (e) {
        if (mounted) setGpsError('GPS desligado ou indisponível. Ligue o GPS.');
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

  /* ------------------------------ Load deliveries ------------------------------ */
  useEffect(() => {
    const loaded = DatabaseService.getAllDeliveries();
    setDeliveries(loaded);
    const completed = new Set(
      loaded.filter((d) => d.status === 'completed').map((d) => d.id),
    );
    setCompletedIds(completed);
  }, []);

  /* ------------------------------ Optimization + Route (Phase 14/15/16) ------------------------------ */
  const optimizeRoute = useCallback(async () => {
    if (locatedDeliveries.length === 0) return;
    setOptimizing(true);
    try {
      const stops = locatedDeliveries.map((d) => [d.longitude!, d.latitude!] as LngLat);
      const optimization = await RouteOptimizationService.optimize(
        currentLocation,
        stops,
        { useDuration: false },
      );

      setOrder(optimization.order);

      // Persist sequence to database
      optimization.order.forEach((stopIdx, sequence) => {
        const delivery = locatedDeliveries[stopIdx];
        DatabaseService.getDb().execute(
          'UPDATE deliveries SET sequence = ?, status = ? WHERE id = ?;',
          [sequence, 'optimized', delivery.id],
        );
      });

      // Final route geometry
      const waypoints = [currentLocation, ...optimization.order.map((i) => stops[i])];
      const result = await ValhallaService.route(waypoints, { costing: 'auto' });
      setRoute(result.geojson);
      setRouteInfo({ distance: result.distance, duration: result.duration });
      setRouteNetwork(result.fromRoadNetwork);
    } catch (error) {
      console.warn('[Map] optimize failed', error);
    } finally {
      setOptimizing(false);
    }
  }, [currentLocation, locatedDeliveries]);

  /* ------------------------------ Camera fit (Phase 17) ------------------------------ */
  const fitRoute = useCallback(() => {
    const coords: LngLat[] = [];
    if (route) {
      route.features.forEach((f) =>
        f.geometry.type === 'LineString' && f.geometry.coordinates.forEach((c) => coords.push(c as LngLat)),
      );
    }
    coords.push(currentLocation);
    locatedDeliveries.forEach((d) => coords.push([d.longitude!, d.latitude!]));

    if (coords.length > 0) {
      const [w, s, e, n] = boundingBox(coords);
      cameraRef.current?.fitBounds(
        [w, s, e, n],
        { padding: { top: 60, right: 40, bottom: 160, left: 40 }, duration: 800 },
      );
    }
  }, [route, currentLocation, locatedDeliveries]);

  /* ------------------------------ Off-route detection + recalc (Phase 18) ------------------------------ */
  const deviatedRef = useRef(0);

  useEffect(() => {
    if (!navigationActive || !route || !nextStop) return;
    // Distance from current location to next stop along the straight line of the remaining route
    const nextCoords: LngLat = [nextStop.longitude!, nextStop.latitude!];
    const distToNext = haversine(currentLocation, nextCoords);

    // Simple heuristic: distance to the *next stop* grows unexpectedly
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
    const result = await ValhallaService.route([currentLocation, ...stops], {
      costing: 'auto',
    });
    setRoute(result.geojson);
    setRouteInfo({ distance: result.distance, duration: result.duration });
  }, [nextStop, orderedDeliveries, completedIds, currentLocation]);

  /* ------------------------------ Stop actions (Phase 19) ------------------------------ */
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
    // Focus on current position once, at a moderate zoom (not too close)
    cameraRef.current?.setStop({
      center: currentLocation,
      zoom: 15,
      duration: 800,
    });
  }, [route, optimizeRoute, currentLocation]);

  const arriveStop = useCallback(() => {
    if (!activeStop) return;
    const coords: LngLat = [activeStop.longitude!, activeStop.latitude!];
    cameraRef.current?.setStop({ center: coords, zoom: 17, duration: 600 });
  }, [activeStop]);

  const completeStop = useCallback(() => {
    if (!activeStop) return;
    DatabaseService.updateDeliveryStatus(activeStop.id, 'completed');
    setCompletedIds((prev) => new Set(prev).add(activeStop.id));
    setActiveStop(null);
    if (navigationActive) recalculateRoute();
  }, [activeStop, navigationActive, recalculateRoute]);

  const skipStop = useCallback(() => {
    if (!activeStop) return;
    DatabaseService.updateDeliveryStatus(activeStop.id, 'failed');
    setActiveStop(null);
  }, [activeStop]);

  /* ------------------------------ Manual correction (Phase 20/21) ------------------------------ */
  const handleManualDrag = useCallback(
    (delivery: DeliveryEntity, lngLat: LngLat) => {
      if (!delivery.latitude || !delivery.longitude) return;
      DatabaseService.updateDeliveryCoords(delivery.id, lngLat[1], lngLat[0]);
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === delivery.id
            ? {
                ...d,
                latitude: lngLat[1],
                longitude: lngLat[0],
                snappedLatitude: lngLat[1],
                snappedLongitude: lngLat[0],
              }
            : d,
        ),
      );
      if (navigationActive) recalculateRoute();
    },
    [navigationActive, recalculateRoute],
  );

  /* ------------------------------ Markers (Phase 13/20/21) ------------------------------ */
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
          <View
            style={[
              styles.deliveryBadge,
              isDone && styles.deliveryBadgeDone,
              isNext && styles.deliveryBadgeNext,
              isActive && styles.deliveryBadgeActive,
            ]}
          >
            <Text style={styles.deliveryBadgeText}>{seq !== undefined ? seq + 1 : '?'}</Text>
          </View>
        </ViewAnnotation>
      );
    });
  }, [locatedDeliveries, order, activeStop, nextStop, completedIds, manualCorrection, handleManualDrag, selectStop]);

  /* ------------------------------ Render ------------------------------ */
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

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <MapLibreMap
          style={styles.map}
          mapStyle="https://api.maptiler.com/maps/streets-v2/style.json?key=gK1k9hgPpqK3yZo3UbrJ"
          compass={true}
          scaleBar={true}
          onRegionDidChange={(e) => {
            setZoom(e.nativeEvent.zoom);
            // If the user manually moves the map, stop auto-following GPS
            if (e.nativeEvent.userInteraction && followGPS) {
              setFollowGPS(false);
            }
          }}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: [-42.98, -22.85], // Maricá/Niterói/São Gonçalo region
              zoom: 13,
            }}
            minZoom={3}
            maxZoom={19}
          />

          {/* Route line (Phase 16/17) */}
          {route && (
            <GeoJSONSource id="route-source" data={route}>
              <Layer
                id="route-line"
                type="line"
                paint={{
                  'line-color': '#2563eb',
                  'line-width': 6,
                  'line-opacity': 0.9,
                }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
            </GeoJSONSource>
          )}

          {/* Current location marker (Phase 13/17) */}
          <ViewAnnotation id="user-location" lngLat={currentLocation} anchor="center">
            <View style={styles.userMarkerOuter}>
              <View style={styles.userMarkerInner} />
            </View>
          </ViewAnnotation>

          {/* Delivery markers */}
          {deliveryMarkers}
        </MapLibreMap>

        {/* Top overlay: actions */}
        <View style={styles.topBar}>
          <Pressable style={styles.topButton} onPress={fitRoute}>
            <Text style={styles.topButtonText}>🎯 Rota</Text>
          </Pressable>
          <Pressable
            style={[styles.topButton, styles.optimizeButton]}
            onPress={optimizeRoute}
            disabled={optimizing}
          >
            {optimizing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.topButtonText}>⚡ Otimizar</Text>
            )}
          </Pressable>
        </View>

        {/* Route info */}
        {routeInfo && (
          <View style={styles.routeInfo}>
            <Text style={styles.routeInfoText}>
              {formatDistance(routeInfo.distance)} • {formatDuration(routeInfo.duration)} •{' '}
              {orderedDeliveries.filter((d) => !completedIds.has(d.id)).length} paradas
              {routeNetwork ? '' : ' (offline aprox.)'}
            </Text>
          </View>
        )}

        {gpsError && (
          <View style={styles.gpsWarning}>
            <Text style={styles.gpsWarningText}>{gpsError}</Text>
          </View>
        )}

        {/* GPS + zoom controls */}
        <View style={styles.controlsRight}>
          <Pressable
            style={[styles.zoomButton, followGPS && styles.followActive]}
            onPress={() => {
              const next = !followGPS;
              setFollowGPS(next);
              // Center on current position with moderate zoom (not too close)
              cameraRef.current?.setStop({
                center: currentLocation,
                zoom: 15,
                duration: 800,
              });
            }}
          >
            <Text style={styles.zoomButtonText}>⌖</Text>
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable style={styles.zoomButton} onPress={() => cameraRef.current?.zoomTo(zoom + 1, { duration: 300 })}>
            <Text style={styles.zoomButtonText}>+</Text>
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable style={styles.zoomButton} onPress={() => cameraRef.current?.zoomTo(zoom - 1, { duration: 300 })}>
            <Text style={styles.zoomButtonText}>−</Text>
          </Pressable>
        </View>

        {/* Stop detail panel (Phase 19/20/21) */}
        {activeStop && (
          <View style={styles.stopPanel}>
            <View style={styles.stopHeader}>
              <Text style={styles.stopTitle}>
                PARADA {activeStopIndex >= 0 ? String(activeStopIndex + 1).padStart(2, '0') : '—'}
              </Text>
              <Pressable onPress={() => setActiveStop(null)}>
                <Text style={styles.stopClose}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.stopName}>{activeStop.name}</Text>
            <Text style={styles.stopAddress}>
              {activeStop.address}
              {activeStop.number ? `, ${activeStop.number}` : ''}
            </Text>
            {activeStop.orderCode ? <Text style={styles.stopMeta}>Pedido: {activeStop.orderCode}</Text> : null}
            {activeStop.phone ? <Text style={styles.stopMeta}>📞 {activeStop.phone}</Text> : null}
            <Text style={styles.stopMeta}>
              📏 {formatDistance(activeStopDistance)} • ⏱ {formatDuration(estimateDurationMeters(activeStopDistance))}
            </Text>

            {!navigationActive ? (
              <Pressable style={styles.stopButton} onPress={startNavigation}>
                <Text style={styles.stopButtonText}>🚀 INICIAR ROTA</Text>
              </Pressable>
            ) : (
              <View style={styles.stopActions}>
                <Pressable style={[styles.stopButton, styles.arriveButton]} onPress={arriveStop}>
                  <Text style={styles.stopButtonText}>CHEGUEI</Text>
                </Pressable>
                <Pressable style={[styles.stopButton, styles.completeButton]} onPress={completeStop}>
                  <Text style={styles.stopButtonText}>CONCLUIR</Text>
                </Pressable>
                <Pressable style={[styles.stopButton, styles.skipButton]} onPress={skipStop}>
                  <Text style={styles.stopButtonText}>PULAR</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.stopActions}>
              <Pressable
                style={[styles.stopButton, styles.correctButton]}
                onPress={() => setManualCorrection((v) => !v)}
              >
                <Text style={styles.stopButtonText}>
                  {manualCorrection ? '✔ SALVAR' : '✎ CORRIGIR LOCALIZAÇÃO'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  topButton: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    elevation: 3,
  },
  optimizeButton: { backgroundColor: colors.success, flex: 1, alignItems: 'center' },
  topButtonText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  routeInfo: {
    position: 'absolute',
    top: 64,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
    elevation: 3,
  },
  routeInfoText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  gpsWarning: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(220,38,38,0.9)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    elevation: 4,
  },
  gpsWarningText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  controlsRight: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.md,
    overflow: 'hidden',
    elevation: 4,
  },
  zoomButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomButtonText: { fontSize: 24, color: colors.text, fontWeight: '700' },
  zoomDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#ccc' },
  followActive: { backgroundColor: colors.primary },
  userMarkerOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(37,99,235,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  userMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  deliveryBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  deliveryBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  deliveryBadgeNext: { backgroundColor: colors.primary, transform: [{ scale: 1.25 }] },
  deliveryBadgeActive: { borderColor: colors.warning, borderWidth: 3 },
  deliveryBadgeDone: { backgroundColor: colors.success },
  stopPanel: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    elevation: 6,
    gap: spacing.xs,
  },
  stopHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stopTitle: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  stopClose: { fontSize: 16, color: colors.textMuted, fontWeight: '700' },
  stopName: { fontSize: 17, fontWeight: '700', color: colors.text },
  stopAddress: { fontSize: 14, color: colors.text },
  stopMeta: { fontSize: 12, color: colors.textMuted },
  stopActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  stopButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    flex: 1,
  },
  stopButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  arriveButton: { backgroundColor: colors.success },
  completeButton: { backgroundColor: colors.primaryDark },
  skipButton: { backgroundColor: colors.textMuted },
  correctButton: { backgroundColor: colors.warning },
});
