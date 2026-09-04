import { useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { LocationService } from '../../../services/gps/LocationService';
import { RoutingService } from '../../../services/routing/RoutingService';
import { RouteOptimizationService } from '../../../services/routing/RouteOptimizationService';
import { DatabaseService } from '../../../storage/DatabaseService';
import { boundingBox, groupDeliveriesIntoStops } from '../../../utils/geo';
import type {
  DeliveryEntity,
  GeoJSONFeatureCollection,
  LngLat,
  FailReason,
  Costing,
  RouteStop,
} from '../../../types/geo';

interface UseMapDeliveriesProps {
  cameraRef: React.RefObject<CameraRef | null>;
  costingMode: Costing;
  currentLocation: LngLat | null;
  setCurrentLocation: (loc: LngLat) => void;
  setHasGpsFix: (fix: boolean) => void;
  currentHeadingRef: React.MutableRefObject<number | null>;
  onStopCompleted?: () => void;
}

export function useMapDeliveries({
  cameraRef,
  costingMode,
  currentLocation,
  setCurrentLocation,
  setHasGpsFix,
  currentHeadingRef,
  onStopCompleted,
}: UseMapDeliveriesProps) {
  const [deliveries, setDeliveries] = useState<DeliveryEntity[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [route, setRoute] = useState<GeoJSONFeatureCollection | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [routeNeedsOptimization, setRouteNeedsOptimization] = useState(false);

  const [activeStop, setActiveStop] = useState<RouteStop | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [optimizationSummary, setOptimizationSummary] = useState<{
    visible: boolean;
    stopsCount: number;
    packagesCount: number;
    distanceMeters: number;
    durationSeconds: number;
    isOffline: boolean;
  } | null>(null);

  // ─── Memos de entregas e paradas ──────────────────────────────────────────
  const locatedDeliveries = useMemo(
    () => deliveries.filter((d) => d.latitude !== null && d.longitude !== null),
    [deliveries],
  );

  const unlocatedCount = useMemo(
    () => deliveries.filter((d) => d.latitude === null || d.longitude === null || d.status === 'invalid_coords').length,
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
    const now = new Date();
    let accumulatedMinutes = 10; // Margem de atraso inicial (10 min)
    return filteredStops.map((stop, i) => {
      if (stop.status === 'completed') {
        return 'Entregue';
      }
      accumulatedMinutes += 7 + (i === 0 ? 3 : 5);
      const arrival = new Date(now.getTime() + accumulatedMinutes * 60 * 1000);
      const hourStr = String(arrival.getHours()).padStart(2, '0');
      const minStr = String(arrival.getMinutes()).padStart(2, '0');
      return `${hourStr}:${minStr}`;
    });
  }, [filteredStops]);

  const totalStopsCount = routeStops.length;
  const totalPackagesCount = deliveries.length;

  // ─── Recarregar entregas do banco ─────────────────────────────────────────
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

  // ─── Ajustar Câmera aos limites da Rota ───────────────────────────────────
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
  }, [route, currentLocation, locatedDeliveries, cameraRef]);

  // ─── Otimizar Rota Completa ───────────────────────────────────────────────
  const optimizeRoute = useCallback(
    async (originOverride?: LngLat) => {
      if (locatedDeliveries.length === 0) {
        Alert.alert('Sem Entregas', 'Importe uma planilha antes de otimizar a rota.');
        return;
      }
      setOptimizing(true);
      // Libera o event loop do JS para o React renderizar imediatamente o feedback visual de carregamento
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 25));

      try {
        const uniqueStops = groupDeliveriesIntoStops(locatedDeliveries);
        const pendingStops = uniqueStops.filter((s) => s.status !== 'completed');

        if (pendingStops.length === 0) {
          Alert.alert('Aviso', 'Todas as entregas já foram concluídas.');
          setOptimizing(false);
          return;
        }

        let userCoords: LngLat | null = originOverride || null;

        if (!userCoords) {
          if (currentLocation) {
            userCoords = currentLocation;
          } else {
            try {
              const freshPos = await LocationService.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 800,
                maximumAge: 15000,
              });
              userCoords = [freshPos.longitude, freshPos.latitude];
              setCurrentLocation(userCoords);
              setHasGpsFix(true);
            } catch {
              // Em modo offline ou sem sinal de GPS imediato, inicia a partir da 1ª parada
              const firstLocated = locatedDeliveries.find((d) => d.longitude && d.latitude);
              if (firstLocated) {
                userCoords = [firstLocated.longitude!, firstLocated.latitude!];
              }
            }
          }
        }

        if (!userCoords) {
          const firstLocated = locatedDeliveries.find((d) => d.longitude && d.latitude);
          if (firstLocated) {
            userCoords = [firstLocated.longitude!, firstLocated.latitude!];
          } else {
            Alert.alert(
              'Aviso',
              'Não foi possível determinar o ponto de partida. Verifique suas paradas.',
            );
            setOptimizing(false);
            return;
          }
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

        // Cálculo do tempo estimado total:
        // Tempo de trajeto + 10 min de atraso/tolerância + tempo de cada parada (7 min por parada)
        // Uma rota de 40 a 50 paradas resulta em ~6h a 7h de jornada diária
        const baseDelaySeconds = 10 * 60; // 10 min
        const perStopServiceSeconds = 7 * 60; // 7 min por parada
        const totalEstimatedDuration =
          result.duration + baseDelaySeconds + pendingStops.length * perStopServiceSeconds;

        setRoute(result.geojson);
        setRouteInfo({ distance: result.distance, duration: totalEstimatedDuration });
        setRouteNeedsOptimization(false);

        setTimeout(() => fitRoute(), 200);

        setOptimizationSummary({
          visible: true,
          stopsCount: pendingStops.length,
          packagesCount: locatedDeliveries.length,
          distanceMeters: result.distance,
          durationSeconds: totalEstimatedDuration,
          isOffline: RoutingService.isForcedOffline(),
        });
      } catch (error) {
        console.warn('[Map] optimize failed', error);
        Alert.alert('Aviso', 'Não foi possível otimizar a rota. Tente novamente.');
      } finally {
        setOptimizing(false);
      }
    },
    [
      locatedDeliveries,
      currentLocation,
      costingMode,
      currentHeadingRef,
      fitRoute,
      setCurrentLocation,
      setHasGpsFix,
    ],
  );

  // ─── Recalcular Rota ──────────────────────────────────────────────────────
  const recalculateRoute = useCallback(
    async (customStops?: RouteStop[]) => {
      const stopsToUse = customStops || routeStops;
      const remainingStops = stopsToUse.filter((s) => s.status !== 'completed');
      if (remainingStops.length === 0) {
        setRoute(null);
        setRouteInfo(null);
        return;
      }

      try {
        const userCoords: LngLat | null =
          currentLocation || (remainingStops[0] ? [remainingStops[0].longitude, remainingStops[0].latitude] : null);

        if (!userCoords) return;

        const waypoints: LngLat[] = [
          userCoords,
          ...remainingStops.map((s) => [s.longitude, s.latitude] as LngLat),
        ];

        const result = await RoutingService.route(waypoints, {
          costing: costingMode,
          heading: currentHeadingRef.current,
        });

        const baseDelaySeconds = 10 * 60;
        const perStopServiceSeconds = 7 * 60;
        const totalEstimatedDuration =
          result.duration + baseDelaySeconds + remainingStops.length * perStopServiceSeconds;

        setRoute(result.geojson);
        setRouteInfo({ distance: result.distance, duration: totalEstimatedDuration });
      } catch (e) {
        console.warn('[Map] recalculateRoute error', e);
      }
    },
    [
      routeStops,
      currentLocation,
      costingMode,
      currentHeadingRef,
    ],
  );

  // ─── Ações de Parada ──────────────────────────────────────────────────────
  const selectStop = useCallback(
    (stop: RouteStop) => {
      setActiveStop(stop);
      cameraRef.current?.setStop({
        center: [stop.longitude, stop.latitude],
        zoom: 18.5,
        duration: 600,
      });
    },
    [cameraRef],
  );

  const completeStop = useCallback(
    (stop: RouteStop, receiverNote?: string) => {
      stop.deliveries.forEach((d) => {
        const finalNotes = receiverNote
          ? d.notes
            ? `${d.notes} | Recebedor: ${receiverNote}`
            : `Recebedor: ${receiverNote}`
          : undefined;
        DatabaseService.updateDeliveryStatus(d.id, 'completed', {
          deliveredAt: Date.now(),
          notes: finalNotes,
        });
        // Salva endereço e coordenadas confirmadas no histórico permanente do app
        const addr = d.destination || d.address || stop.address;
        const lat = d.latitude ?? stop.latitude;
        const lng = d.longitude ?? stop.longitude;
        if (addr && lat && lng && !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
          DatabaseService.saveAddressHistory({
            address: addr,
            bairro: d.bairro || stop.bairro,
            city: d.city || stop.city,
            zipCode: d.zipCode,
            latitude: lat,
            longitude: lng,
            source: 'completed',
          });
        }
      });
      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);
      const completed = new Set(
        reloaded.filter((d) => d.status === 'completed').map((d) => d.id),
      );
      setCompletedIds(completed);
      setActiveStop(null);

      // Reotimiza instantaneamente a rota no mapa para as paradas restantes
      const updatedLocated = reloaded.filter((d) => d.latitude !== null && d.longitude !== null);
      const updatedStops = groupDeliveriesIntoStops(updatedLocated);
      recalculateRoute(updatedStops);

      // Abre imediatamente o modal gerador de documentos na tela
      onStopCompleted?.();
    },
    [recalculateRoute, onStopCompleted],
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

  const deleteStop = useCallback(
    (stop: RouteStop) => {
      stop.deliveries.forEach((d) => {
        DatabaseService.deleteDelivery(d.id);
      });
      reloadDeliveries();
    },
    [reloadDeliveries],
  );

  const updateStopCoordinates = useCallback(
    (stop: RouteStop, newLat: number, newLng: number) => {
      // 1. Atualiza no SQLite e grava no histórico permanente de endereços
      stop.deliveries.forEach((d) => {
        DatabaseService.updateDeliveryCoords(d.id, newLat, newLng);
        const addr = d.destination || d.address || stop.address;
        if (addr) {
          DatabaseService.saveAddressHistory({
            address: addr,
            bairro: d.bairro || stop.bairro,
            city: d.city || stop.city,
            zipCode: d.zipCode,
            latitude: newLat,
            longitude: newLng,
            source: 'manual',
          });
        }
      });

      // 2. Atualiza imediatamente o estado de entregas na memória
      const stopIds = new Set(stop.deliveries.map((d) => d.id));
      setDeliveries((prev) =>
        prev.map((d) =>
          stopIds.has(d.id)
            ? {
                ...d,
                latitude: newLat,
                longitude: newLng,
                snappedLatitude: undefined,
                snappedLongitude: undefined,
              }
            : d,
        ),
      );

      // 3. Recarrega do banco e recalcula o itinerário da rota
      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);
      setActiveStop(null);

      // 4. Move a câmera suavemente para a nova posição do pino
      cameraRef.current?.setStop({
        center: [newLng, newLat],
        zoom: 16,
        duration: 500,
      });

      recalculateRoute();
    },
    [cameraRef, recalculateRoute],
  );

  const revertStopCoordinates = useCallback(
    (stop: RouteStop) => {
      let restoredLat: number | null = null;
      let restoredLng: number | null = null;

      stop.deliveries.forEach((d) => {
        const res = DatabaseService.restoreDeliveryOriginalCoords(d.id);
        if (res) {
          restoredLat = res.latitude;
          restoredLng = res.longitude;
        }
        // Remove do histórico de endereços memorizados
        const addr = d.destination || d.address || stop.address;
        if (addr) {
          DatabaseService.removeAddressHistory({
            address: addr,
            bairro: d.bairro || stop.bairro,
            city: d.city || stop.city,
            zipCode: d.zipCode,
          });
        }
      });

      // Recarrega do banco e atualiza na memória
      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);
      setActiveStop(null);

      if (restoredLat !== null && restoredLng !== null) {
        cameraRef.current?.setStop({
          center: [restoredLng, restoredLat],
          zoom: 16,
          duration: 500,
        });
      }

      recalculateRoute();
    },
    [cameraRef, recalculateRoute],
  );

  const moveStopToTop = useCallback(
    (stop: RouteStop) => {
      const completedStops = routeStops.filter((s) => s.status === 'completed');
      const pendingStops = routeStops.filter((s) => s.status !== 'completed' && s.key !== stop.key);
      const newOrder = [...completedStops, stop, ...pendingStops];

      let seq = 1;
      newOrder.forEach((st) => {
        st.deliveries.forEach((d) => {
          DatabaseService.updateDeliverySequence(d.id, seq++);
        });
      });

      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);
      recalculateRoute();
    },
    [routeStops, recalculateRoute],
  );

  const moveStopToEnd = useCallback(
    (stop: RouteStop) => {
      const completedStops = routeStops.filter((s) => s.status === 'completed');
      const pendingStops = routeStops.filter((s) => s.status !== 'completed' && s.key !== stop.key);
      const newOrder = [...completedStops, ...pendingStops, stop];

      let seq = 1;
      newOrder.forEach((st) => {
        st.deliveries.forEach((d) => {
          DatabaseService.updateDeliverySequence(d.id, seq++);
        });
      });

      const active = DatabaseService.getActiveList();
      const reloaded = DatabaseService.getAllDeliveries(active?.id);
      setDeliveries(reloaded);
      recalculateRoute();
    },
    [routeStops, recalculateRoute],
  );

  const clearAllDeliveries = useCallback(() => {
    DatabaseService.clearDeliveries();
    setDeliveries([]);
    setOrder([]);
    setRoute(null);
    setRouteInfo(null);
    setCompletedIds(new Set());
    setRouteNeedsOptimization(false);
  }, []);

  return {
    deliveries,
    setDeliveries,
    order,
    setOrder,
    route,
    setRoute,
    routeInfo,
    setRouteInfo,
    optimizing,
    setOptimizing,
    routeNeedsOptimization,
    setRouteNeedsOptimization,
    activeStop,
    setActiveStop,
    completedIds,
    searchQuery,
    setSearchQuery,
    locatedDeliveries,
    orderedDeliveries,
    routeStops,
    filteredOrderedDeliveries,
    filteredStops,
    nextStop,
    stopTimes,
    totalStopsCount,
    totalPackagesCount,
    unlocatedCount,
    optimizationSummary,
    setOptimizationSummary,
    reloadDeliveries,
    fitRoute,
    optimizeRoute,
    recalculateRoute,
    selectStop,
    completeStop,
    skipStop,
    deleteStop,
    updateStopCoordinates,
    revertStopCoordinates,
    moveStopToTop,
    moveStopToEnd,
    clearAllDeliveries,
  };
}
