import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { radius, shadows, spacing, typography } from '../../theme';
import { Fuel, ChevronUp, ChevronDown, X, Clock, Route, Droplets } from 'lucide-react-native';

interface FuelHUDCardProps {
  visible: boolean;
  kmPerLiter: number;
  pricePerLiter: number;
  distanceRemainingM: number;
  durationRemainingS: number;
  onClose: () => void;
}

export function FuelHUDCard({
  visible,
  kmPerLiter,
  pricePerLiter,
  distanceRemainingM,
  durationRemainingS,
  onClose,
}: FuelHUDCardProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [minimized, setMinimized] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-80)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 55,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -80,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  if (!visible) return null;

  const distKm = distanceRemainingM / 1000;
  const litersNeeded = kmPerLiter > 0 ? distKm / kmPerLiter : 0;
  const estimatedCost = litersNeeded * pricePerLiter;

  const durationMin = Math.round(durationRemainingS / 60);
  const durationStr =
    durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
      : `${durationMin} min`;

  return (
    <Animated.View
      style={[
        styles.hud,
        {
          top: Math.max(insets.top, 12) + 8,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Header row */}
      <View style={styles.hudHeader}>
        <View style={styles.hudTitleRow}>
          <Fuel size={14} color={colors.warning} />
          <Text style={styles.hudTitle}>PAINEL DE ROTA</Text>
        </View>
        <View style={styles.hudControls}>
          <Pressable
            style={styles.hudControlBtn}
            onPress={() => setMinimized((m) => !m)}
            hitSlop={6}
          >
            {minimized ? (
              <ChevronDown size={14} color={colors.textSecondary} />
            ) : (
              <ChevronUp size={14} color={colors.textSecondary} />
            )}
          </Pressable>
          <Pressable style={styles.hudControlBtn} onPress={onClose} hitSlop={6}>
            <X size={14} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* Metrics row (collapsed when minimized) */}
      {!minimized && (
        <View style={styles.metricsRow}>
          {/* Km restantes */}
          <View style={styles.metricItem}>
            <Route size={13} color={colors.primary} />
            <Text style={styles.metricValue}>{distKm.toFixed(1)} km</Text>
            <Text style={styles.metricLabel}>restantes</Text>
          </View>

          <View style={styles.metricDivider} />

          {/* Tempo restante */}
          <View style={styles.metricItem}>
            <Clock size={13} color={colors.primary} />
            <Text style={styles.metricValue}>{durationStr}</Text>
            <Text style={styles.metricLabel}>restante</Text>
          </View>

          <View style={styles.metricDivider} />

          {/* Litros */}
          <View style={styles.metricItem}>
            <Droplets size={13} color={colors.warning} />
            <Text style={[styles.metricValue, { color: colors.warning }]}>
              {litersNeeded.toFixed(2)} L
            </Text>
            <Text style={styles.metricLabel}>combustível</Text>
          </View>

          {estimatedCost > 0 && (
            <>
              <View style={styles.metricDivider} />
              {/* Custo */}
              <View style={styles.metricItem}>
                <Text style={styles.currencySymbol}>R$</Text>
                <Text style={[styles.metricValue, { color: colors.success, fontWeight: '800' }]}>
                  {estimatedCost.toFixed(2)}
                </Text>
                <Text style={styles.metricLabel}>estimado</Text>
              </View>
            </>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    hud: {
      position: 'absolute',
      top: 0,
      left: spacing.md,
      right: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      ...shadows.lg,
      zIndex: 30,
    },
    hudHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    hudTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    hudTitle: {
      ...typography.label,
      color: colors.textSecondary,
      fontWeight: '800',
      fontSize: 10,
      letterSpacing: 0.8,
    },
    hudControls: {
      flexDirection: 'row',
      gap: 4,
    },
    hudControlBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xs,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    metricItem: {
      flex: 1,
      alignItems: 'center',
      gap: 1,
    },
    metricValue: {
      ...typography.bodySmall,
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    metricLabel: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 9,
    },
    metricDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border,
    },
    currencySymbol: {
      ...typography.caption,
      color: colors.success,
      fontWeight: '800',
      fontSize: 10,
    },
  });
