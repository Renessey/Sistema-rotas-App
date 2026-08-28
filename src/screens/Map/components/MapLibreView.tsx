import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import {
  Map as MapLibreMap,
  MapRef,
  Camera,
  CameraRef,
  GeoJSONSource,
  Layer,
  Marker,
} from '@maplibre/maplibre-react-native';
import { CustomMarkerPin } from '../../../components/Map/CustomMarkerPin';
import type {
  GeoJSONFeatureCollection,
  LngLat,
  RouteStop,
} from '../../../types/geo';

interface MapLibreViewProps {
  mapRef: React.RefObject<MapRef | null>;
  cameraRef: React.RefObject<CameraRef | null>;
  currentStyleUrl: string;
  styles: any;
  followGPS: boolean;
  setFollowGPS: (follow: boolean) => void;
  setZoom: (zoom: number) => void;
  route: GeoJSONFeatureCollection | null;
  geoLassoLoops: Array<Array<LngLat>>;
  currentLocation: LngLat | null;
  routeStops: RouteStop[];
  hideCompleted: boolean;
  nextStop: RouteStop | null;
  activeStop: RouteStop | null;
  lassoSelectedStopKeys: Set<string>;
  selectStop: (stop: RouteStop) => void;
}

export function MapLibreView({
  mapRef,
  cameraRef,
  currentStyleUrl,
  styles,
  followGPS,
  setFollowGPS,
  setZoom,
  route,
  geoLassoLoops,
  currentLocation,
  routeStops,
  hideCompleted,
  nextStop,
  activeStop,
  lassoSelectedStopKeys,
  selectStop,
}: MapLibreViewProps) {
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
    [routeStops, hideCompleted, nextStop, activeStop, lassoSelectedStopKeys, selectStop],
  );

  return (
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
  );
}
