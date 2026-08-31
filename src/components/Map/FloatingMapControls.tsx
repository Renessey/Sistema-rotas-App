import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows, typography } from '../../theme';
import { LocateFixed, Layers, Scissors, Droplets, Route, Fuel, X } from 'lucide-react-native';

export interface FloatingMapControlsProps {
  followGPS: boolean;
  hasRoute: boolean;
  lassoMode?: boolean;
  diagStatus?: 'ok' | 'error' | 'unknown';
  onOpenLayers: () => void;
  onFitBounds?: () => void;
  onToggleFollowGPS: () => void;
  onToggleLasso?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onRefresh?: () => void;
  // Fuel & route real-time metrics
  showFuelHUD?: boolean;
  onCloseFuelHUD?: () => void;
  fuelConfig?: { kmPerLiter: number; pricePerLiter: number };
  routeDistanceM?: number;
  routeDurationS?: number;
  onPressFuelMetrics?: () => void;
}

export function FloatingMapControls({
  followGPS,
  lassoMode = false,
  onOpenLayers,
  onToggleFollowGPS,
  onToggleLasso,
  showFuelHUD = true,
  onCloseFuelHUD,
  fuelConfig,
  routeDistanceM = 0,
  onPressFuelMetrics,
}: FloatingMapControlsProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const distKm = (routeDistanceM || 0) / 1000;
  const kmPerLiter = fuelConfig?.kmPerLiter && fuelConfig.kmPerLiter > 0 ? fuelConfig.kmPerLiter : 10;
  const pricePerLiter = fuelConfig?.pricePerLiter && fuelConfig.pricePerLiter > 0 ? fuelConfig.pricePerLiter : 5.89;
  const liters = distKm > 0 ? distKm / kmPerLiter : 0;
  const cost = liters * pricePerLiter;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.floatingStack} pointerEvents="box-none">
        {/* ── Real-Time Fuel Metrics Card (Vertical Stack on top of buttons) ── */}
        {showFuelHUD && (
          <Pressable
            style={({ pressed }) => [
              styles.fuelStackCard,
              pressed && styles.btnPressed,
            ]}
            onPress={onPressFuelMetrics}
            hitSlop={4}
          >
            {/* Header com ícone de combustível */}
            <View style={styles.fuelHeaderMini}>
              <View style={styles.fuelIconBadge}>
                <Fuel size={12} color="#F59E0B" />
              </View>
              {onCloseFuelHUD && (
                <Pressable
                  style={styles.fuelCloseBtn}
                  onPress={onCloseFuelHUD}
                  hitSlop={6}
                >
                  <X size={10} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            {/* 1. Custo Estimado (R$) */}
            <View style={styles.fuelMetricBlock}>
              <Text style={styles.fuelMicroLabel}>CUSTO</Text>
              <Text style={styles.fuelCostText}>
                {cost > 0 ? `R$${cost < 100 ? cost.toFixed(1) : Math.round(cost)}` : 'R$ 0,00'}
              </Text>
            </View>

            <View style={styles.fuelDivider} />

            {/* 2. Litros de Combustível (L) */}
            <View style={styles.fuelMetricBlock}>
              <View style={styles.fuelRowInline}>
                <Droplets size={10} color="#F59E0B" strokeWidth={2.4} />
                <Text style={styles.fuelLitersText}>
                  {liters > 0 ? `${liters < 10 ? liters.toFixed(1) : Math.round(liters)}L` : '0.0L'}
                </Text>
              </View>
            </View>

            <View style={styles.fuelDivider} />

            {/* 3. Distância da Rota (Km) */}
            <View style={styles.fuelMetricBlock}>
              <View style={styles.fuelRowInline}>
                <Route size={10} color="#38BDF8" strokeWidth={2.4} />
                <Text style={styles.fuelKmText}>
                  {distKm > 0 ? `${distKm < 10 ? distKm.toFixed(1) : Math.round(distKm)}km` : '0km'}
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* GPS Centering / Location Target Button */}
        <Pressable
          style={({ pressed }) => [
            styles.floatingBtn,
            followGPS && styles.floatingBtnActive,
            pressed && styles.btnPressed,
          ]}
          onPress={onToggleFollowGPS}
          hitSlop={8}
        >
          <LocateFixed
            size={22}
            color={followGPS ? '#FFFFFF' : colors.primary}
            strokeWidth={2.2}
          />
        </Pressable>

        {/* Map Layers / Style Button */}
        <Pressable
          style={({ pressed }) => [styles.floatingBtn, pressed && styles.btnPressed]}
          onPress={onOpenLayers}
          hitSlop={8}
        >
          <Layers size={22} color={colors.textSecondary} strokeWidth={2} />
        </Pressable>

        {/* Lasso Tool Button */}
        {onToggleLasso && (
          <Pressable
            style={({ pressed }) => [
              styles.floatingBtn,
              lassoMode && styles.floatingBtnLasso,
              pressed && styles.btnPressed,
            ]}
            onPress={onToggleLasso}
            hitSlop={8}
          >
            <Scissors
              size={20}
              color={lassoMode ? '#FFFFFF' : colors.textSecondary}
              strokeWidth={2}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const createStyles = (themeColors: any) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFill,
    },
    floatingStack: {
      position: 'absolute',
      right: spacing.md,
      bottom: 235,
      gap: spacing.sm,
      zIndex: 20,
      alignItems: 'center',
    },
    fuelStackCard: {
      width: 52,
      backgroundColor: themeColors.surface,
      borderRadius: radius.md + 2,
      borderWidth: 1.5,
      borderColor: themeColors.warning + '66',
      paddingVertical: 6,
      paddingHorizontal: 3,
      alignItems: 'center',
      gap: 3,
      ...shadows.lg,
      elevation: 8,
    },
    fuelHeaderMini: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      marginBottom: 1,
      position: 'relative',
    },
    fuelIconBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: themeColors.warningGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fuelCloseBtn: {
      position: 'absolute',
      right: -2,
      top: -2,
      width: 14,
      height: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fuelMetricBlock: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      width: '100%',
    },
    fuelMicroLabel: {
      fontSize: 7.5,
      fontWeight: '900',
      color: themeColors.textMuted,
      letterSpacing: 0.5,
    },
    fuelRowInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      justifyContent: 'center',
    },
    fuelCostText: {
      fontSize: 10.5,
      fontWeight: '900',
      color: themeColors.success,
      lineHeight: 13,
    },
    fuelLitersText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#F59E0B',
      lineHeight: 12,
    },
    fuelKmText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#38BDF8',
      lineHeight: 12,
    },
    fuelDivider: {
      width: 32,
      height: 1,
      backgroundColor: themeColors.border,
      marginVertical: 1,
    },
    floatingBtn: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: themeColors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: themeColors.border,
      ...shadows.md,
    },
    floatingBtnActive: {
      backgroundColor: themeColors.primary,
      borderColor: themeColors.primaryDark,
    },
    floatingBtnLasso: {
      backgroundColor: '#7C3AED',
      borderColor: '#6D28D9',
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.95 }],
    },
  });
