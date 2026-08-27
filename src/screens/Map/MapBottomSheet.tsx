import React from 'react';
import {
  Animated,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Menu,
  Search,
  ScanLine,
  Mic,
  SlidersHorizontal,
  MapPin,
  Route,
  Clock,
  Plus,
  Zap,
  Check,
  FileSpreadsheet,
  Info,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { createScreenStyles } from './MapScreenStyles';
import StopTimelineRow from './StopTimelineRow';
import type { RouteStop, LngLat } from '../../types/geo';

interface MapBottomSheetProps {
  /** Animação arrastável */
  sheetTranslateY: Animated.Value;
  snapExpanded: number;
  panHandlers: object;
  sheetState: 'expanded' | 'half' | 'collapsed';
  onToggleSnap: () => void;
  /** Insets */
  paddingBottom: number;
  /** State props */
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filteredStops: RouteStop[];
  nextStop: RouteStop | null;
  stopTimes: string[];
  totalStopsCount: number;
  totalPackagesCount: number;
  routeInfo: { distance: number; duration: number } | null;
  optimizing: boolean;
  routeNeedsOptimization: boolean;
  currentLocation: LngLat | null;
  /** Callbacks */
  onOpenMenu: () => void;
  onOpenQuickActions: () => void;
  onSelectStop: (stop: RouteStop) => void;
  onLongPressStop: (stop: RouteStop) => void;
  onOptimize: (origin?: LngLat) => void;
  onCenterGps: () => void;
  onAddStop: () => void;
  onNavigateImport: () => void;
  formatDistance: (m: number) => string;
  formatDuration: (s: number) => string;
}

export function MapBottomSheet({
  sheetTranslateY,
  snapExpanded,
  panHandlers,
  sheetState,
  onToggleSnap,
  paddingBottom,
  searchQuery,
  onSearchChange,
  filteredStops,
  nextStop,
  stopTimes,
  totalStopsCount,
  totalPackagesCount,
  routeInfo,
  optimizing,
  routeNeedsOptimization,
  currentLocation,
  onOpenMenu,
  onOpenQuickActions,
  onSelectStop,
  onLongPressStop,
  onOptimize,
  onCenterGps,
  onAddStop,
  onNavigateImport,
  formatDistance,
  formatDuration,
}: MapBottomSheetProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createScreenStyles(colors), [colors]);

  const handleFinishRoute = () => {
    Alert.alert(
      'Finalizar Rota',
      'Deseja concluir o itinerário da rota atual?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: () => Alert.alert('Sucesso', 'Rota finalizada com sucesso!'),
        },
      ],
    );
  };

  return (
    <Animated.View
      style={[
        styles.bottomSheet,
        {
          height: snapExpanded,
          transform: [{ translateY: sheetTranslateY }],
          paddingBottom,
        },
      ]}
    >
      {/* Drag Handle Area */}
      <View {...panHandlers} style={styles.dragZone}>
        <Pressable onPress={onToggleSnap} hitSlop={10} style={styles.handleContainer}>
          <View style={styles.handle} />
        </Pressable>

        {/* Search Bar Header */}
        <View style={styles.searchRow}>
          {/* Hamburger Button */}
          <Pressable style={styles.iconBtn} onPress={onOpenMenu} hitSlop={8}>
            <Menu size={22} color={colors.primary} />
          </Pressable>

          {/* Search Input Box */}
          <View style={styles.searchInputContainer}>
            <Search size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Pesquisar endereço ou parada…"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={onSearchChange}
              returnKeyType="search"
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                onPress={() => Alert.alert('Scanner', 'Scanner de código de barras')}
                hitSlop={6}
              >
                <ScanLine size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={() => Alert.alert('Voz', 'Comando de voz ativado')}
                hitSlop={6}
              >
                <Mic size={18} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Options / Quick Actions Button */}
          <Pressable style={styles.iconBtn} onPress={onOpenQuickActions} hitSlop={8}>
            <SlidersHorizontal size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {/* Scrollable Content */}
      {sheetState !== 'collapsed' && (
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header: Rotas & Status */}
          <View style={styles.rotasHeaderRow}>
            <Text style={styles.rotasTitle}>Rotas</Text>
            <View
              style={[
                styles.rotasStatusBadge,
                filteredStops.length === 0
                  ? { backgroundColor: colors.warningGhost }
                  : optimizing
                  ? { backgroundColor: colors.primaryGhost }
                  : { backgroundColor: colors.successGhost },
              ]}
            >
              <View
                style={[
                  styles.rotasStatusDot,
                  filteredStops.length === 0
                    ? { backgroundColor: colors.warning }
                    : optimizing
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.success },
                ]}
              />
              <Text
                style={[
                  styles.rotasStatusText,
                  filteredStops.length === 0
                    ? { color: colors.warning }
                    : optimizing
                    ? { color: colors.primary }
                    : { color: colors.success },
                ]}
              >
                {filteredStops.length === 0
                  ? 'Aguardando paradas'
                  : optimizing
                  ? 'Otimizando rota...'
                  : `${totalStopsCount} ${totalStopsCount === 1 ? 'parada ativa' : 'paradas ativas'}`}
              </Text>
            </View>
          </View>

          {/* Metrics Card */}
          <View style={styles.metricsCard}>
            <View style={styles.metricCol}>
              <MapPin size={18} color={colors.primary} />
              <Text style={styles.metricVal}>{totalStopsCount}</Text>
              <Text style={styles.metricLbl}>Paradas</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricCol}>
              <Route size={18} color={colors.primary} />
              <Text style={styles.metricVal}>
                {routeInfo
                  ? formatDistance(routeInfo.distance)
                  : totalStopsCount > 0
                  ? 'Calculando...'
                  : '0 km'}
              </Text>
              <Text style={styles.metricLbl}>Distância</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricCol}>
              <Clock size={18} color={colors.primary} />
              <Text style={styles.metricVal}>
                {routeInfo ? formatDuration(routeInfo.duration) : '--:--'}
              </Text>
              <Text style={styles.metricLbl}>Duração</Text>
            </View>
          </View>

          {filteredStops.length === 0 ? (
            /* ── EMPTY STATE ── */
            <View>
              {/* Route Origin Row */}
              <View style={styles.originSection}>
                <View style={styles.originDotCol}>
                  <View style={styles.originDot} />
                  <View style={styles.originLine} />
                </View>
                <Pressable
                  style={styles.originInfo}
                  onPress={() => {
                    if (currentLocation) {
                      onCenterGps();
                      onOptimize(currentLocation);
                    } else {
                      Alert.alert('GPS', 'Aguardando sinal de GPS...');
                    }
                  }}
                >
                  <View style={styles.originTextWrap}>
                    <Text style={styles.originTitle}>Origem da rota</Text>
                    <Text style={styles.originSubtitle}>
                      {currentLocation ? 'Início na sua posição GPS' : 'Buscando GPS...'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textDisabled} />
                </Pressable>
              </View>

              {/* Add Stop Row */}
              <View style={styles.addStopSection}>
                <View style={styles.originDotCol}>
                  <View style={styles.addDot}>
                    <Plus size={14} color="#FFFFFF" />
                  </View>
                  <View style={styles.originLine} />
                </View>
                <Pressable style={styles.originInfo} onPress={onAddStop}>
                  <View style={styles.originTextWrap}>
                    <Text style={styles.originTitle}>Adicionar</Text>
                    <Text style={styles.originSubtitle}>Toque aqui para começar</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textDisabled} />
                </Pressable>
              </View>
            </View>
          ) : (
            /* ── ACTIVE STOPS LIST ── */
            <View>
              {/* Route Origin Section */}
              <View style={styles.originSection}>
                <View style={styles.originDotCol}>
                  <View style={styles.originDot} />
                  <View style={styles.originLine} />
                </View>
                <Pressable
                  style={styles.originInfo}
                  onPress={() => {
                    if (currentLocation) {
                      onCenterGps();
                      onOptimize(currentLocation);
                    } else {
                      Alert.alert('GPS', 'Aguardando sinal de GPS...');
                    }
                  }}
                >
                  <View style={styles.originTextWrap}>
                    <Text style={styles.originTitle}>Origem da rota</Text>
                    <Text style={styles.originSubtitle}>
                      {currentLocation
                        ? 'Início na sua localização GPS (Toque para reotimizar)'
                        : 'Buscando GPS...'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textDisabled} />
                </Pressable>
              </View>

              {/* Subheader: Reotimizar & N paradas */}
              <View style={styles.statusSubheader}>
                <Pressable
                  style={[styles.optimizedBadge, optimizing && styles.btnDisabled]}
                  onPress={() => onOptimize(currentLocation || undefined)}
                  disabled={optimizing}
                >
                  <Zap size={14} color={colors.primary} />
                  <Text style={styles.optimizedText}>
                    {optimizing ? 'Otimizando...' : 'Reotimizar Rota'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.stopsCountWrap}
                  onPress={() => {
                    Alert.alert(
                      'Resumo da Rota',
                      `${totalStopsCount} paradas únicas agrupadas no mapa (${totalPackagesCount} pacotes/pedidos totais).`,
                    );
                  }}
                >
                  <Text style={styles.stopsCountText}>
                    {totalStopsCount} paradas · {totalPackagesCount} pacotes
                  </Text>
                  <Info size={14} color={colors.primary} />
                </Pressable>
              </View>

              {/* Timeline List of Grouped Stops */}
              <View style={styles.timelineContainer}>
                {filteredStops.map((stop, index) => {
                  const isCompleted = stop.status === 'completed';
                  const isFailed = stop.status === 'failed';
                  const isNext = nextStop?.key === stop.key;
                  const timeStr = stopTimes[index] || '02:00';
                  const isLastItem = index === filteredStops.length - 1;

                  return (
                    <StopTimelineRow
                      key={stop.key}
                      stop={stop}
                      index={index}
                      isNext={isNext}
                      isCompleted={isCompleted}
                      isFailed={isFailed}
                      timeStr={timeStr}
                      isLastItem={isLastItem}
                      onSelect={onSelectStop}
                      onLongPress={onLongPressStop}
                    />
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Sticky Bottom Action Button */}
      {sheetState !== 'collapsed' && (
        <View style={styles.bottomBar}>
          {filteredStops.length === 0 ? (
            <Pressable
              style={({ pressed }) => [styles.importSheetBtn, pressed && styles.btnPressed]}
              onPress={onNavigateImport}
            >
              <FileSpreadsheet size={18} color="#FFFFFF" />
              <Text style={styles.importSheetBtnText}>Importar planilha</Text>
            </Pressable>
          ) : (
            <View style={styles.bottomActionsRow}>
              {/* Task 5: Botão Otimizar — desabilitado quando rota está atualizada */}
              <Pressable
                style={({ pressed }) => [
                  styles.reoptimizeBtn,
                  routeNeedsOptimization && styles.reoptimizeBtnActive,
                  (optimizing || !routeNeedsOptimization) && styles.btnDisabled,
                  pressed && routeNeedsOptimization && styles.btnPressed,
                ]}
                onPress={() => {
                  if (routeNeedsOptimization) onOptimize();
                }}
                disabled={optimizing || !routeNeedsOptimization}
              >
                {optimizing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Zap
                      size={16}
                      color={routeNeedsOptimization ? '#FFFFFF' : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.reoptimizeBtnText,
                        routeNeedsOptimization && styles.reoptimizeBtnTextActive,
                      ]}
                    >
                      {routeNeedsOptimization ? 'Otimizar Rota' : 'Otimizado'}
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.finishRouteBtn,
                  pressed && styles.btnPressed,
                  { flex: 1 },
                ]}
                onPress={handleFinishRoute}
              >
                <Check size={18} color="#FFFFFF" />
                <Text style={styles.finishRouteBtnText}>Finalizar rota</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}
