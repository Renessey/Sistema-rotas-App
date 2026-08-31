import React from 'react';
import { View, Text, Alert, ActivityIndicator } from 'react-native';
import { MapDisplayModal } from '../../../components/Map/MapDisplayModal';
import { AddDeliveryModal } from '../../../components/AddDeliveryModal';
import { SideMenuModal } from '../../../components/Map/SideMenuModal';
import { ConfigModal } from '../../../components/Map/ConfigModal';
import { QuickActionsMenuModal } from '../../../components/Map/QuickActionsMenuModal';
import { QuickRgModal } from '../../../components/Map/QuickRgModal';
import { StopActionsModal } from '../../../components/Map/StopActionsModal';
import { DeliveryListsModal } from '../../../components/Deliveries/DeliveryListsModal';
import { OfflineModal } from '../../../components/Map/OfflineModal';
import type { MapType, MapTheme } from '../../../config/mapStyles';
import type { Costing, RouteStop, LngLat } from '../../../types/geo';

interface MapModalsContainerProps {
  styles: any;
  navigation: any;
  // Modals visibility
  showLayersModal: boolean;
  setShowLayersModal: (show: boolean) => void;
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
  showMenuModal: boolean;
  setShowMenuModal: (show: boolean) => void;
  showListsModal: boolean;
  setShowListsModal: (show: boolean) => void;
  showQuickActionsModal: boolean;
  setShowQuickActionsModal: (show: boolean) => void;
  showQuickRgModal: boolean;
  setShowQuickRgModal: (show: boolean) => void;
  showStopActionsModal: boolean;
  setShowStopActionsModal: (show: boolean) => void;
  selectedStopForActions: RouteStop | null;
  setSelectedStopForActions: (stop: RouteStop | null) => void;
  showConfigModal: boolean;
  setShowConfigModal: (show: boolean) => void;
  showFuelHUD: boolean;
  setShowFuelHUD: (show: boolean) => void;
  // Map preferences
  mapType: MapType;
  mapTheme: MapTheme;
  hideCompleted: boolean;
  costingMode: Costing;
  onSelectType: (type: MapType) => void;
  onSelectTheme: (theme: MapTheme) => void;
  onToggleHideCompleted: (hide: boolean) => void;
  onSelectCostingMode: (costing: Costing) => void;
  // Fuel config
  fuelConfig: { kmPerLiter: number; pricePerLiter: number };
  setFuelConfig: (cfg: { kmPerLiter: number; pricePerLiter: number }) => void;
  // Route / stops info
  routeInfo: { distance: number; duration: number } | null;
  deliveriesCount: number;
  currentLocation: LngLat | null;
  // Actions
  onOptimize: (origin?: LngLat) => void;
  onFitRoute: () => void;
  onReloadDeliveries: () => void;
  onDeleteStop: (stop: RouteStop) => void;
  onMoveStopToTop?: (stop: RouteStop) => void;
  onMoveStopToEnd?: (stop: RouteStop) => void;
  onClearAllDeliveries: () => void;
  optimizing: boolean;
  // Offline Maps
  showOfflineModal: boolean;
  setShowOfflineModal: (show: boolean) => void;
  currentStyleUrl: string;
  currentMapBounds?: [number, number, number, number];
  onRequestSelectAreaOnMap?: () => void;
  pendingDownload?: {
    name: string;
    bounds: [number, number, number, number];
  } | null;
  onClearPendingDownload?: () => void;
  isOfflineMode?: boolean;
  onToggleOfflineMode?: (offline: boolean) => void;
}

