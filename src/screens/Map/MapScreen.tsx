import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CameraRef, MapRef } from '@maplibre/maplibre-react-native';
import type { RootStackParamList } from '../../navigation';
import type { GeoJSONFeatureCollection, LngLat } from '../../types/geo';
import { useTheme } from '../../theme/ThemeContext';
import { createScreenStyles } from './MapScreenStyles';
import { FloatingMapControls } from '../../components/Map/FloatingMapControls';

// ─── Camada de Utilitários ───────────────────────────────────────────────────
import { formatDistance, formatDuration } from './utils/mapUtils';

// ─── Camada de Lógica / Hooks ("Backend") ────────────────────────────────────
import {
  useMapLocation,
  getRouteBearing,
  useMapPreferences,
  useMapDeliveries,
  useMapLasso,
  useMapBottomSheet,
  useMapModals,
  useSmoothLocation,
} from './hooks';

// ─── Camada Visual / Componentes ("Frontend") ────────────────────────────────
import {
  MapLibreView,
  MapModalsContainer,
  MapBottomSheet,
  LassoOverlay,
  StopDetailSheet,
  AdjustPinModal,
  NextStopHUD,
  OfflineAreaSelectorOverlay,
  TurnByTurnNavigationOverlay,
} from './components';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

function fastDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * 111139;
  const avgLat = ((lat1 + lat2) * Math.PI) / 360;
  const dLon = (lon2 - lon1) * 111139 * Math.cos(avgLat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export default function MapScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createScreenStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef | null>(null);

  // Estado do Modo de Navegação Passo a Passo (3D Driving Mode)
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationOrientation, setNavigationOrientation] = useState<'course' | 'north'>('course');

  // Gerenciador de Modais
  const {
    showLayersModal,
    setShowLayersModal,
    showAddModal,
    setShowAddModal,
    showMenuModal,
    setShowMenuModal,
    showListsModal,
    setShowListsModal,
    showQuickActionsModal,
    setShowQuickActionsModal,
    showQuickRgModal,
    setShowQuickRgModal,
    showStopActionsModal,
    setShowStopActionsModal,
    selectedStopForActions,
    setSelectedStopForActions,
    openStopActions,
    closeStopActions,
    showConfigModal,
    setShowConfigModal,
    showAdjustPinModal,
    adjustingStop,
    openAdjustPin,
    closeAdjustPin,
    showOfflineModal,
    setShowOfflineModal,
  } = useMapModals();

  const routeRef = useRef<GeoJSONFeatureCollection | null>(null);

  // 1. Gerenciamento de GPS & Localização
  const {
    currentLocation,
    setCurrentLocation,
    setHasGpsFix,
    followGPS,
    setFollowGPS,
    setZoom,
    diagStatus,
    heading,
    setHeading,
    currentHeadingRef,
    centerOnUser,
  } = useMapLocation(cameraRef, isNavigating, navigationOrientation, routeRef);

  // Interpolação suave a 60 FPS (elimina "pingando" e alinha bússola/seta)
  const cameraBearing = navigationOrientation === 'north' ? 0 : heading;
  const {
    smoothLocation,
    smoothHeading,
    markerRotation,
  } = useSmoothLocation({
    rawLocation: currentLocation,
    rawHeading: heading,
    cameraBearing,
    isNavigating,
    navigationOrientation,
  });

  // 2. Preferências do Mapa & Combustível
  const {
    mapType,
    mapTheme,
    hideCompleted,
    costingMode,
    currentStyleUrl,
    updateMapType,
    updateMapTheme,
    updateHideCompleted,
    updateCostingMode,
    showFuelHUD,
    setShowFuelHUD,
    fuelConfig,
    setFuelConfig,
    isOfflineMode,
    updateOfflineMode,
  } = useMapPreferences();

  // 3. Entregas, Paradas, Otimização e Rotas
  const {
    deliveries,
    setDeliveries,
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
    routeStops,
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
  } = useMapDeliveries({
    cameraRef,
    costingMode,
    currentLocation,
    setCurrentLocation,
    setHasGpsFix,
    currentHeadingRef,
    onStopCompleted: () => setShowQuickRgModal(true),
  });

  // 4. Multi-Lasso Tool (Seleção geométrica livre)
  const {
    lassoMode,
    lassoSubMode,
    setLassoSubMode,
    geoLassoLoops,
    lassoSelectedStopKeys,
    lassoCanvasRef,
    lassoPanResponder,
    handleCancelLasso,
    handleUndoLasso,
    handleToggleLasso,
    handleConfirmLasso,
  } = useMapLasso({
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
  });

  // 5. Bottom Sheet Animado
  const {
    sheetTranslateY,
    sheetState,
    snapExpanded,
    transExpanded,
    transHalf,
    transCollapsed,
    panResponder,
    handleToggleSnap,
  } = useMapBottomSheet();

  // 6. Seletor Manual de Área Offline sobre o Mapa
  const [showOfflineSelector, setShowOfflineSelector] = useState(false);
  const [pendingOfflineDownload, setPendingOfflineDownload] = useState<{
    name: string;
    bounds: [number, number, number, number];
  } | null>(null);

  // Distância efetiva da rota (turn-by-turn do Mapbox ou aproximada entre paradas)
  const effectiveRouteDistanceM = useMemo(() => {
    if (routeInfo?.distance && routeInfo.distance > 0) return routeInfo.distance;
    if (routeStops.length >= 2) {
      let total = 0;
      for (let i = 0; i < routeStops.length - 1; i++) {
        const p1 = routeStops[i];
        const p2 = routeStops[i + 1];
        const dx = (p2.longitude - p1.longitude) * 111320 * Math.cos((p1.latitude * Math.PI) / 180);
        const dy = (p2.latitude - p1.latitude) * 110540;
        total += Math.sqrt(dx * dx + dy * dy);
      }
      return total * 1.35; // Fator de malha viária
    }
    return 0;
  }, [routeInfo, routeStops]);

  // Iniciar Navegação Passo a Passo (3D Driving Mode com Zoom de Rua e Rotação de frente para a polyline)
  const startNavigation = React.useCallback(() => {
    setIsNavigating(true);
    setFollowGPS(true);
    setNavigationOrientation('course');
    const target = smoothLocation || currentLocation || (nextStop ? [nextStop.longitude, nextStop.latitude] : undefined);
    if (target) {
      const activeR = route;
      const routeCoords = (activeR?.features?.[0]?.geometry?.coordinates as LngLat[]) || [];
      const initialBearing = routeCoords.length >= 2
        ? (getRouteBearing(target, routeCoords, 22) ?? 0)
        : (currentHeadingRef.current || 0);

      currentHeadingRef.current = initialBearing;
      setHeading(initialBearing);

      cameraRef.current?.setStop({
        center: target,
        zoom: 18.5, // Foco aproximado de rua
        pitch: 55,  // Inclinação 3D de direção para frente
        bearing: initialBearing,
        duration: 800,
      });
    }
  }, [smoothLocation, currentLocation, nextStop, setFollowGPS, route, currentHeadingRef, setHeading]);

  const exitNavigation = React.useCallback(() => {
    setIsNavigating(false);
    cameraRef.current?.setStop({
      pitch: 0,
      zoom: 18.5,
      bearing: 0,
      duration: 600,
    });
  }, []);

  // Alternar Bússola: Norte para Cima (bearing: 0) vs Seguir Curso da Polyline (bearing: routeBearing)
  const toggleNavigationOrientation = React.useCallback(() => {
    const nextMode = navigationOrientation === 'course' ? 'north' : 'course';
    setNavigationOrientation(nextMode);
    const target = smoothLocation || currentLocation || (nextStop ? [nextStop.longitude, nextStop.latitude] : undefined);
    if (target) {
      const activeR = route;
      const routeCoords = (activeR?.features?.[0]?.geometry?.coordinates as LngLat[]) || [];
      const rBearing = routeCoords.length >= 2
        ? (getRouteBearing(target, routeCoords, 22) ?? currentHeadingRef.current ?? 0)
        : (currentHeadingRef.current || 0);

      cameraRef.current?.setStop({
        center: target,
        zoom: 18.5,
        pitch: nextMode === 'north' ? 0 : 55,
        bearing: nextMode === 'north' ? 0 : rBearing,
        duration: 500,
      });
    }
  }, [navigationOrientation, smoothLocation, currentLocation, nextStop, route, currentHeadingRef]);

  const recenterNavigation = React.useCallback(() => {
    setFollowGPS(true);
    const target = smoothLocation || currentLocation || (nextStop ? [nextStop.longitude, nextStop.latitude] : undefined);
    if (target) {
      const activeR = route;
      const routeCoords = (activeR?.features?.[0]?.geometry?.coordinates as LngLat[]) || [];
      const rBearing = routeCoords.length >= 2
        ? (getRouteBearing(target, routeCoords, 22) ?? currentHeadingRef.current ?? 0)
        : (currentHeadingRef.current || 0);

      currentHeadingRef.current = rBearing;
      setHeading(rBearing);

      cameraRef.current?.setStop({
        center: target,
        zoom: 18.5,
        pitch: 55,
        bearing: navigationOrientation === 'north' ? 0 : rBearing,
        duration: 600,
      });
    }
  }, [smoothLocation, currentLocation, nextStop, setFollowGPS, navigationOrientation, route, currentHeadingRef, setHeading]);

  // ─── Polyline Dinâmica em Navegação ───
  // Corta a polyline para começar na posição GPS exata do veículo enquanto ele anda na rota
  const dynamicRoute = useMemo<GeoJSONFeatureCollection | null>(() => {
    if (!route || !isNavigating || !currentLocation) return route;
    const coords = (route.features?.[0]?.geometry?.coordinates as LngLat[]) || [];
    if (coords.length < 2) return route;

    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = fastDistance(currentLocation[0], currentLocation[1], coords[i][0], coords[i][1]);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    }

    // Se estiver a menos de 40 metros da rota, conecta o GPS aos pontos futuros da polyline
    if (minDist <= 40) {
      const remainingCoords = coords.slice(closestIdx + 1);
      const sliced = [currentLocation, ...remainingCoords];
      if (sliced.length >= 2) {
        return {
          type: 'FeatureCollection',
          features: [
            {
              ...route.features[0],
              geometry: {
                type: 'LineString',
                coordinates: sliced,
              },
            },
          ],
        };
      }
    }

    return route;
  }, [route, isNavigating, currentLocation]);

  // Sincroniza a referência da rota para o hook useMapLocation orientar a câmera pela polyline
  routeRef.current = dynamicRoute || route;

  // ─── Recálculo Silencioso e Instantâneo se Sair da Rota ───
  const lastRerouteTimeRef = useRef(0);
  useEffect(() => {
    if (!isNavigating || !currentLocation || !route) return;
    const coords = (route.features?.[0]?.geometry?.coordinates as LngLat[]) || [];
    if (coords.length < 2) return;

    let minDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = fastDistance(currentLocation[0], currentLocation[1], coords[i][0], coords[i][1]);
      if (d < minDist) {
        minDist = d;
      }
    }

    // Se o motorista entrou em outra rua (> 45m de distância da polyline atual)
    if (minDist > 45) {
      const now = Date.now();
      if (now - lastRerouteTimeRef.current > 2500) {
        lastRerouteTimeRef.current = now;
        // Recálculo silencioso e instantâneo em segundo plano
        recalculateRoute();
      }
    }
  }, [isNavigating, currentLocation, route, recalculateRoute]);

  // Bounding-box atual derivada das paradas carregadas (usada pelo OfflineModal)
  const currentMapBounds = useMemo<[number, number, number, number] | undefined>(() => {
    const located = routeStops.filter((s) => s.latitude && s.longitude);
    if (located.length === 0) {
      // Fallback: usa localização atual ±0.05 graus (~5km)
      if (currentLocation) {
        const lng = currentLocation[0];
        const lat = currentLocation[1];
        return [lng - 0.05, lat - 0.05, lng + 0.05, lat + 0.05];
      }
      return undefined;
    }
    const lats = located.map((s) => s.latitude!);
    const lngs = located.map((s) => s.longitude!);
    const pad = 0.01;
    return [
      Math.min(...lngs) - pad,
      Math.min(...lats) - pad,
      Math.max(...lngs) + pad,
      Math.max(...lats) + pad,
    ];
  }, [routeStops, currentLocation]);

  return (
    <View style={styles.container}>
      {/* ── 1. Background MapLibre Canvas ── */}
      <MapLibreView
        mapRef={mapRef}
        cameraRef={cameraRef}
        currentStyleUrl={currentStyleUrl}
        styles={styles}
        followGPS={followGPS}
        setFollowGPS={setFollowGPS}
        setZoom={setZoom}
        route={dynamicRoute}
        geoLassoLoops={geoLassoLoops}
        currentLocation={smoothLocation || currentLocation}
        routeStops={routeStops}
        hideCompleted={hideCompleted}
        nextStop={nextStop}
        activeStop={activeStop}
        lassoSelectedStopKeys={lassoSelectedStopKeys}
        selectStop={selectStop}
        isNavigating={isNavigating}
        currentHeading={markerRotation}
      />

      {/* ── 2. Multi-Lasso Overlay ── */}
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

      {/* ── MODO DE NAVEGAÇÃO ATIVA (Foto 2) ── */}
      {isNavigating ? (
        <TurnByTurnNavigationOverlay
          nextStop={nextStop}
          routeDistanceM={effectiveRouteDistanceM}
          routeDurationS={routeInfo?.duration || 720}
          currentLocation={smoothLocation || currentLocation}
          route={dynamicRoute}
          orientationMode={navigationOrientation}
          currentHeading={smoothHeading}
          onToggleOrientation={toggleNavigationOrientation}
          onExitNavigation={exitNavigation}
          onRecenter={recenterNavigation}
          onFitRouteOverview={fitRoute}
        />
      ) : (
        <>
          {/* ── 2.1 Next Stop Quick HUD ── */}
          {!lassoMode && !showOfflineSelector && nextStop && (
            <NextStopHUD
              nextStop={nextStop}
              sheetTranslateY={sheetTranslateY}
              transExpanded={transExpanded}
              transHalf={transHalf}
              transCollapsed={transCollapsed}
              onSelectStop={selectStop}
              onCompleteStop={completeStop}
            />
          )}

          {/* ── 2.2 Seletor Manual de Área Offline sobre o Mapa ── */}
          {showOfflineSelector && (
            <OfflineAreaSelectorOverlay
              visible={showOfflineSelector}
              mapRef={mapRef}
              currentLocation={currentLocation}
              onCenterUser={() => {
                if (currentLocation) {
                  centerOnUser(14);
                }
              }}
              onCancel={() => {
                setShowOfflineSelector(false);
                setShowOfflineModal(true);
              }}
              onConfirmArea={(name, bounds) => {
                setPendingOfflineDownload({ name, bounds });
                setShowOfflineSelector(false);
                setShowOfflineModal(true);
              }}
            />
          )}

          {/* ── 3. Controles Flutuantes da Direita ── */}
          {!showOfflineSelector && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: sheetTranslateY.interpolate({
                    inputRange: [transExpanded, transHalf, transCollapsed],
                    outputRange: [0, 0.2, 1],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      translateX: sheetTranslateY.interpolate({
                        inputRange: [transExpanded, transHalf, transCollapsed],
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
                hasRoute={!!route || routeStops.length > 0}
                lassoMode={lassoMode}
                diagStatus={diagStatus}
                onOpenLayers={() => setShowLayersModal(true)}
                onFitBounds={fitRoute}
                onToggleFollowGPS={() => {
                  const next = !followGPS;
                  setFollowGPS(next);
                  if (currentLocation) {
                    centerOnUser(15);
                  }
                }}
                onToggleLasso={handleToggleLasso}
                showFuelHUD={showFuelHUD}
                onCloseFuelHUD={() => setShowFuelHUD(false)}
                fuelConfig={fuelConfig}
                routeDistanceM={effectiveRouteDistanceM}
                onPressFuelMetrics={() => setShowConfigModal(true)}
              />
            </Animated.View>
          )}

          {/* ── 5. Gaveta Inferior (Bottom Sheet) ── */}
          <MapBottomSheet
            sheetTranslateY={sheetTranslateY}
            snapExpanded={snapExpanded}
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
            unlocatedCount={unlocatedCount}
            routeInfo={routeInfo}
            optimizing={optimizing}
            routeNeedsOptimization={routeNeedsOptimization}
            currentLocation={currentLocation}
            onOpenMenu={() => setShowMenuModal(true)}
            onOpenQuickActions={() => setShowConfigModal(true)}
            onSelectStop={selectStop}
            onLongPressStop={openStopActions}
            onOptimize={(origin) => optimizeRoute(origin)}
            onStartNavigation={startNavigation}
            onCenterGps={() => centerOnUser(18.5)}
            onAddStop={() => setShowAddModal(true)}
            onNavigateImport={() => navigation.navigate('Import')}
            onNavigateDeliveries={() => navigation.navigate('Deliveries')}
            formatDistance={formatDistance}
            formatDuration={formatDuration}
          />
        </>
      )}

      {/* ── 6. Gaveta de Detalhes da Parada Selecionada ── */}
      {activeStop && (
        <StopDetailSheet
          activeStop={activeStop}
          onClose={() => setActiveStop(null)}
          onComplete={completeStop}
          onSkip={skipStop}
          onOpenAdjustPin={openAdjustPin}
        />
      )}

      {/* ── 7. Modal Comparativo e Ajuste de Pino ── */}
      <AdjustPinModal
        visible={showAdjustPinModal}
        stop={adjustingStop}
        currentStyleUrl={currentStyleUrl}
        onClose={closeAdjustPin}
        onSave={updateStopCoordinates}
        onRevert={revertStopCoordinates}
      />

      {/* ── 8. Modais e Overlay de Carregamento ── */}
      <MapModalsContainer
        styles={styles}
        navigation={navigation}
        showLayersModal={showLayersModal}
        setShowLayersModal={setShowLayersModal}
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        showMenuModal={showMenuModal}
        setShowMenuModal={setShowMenuModal}
        showListsModal={showListsModal}
        setShowListsModal={setShowListsModal}
        showQuickActionsModal={showQuickActionsModal}
        setShowQuickActionsModal={setShowQuickActionsModal}
        showQuickRgModal={showQuickRgModal}
        setShowQuickRgModal={setShowQuickRgModal}
        showStopActionsModal={showStopActionsModal}
        setShowStopActionsModal={setShowStopActionsModal}
        selectedStopForActions={selectedStopForActions}
        setSelectedStopForActions={setSelectedStopForActions}
        showConfigModal={showConfigModal}
        setShowConfigModal={setShowConfigModal}
        showFuelHUD={showFuelHUD}
        setShowFuelHUD={setShowFuelHUD}
        mapType={mapType}
        mapTheme={mapTheme}
        hideCompleted={hideCompleted}
        costingMode={costingMode}
        onSelectType={updateMapType}
        onSelectTheme={updateMapTheme}
        onToggleHideCompleted={updateHideCompleted}
        onSelectCostingMode={async (cm) => {
          await updateCostingMode(cm);
          if (route) recalculateRoute();
        }}
        fuelConfig={fuelConfig}
        setFuelConfig={setFuelConfig}
        routeInfo={routeInfo}
        deliveriesCount={deliveries.length}
        currentLocation={currentLocation}
        onOptimize={optimizeRoute}
        onFitRoute={fitRoute}
        onReloadDeliveries={reloadDeliveries}
        onDeleteStop={deleteStop}
        onMoveStopToTop={moveStopToTop}
        onMoveStopToEnd={moveStopToEnd}
        onClearAllDeliveries={clearAllDeliveries}
        optimizing={optimizing}
        showOfflineModal={showOfflineModal}
        setShowOfflineModal={setShowOfflineModal}
        currentStyleUrl={currentStyleUrl}
        currentMapBounds={currentMapBounds}
        onRequestSelectAreaOnMap={() => {
          setShowOfflineModal(false);
          setShowOfflineSelector(true);
        }}
        pendingDownload={pendingOfflineDownload}
        onClearPendingDownload={() => setPendingOfflineDownload(null)}
        isOfflineMode={isOfflineMode}
        onToggleOfflineMode={updateOfflineMode}
        optimizationSummary={optimizationSummary}
        onCloseOptimizationSummary={() => setOptimizationSummary(null)}
      />
    </View>
  );
}
