import React, { useMemo, useRef } from 'react';
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
  PersistentFloatingBar,
  StopDetailSheet,
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
    reloadDeliveries,
    fitRoute,
    optimizeRoute,
    recalculateRoute,
    selectStop,
    completeStop,
    skipStop,
    deleteStop,
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
  } = useMapModals();

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

      {/* ── 3. Barra Flutuante de Otimizar / Finalizar ── */}
      {!lassoMode && (
        <PersistentFloatingBar
          sheetTranslateY={sheetTranslateY}
          snapExpandedBottom={snapExpanded}
          routeNeedsOptimization={routeNeedsOptimization}
          optimizing={optimizing}
          onOptimize={() => optimizeRoute()}
        />
      )}

      {/* ── 4. Controles Flutuantes da Direita ── */}
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
          hasRoute={!!route}
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
        />
      </Animated.View>

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
        />
      )}

      {/* ── 7. Modais e Overlay de Carregamento ── */}
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
        onClearAllDeliveries={clearAllDeliveries}
        optimizing={optimizing}
      />
    </View>
  );
}
