import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CameraRef, MapRef } from '@maplibre/maplibre-react-native';
import type { RootStackParamList } from '../../navigation';
import { useTheme } from '../../theme/ThemeContext';
import { createScreenStyles } from './MapScreenStyles';
import { FloatingMapControls } from '../../components/Map/FloatingMapControls';

// ─── Camada de Utilitários ───────────────────────────────────────────────────
import { formatDistance, formatDuration } from './utils/mapUtils';

// ─── Camada de Lógica / Hooks ("Backend") ────────────────────────────────────
import {
  useMapLocation,
  useMapPreferences,
  useMapDeliveries,
  useMapLasso,
  useMapBottomSheet,
  useMapModals,
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
} from './components';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

export default function MapScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createScreenStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef | null>(null); 

  // 1. Gerenciamento de GPS & Localização
  const {
    currentLocation,
    setCurrentLocation,
    setHasGpsFix,
    followGPS,
    setFollowGPS,
    setZoom,
    diagStatus,
    currentHeadingRef,
    centerOnUser,
  } = useMapLocation(cameraRef);

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

  // 6. Gerenciador de Modais
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
    showConfigModal,
    setShowConfigModal,
    showAdjustPinModal,
    adjustingStop,
    openAdjustPin,
    closeAdjustPin,
    showOfflineModal,
    setShowOfflineModal,
  } = useMapModals();

  // 7. Seletor Manual de Área Offline sobre o Mapa
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
        route={route}
        geoLassoLoops={geoLassoLoops}
        currentLocation={currentLocation}
        routeStops={routeStops}
        hideCompleted={hideCompleted}
        nextStop={nextStop}
        activeStop={activeStop}
        lassoSelectedStopKeys={lassoSelectedStopKeys}
        selectStop={selectStop}
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
        onCenterGps={() => centerOnUser(16)}
        onAddStop={() => setShowAddModal(true)}
        onNavigateImport={() => navigation.navigate('Import')}
        onNavigateDeliveries={() => navigation.navigate('Deliveries')}
        formatDistance={formatDistance}
        formatDuration={formatDuration}
      />

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
