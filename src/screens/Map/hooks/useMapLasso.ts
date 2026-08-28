import { useState, useRef, useCallback, useMemo } from 'react';
import { Alert, PanResponder } from 'react-native';
import type { MapRef } from '@maplibre/maplibre-react-native';
import { LocationService } from '../../../services/gps/LocationService';
import { RouteOptimizationService } from '../../../services/routing/RouteOptimizationService';
import { RoutingService } from '../../../services/routing/RoutingService';
import { DatabaseService } from '../../../storage/DatabaseService';
import { pointInPolygon } from '../utils/mapUtils';
import type { LassoCanvasRef } from '../../../components/Map/LassoCanvas';
import type {
  DeliveryEntity,
  GeoJSONFeatureCollection,
  LngLat,
  Costing,
  RouteStop,
} from '../../../types/geo';

interface UseMapLassoProps {
  mapRef: React.RefObject<MapRef | null>;
  routeStops: RouteStop[];
  currentLocation: LngLat | null;
  setCurrentLocation: (loc: LngLat) => void;
  setHasGpsFix: (fix: boolean) => void;
  costingMode: Costing;
  currentHeadingRef: React.MutableRefObject<number | null>;
  fitRoute: () => void;
  setDeliveries: (dels: DeliveryEntity[]) => void;
  setRoute: (route: GeoJSONFeatureCollection | null) => void;
  setRouteInfo: (info: { distance: number; duration: number } | null) => void;
  setRouteNeedsOptimization: (needs: boolean) => void;
  setOptimizing: (opt: boolean) => void;
}

export function useMapLasso({
  mapRef,
  routeStops,
  currentLocation,
  setCurrentLocation,
  setHasGpsFix,
  costingMode,
  currentHeadingRef,
  fitRoute,
  setDeliveries,
  setRoute,
  setRouteInfo,
  setRouteNeedsOptimization,
  setOptimizing,
}: UseMapLassoProps) {
  const [lassoMode, setLassoMode] = useState(false);
  const [lassoSubMode, setLassoSubMode] = useState<'draw' | 'pan'>('draw');
  const [geoLassoLoops, setGeoLassoLoops] = useState<Array<Array<LngLat>>>([]);
  const [lassoLoops, setLassoLoops] = useState<Array<Array<[number, number]>>>([]);
  const [lassoSelectedStopKeys, setLassoSelectedStopKeys] = useState<Set<string>>(new Set());
  const lassoCanvasRef = useRef<LassoCanvasRef>(null);

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
    currentHeadingRef,
    fitRoute,
    handleCancelLasso,
    setCurrentLocation,
    setHasGpsFix,
    setDeliveries,
    setRoute,
    setRouteInfo,
    setRouteNeedsOptimization,
    setOptimizing,
  ]);

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
          lassoCanvasRef.current?.beginStroke(locationX, locationY);
        },
        onPanResponderMove: (e) => {
          if (e.nativeEvent.touches && e.nativeEvent.touches.length > 1) {
            lassoCanvasRef.current?.clearStroke();
            return;
          }
          const { locationX, locationY } = e.nativeEvent;
          lassoCanvasRef.current?.addPoint(locationX, locationY);
        },
        onPanResponderRelease: async () => {
          const stroke = lassoCanvasRef.current?.getPoints() ?? [];
          lassoCanvasRef.current?.clearStroke();

          if (stroke.length < 4) return;

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
    [lassoMode, computeEnclosedStopsFromGeo, mapRef],
  );

  return {
    lassoMode,
    lassoSubMode,
    setLassoSubMode,
    geoLassoLoops,
    lassoLoops,
    lassoSelectedStopKeys,
    lassoCanvasRef,
    lassoPanResponder,
    computeEnclosedStopsFromGeo,
    handleCancelLasso,
    handleUndoLasso,
    handleToggleLasso,
    handleConfirmLasso,
  };
}