export function MapModalsContainer({
  styles,
  navigation,
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
  showConfigModal,
  setShowConfigModal,
  showFuelHUD,
  setShowFuelHUD,
  mapType,
  mapTheme,
  hideCompleted,
  costingMode,
  onSelectType,
  onSelectTheme,
  onToggleHideCompleted,
  onSelectCostingMode,
  fuelConfig,
  setFuelConfig,
  routeInfo,
  deliveriesCount,
  currentLocation,
  onOptimize,
  onFitRoute,
  onReloadDeliveries,
  onDeleteStop,
  onMoveStopToTop,
  onMoveStopToEnd,
  onClearAllDeliveries,
  optimizing,
  showOfflineModal,
  setShowOfflineModal,
  currentStyleUrl,
  currentMapBounds,
  onRequestSelectAreaOnMap,
  pendingDownload,
  onClearPendingDownload,
  isOfflineMode,
  onToggleOfflineMode,
}: MapModalsContainerProps) {
  return (
    <>
      {/* ── Map Layers Modal ── */}
      <MapDisplayModal
        visible={showLayersModal}
        selectedType={mapType}
        selectedTheme={mapTheme}
        hideCompleted={hideCompleted}
        costingMode={costingMode}
        onClose={() => setShowLayersModal(false)}
        onSelectType={onSelectType}
        onSelectTheme={onSelectTheme}
        onToggleHideCompleted={onToggleHideCompleted}
        onSelectCostingMode={onSelectCostingMode}
      />

      {/* ── Add Delivery Modal ── */}
      <AddDeliveryModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={() => {
          setShowAddModal(false);
          onReloadDeliveries();
        }}
      />

      {/* ── Side Menu Modal ── */}
      <SideMenuModal
        visible={showMenuModal}
        onClose={() => setShowMenuModal(false)}
        onImportPress={() => navigation.navigate('Import')}
        onAddStopPress={() => setShowAddModal(true)}
        onFitRoutePress={onFitRoute}
        onLayersPress={() => setShowLayersModal(true)}
        onSettingsPress={() => navigation.navigate('Settings')}
        onDiagnosticPress={() => navigation.navigate('Diagnostic')}
        onListsPress={() => setShowListsModal(true)}
        onOfflinePress={() => setShowOfflineModal(true)}
        onClearRoutePress={() => {
          Alert.alert(
            'Limpar Rota',
            'Deseja apagar todas as paradas e a rota atual?',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Limpar Tudo',
                style: 'destructive',
                onPress: onClearAllDeliveries,
              },
            ],
          );
        }}
        totalDeliveriesCount={deliveriesCount}
      />

      {/* ── Config Modal ── */}
      <ConfigModal
        visible={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onReoptimize={() => onOptimize(currentLocation || undefined)}
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

      {/* ── Quick Actions Modal ── */}
      <QuickActionsMenuModal
        visible={showQuickActionsModal}
        onClose={() => setShowQuickActionsModal(false)}
        onReoptimize={() => onOptimize(currentLocation || undefined)}
        onShareRoute={() => Alert.alert('Compartilhar Rota', 'Link de rota gerado com sucesso!')}
      />

      {/* ── Quick RG Modal ── */}
      <QuickRgModal
        visible={showQuickRgModal}
        onClose={() => setShowQuickRgModal(false)}
      />

      {/* ── Stop Actions Modal ── */}
      <StopActionsModal
        visible={showStopActionsModal}
        stop={selectedStopForActions}
        onClose={() => {
          setShowStopActionsModal(false);
          setSelectedStopForActions(null);
        }}
        onMoveToTop={() => {
          if (selectedStopForActions && onMoveStopToTop) {
            onMoveStopToTop(selectedStopForActions);
          }
        }}
        onMoveToEnd={() => {
          if (selectedStopForActions && onMoveStopToEnd) {
            onMoveStopToEnd(selectedStopForActions);
          }
        }}
        onMarkPackages={() => Alert.alert('Marcar Pacotes', 'Pacotes marcados como conferidos.')}
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
                onPress: () => onDeleteStop(selectedStopForActions),
              },
            ]);
          }
        }}
      />

      {/* ── Delivery Lists Modal ── */}
      <DeliveryListsModal
        visible={showListsModal}
        onClose={() => setShowListsModal(false)}
        onListChanged={onReloadDeliveries}
      />

      {/* ── Offline Maps Modal ── */}
      <OfflineModal
        visible={showOfflineModal}
        onClose={() => setShowOfflineModal(false)}
        currentStyleUrl={currentStyleUrl}
        currentMapBounds={currentMapBounds}
        onRequestSelectAreaOnMap={onRequestSelectAreaOnMap}
        pendingDownload={pendingDownload}
        onClearPendingDownload={onClearPendingDownload}
        isOfflineMode={isOfflineMode}
        onToggleOfflineMode={onToggleOfflineMode}
      />

      {/* ── Loading Overlay ── */}
      {optimizing && (
        <View style={styles.loadingModalOverlay} pointerEvents="auto">
          <View style={styles.loadingModalCard}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingModalTitle}>Otimizando rotas</Text>
            <Text style={styles.loadingModalSub}>
              Calculando a melhor sequência e tempo estimado com Mapbox...
            </Text>
          </View>
        </View>
      )}
    </>
  );
}
