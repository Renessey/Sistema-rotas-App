import React, { useCallback, useMemo } from 'react';
import {
  Animated,
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  Menu,
  Search,
  ScanLine,
  Mic,
  SlidersHorizontal,
  Plus,
  Zap,
  Check,
  FileSpreadsheet,
  Info,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { createScreenStyles } from '../MapScreenStyles';
import { StopTimelineRow } from './StopTimelineRow';
import type { RouteStop, LngLat } from '../../../types/geo';

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
  unlocatedCount?: number;
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
  onNavigateDeliveries?: () => void;
  /** Formatters */
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
  unlocatedCount = 0,
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
  onNavigateDeliveries,
  formatDistance,
  formatDuration,
}: MapBottomSheetProps) {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark' || colors.background === '#0f172a';
  const styles = useMemo(() => createScreenStyles(colors), [colors]);

  const handleFinishRoute = useCallback(() => {
    Alert.alert(
      'Finalizar Rota',
      'Deseja concluir o itinerário da rota atual?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Sucesso', 'Rota finalizada com sucesso!');
          },
        },
      ],
    );
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: RouteStop; index: number }) => {
      const isCompleted = item.status === 'completed';
      const isFailed = item.status === 'failed';
      const isNext = nextStop?.key === item.key;
      const timeStr = stopTimes[index] || '02:00';
      const isLastItem = index === filteredStops.length - 1;

      return (
        <StopTimelineRow
          key={item.key}
          stop={item}
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
    },
    [nextStop, stopTimes, filteredStops.length, onSelectStop, onLongPressStop],
  );

  const keyExtractor = useCallback((item: RouteStop) => item.key, []);

  const listHeader = useMemo(() => {
    if (filteredStops.length === 0) {
      return (
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
      );
    }

    return (
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

        {/* Aviso de Paradas sem Coordenadas */}
        {unlocatedCount > 0 && (
          <Pressable
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.warningGhost,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: colors.warning + '44',
              marginBottom: 8,
              gap: 8,
            }}
            onPress={() => {
              Alert.alert(
                'Entregas sem Localização Exata',
                `Existem ${unlocatedCount} entrega(s) nesta lista sem coordenadas GPS confirmadas. Deseja conferir na lista completa de entregas?`,
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Ver na Lista',
                    onPress: () => onNavigateDeliveries?.(),
                  },
                ],
              );
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <AlertTriangle size={15} color={colors.warning} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, flex: 1 }}>
                {unlocatedCount} {unlocatedCount === 1 ? 'entrega sem coordenada exata' : 'entregas sem coordenadas exatas'}
              </Text>
            </View>
            <ChevronRight size={15} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    );
  }, [
    filteredStops.length,
    currentLocation,
    optimizing,
    totalStopsCount,
    totalPackagesCount,
    unlocatedCount,
    colors,
    styles,
    onCenterGps,
    onOptimize,
    onAddStop,
    onNavigateDeliveries,
  ]);

  return (
    <Animated.View
      style={[
        styles.bottomSheet,
        {
          height: snapExpanded + 40,
          transform: [{ translateY: sheetTranslateY }],
        },
      ]}
    >
      {/* ── DRAG HEADER ── */}
      <View {...panHandlers} style={styles.dragZone}>
        <Pressable
          style={styles.handleContainer}
          onPress={onToggleSnap}
          hitSlop={{ top: 10, bottom: 14, left: 40, right: 40 }}
          accessibilityLabel="Expandir ou recolher lista de entregas"
        >
          <View style={styles.handle} />
        </Pressable>

        {/* ── Search Bar Row ── */}
        <View style={styles.searchRow}>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
            onPress={onOpenMenu}
            hitSlop={8}
            accessibilityLabel="Abrir menu lateral"
          >
            <Menu size={20} color={colors.text} />
          </Pressable>

          <View style={styles.searchInputContainer}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar endereço, destinatário..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={onSearchChange}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            <Pressable
              onPress={() => Alert.alert('Escanear', 'Leitor de código de barras / QR Code')}
              hitSlop={6}
            >
              <ScanLine size={16} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Voz', 'Comando por voz')}
              hitSlop={6}
            >
              <Mic size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.primaryGhost, borderColor: colors.primary + '33' },
              pressed && styles.btnPressed,
            ]}
            onPress={onOpenQuickActions}
            hitSlop={8}
            accessibilityLabel="Menu de Ações Rápidas"
          >
            <SlidersHorizontal size={18} color={colors.primary} />
          </Pressable>
        </View>

        {/* ── Action Buttons Bar (Otimizar Rota e Finalizar) ── */}
        <View style={styles.sheetActionsBar}>
          <Pressable
            style={({ pressed }) => [
              styles.sheetOptBtn,
              routeNeedsOptimization && styles.sheetOptBtnActive,
              pressed && styles.btnPressed,
            ]}
            onPress={() => onOptimize(currentLocation ?? undefined)}
            disabled={optimizing}
            accessibilityLabel={routeNeedsOptimization ? 'Otimizar Rota' : 'Reotimizar Rota'}
          >
            {optimizing ? (
              <ActivityIndicator size="small" color={isDark ? '#93C5FD' : '#FFFFFF'} />
            ) : (
              <>
                <Zap
                  size={15}
                  color={isDark ? (routeNeedsOptimization ? '#C7D2FE' : '#93C5FD') : '#FFFFFF'}
                  fill={isDark ? (routeNeedsOptimization ? '#C7D2FE' : '#93C5FD') : '#FFFFFF'}
                />
                <Text style={styles.sheetOptBtnText} numberOfLines={1}>
                  {routeNeedsOptimization ? 'Otimizar Rota' : 'Reotimizar Rota'}
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.sheetFinishBtn, pressed && styles.btnPressed]}
            onPress={handleFinishRoute}
            accessibilityLabel="Finalizar itinerário da rota"
          >
            <Check size={15} color={isDark ? '#6EE7B7' : '#FFFFFF'} strokeWidth={2.5} />
            <Text style={styles.sheetFinishBtnText} numberOfLines={1}>
              Finalizar Rota
            </Text>
          </Pressable>
        </View>

        {/* ── Rotas Header (Título + Status) ── */}
        <View style={styles.rotasHeaderRow}>
          <Text style={styles.rotasTitle}>Rotas</Text>
          <View style={styles.rotasStatusBadge}>
            <View style={styles.rotasStatusDot} />
            <Text style={styles.rotasStatusText}>
              {optimizing ? 'Otimizando...' : 'Em Andamento'}
            </Text>
          </View>
        </View>

        {/* ── Metrics Card (KPIs) ── */}
        <View style={styles.metricsCard}>
          <View style={styles.metricCol}>
            <Text style={styles.metricVal}>{totalStopsCount}</Text>
            <Text style={styles.metricLbl}>Paradas</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCol}>
            <Text style={styles.metricVal}>
              {routeInfo ? formatDuration(routeInfo.duration) : '0 min'}
            </Text>
            <Text style={styles.metricLbl}>Tempo Est.</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCol}>
            <Text style={styles.metricVal}>
              {routeInfo ? formatDistance(routeInfo.distance) : '0 km'}
            </Text>
            <Text style={styles.metricLbl}>Distância</Text>
          </View>
        </View>
      </View>

      {/* ── FLUID VIRTUALIZED TIMELINE LIST (Always pre-rendered for instant 60 FPS drag) ── */}
      <FlatList
        data={filteredStops}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        style={styles.sheetScroll}
        contentContainerStyle={[
          styles.sheetScrollContent,
          { paddingBottom: (sheetState === 'expanded' ? 100 : 24) + paddingBottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      {/* Sticky Bottom Action Button (quando expandido) */}
      {sheetState === 'expanded' && (
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
