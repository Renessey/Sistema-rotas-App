import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Zap,
  CheckCircle2,
  MapPin,
  Clock,
  Route as RouteIcon,
  Compass,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius, shadows, spacing, typography } from '../../theme';

interface OptimizationSuccessModalProps {
  visible: boolean;
  onClose: () => void;
  stopsCount: number;
  packagesCount?: number;
  distanceMeters: number;
  durationSeconds: number;
  isOffline?: boolean;
  onViewMap?: () => void;
}

export function OptimizationSuccessModal({
  visible,
  onClose,
  stopsCount,
  packagesCount,
  distanceMeters,
  durationSeconds,
  isOffline = false,
  onViewMap,
}: OptimizationSuccessModalProps) {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark' || colors.background === '#0f172a';
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.85,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  const distanceKm = (distanceMeters / 1000).toFixed(1);
  const durationMin = Math.max(1, Math.round(durationSeconds / 60));
  const hours = Math.floor(durationMin / 60);
  const mins = durationMin % 60;
  const formattedDuration = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

  const handleConfirm = () => {
    onClose();
    onViewMap?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: opacityAnim },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.container,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
              marginBottom: insets.bottom + 10,
            },
          ]}
        >
          {/* ── Top Close Button ── */}
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Fechar modal"
          >
            <X size={18} color={colors.textMuted} />
          </Pressable>

          {/* ── Glowing Header Icon ── */}
          <View style={styles.iconGlowWrapper}>
            <View style={styles.iconCircle}>
              <Zap size={28} color="#FFFFFF" fill="#FFFFFF" />
            </View>
            <View style={styles.checkBadge}>
              <CheckCircle2 size={16} color="#10B981" fill="#FFFFFF" />
            </View>
          </View>

          {/* ── Title & Subtitle ── */}
          <Text style={styles.title}>Rota Otimizada!</Text>
          <Text style={styles.subtitle}>
            Seu itinerário foi recalculado com sucesso pela menor distância e tempo.
          </Text>

          {/* ── Engine Badge (Offline OSM) ── */}
          <View style={styles.modeBadge}>
            <View style={[styles.modeDot, styles.modeDotOffline]} />
            <Text style={styles.modeBadgeText}>
              Motor Nativo Offline (OpenStreetMap)
            </Text>
            <ShieldCheck size={13} color="#10B981" />
          </View>

          {/* ── Metrics Cards Grid ── */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <View style={[styles.metricIconWrap, { backgroundColor: colors.primaryGhost }]}>
                <MapPin size={18} color={colors.primary} />
              </View>
              <Text style={styles.metricValue}>{stopsCount}</Text>
              <Text style={styles.metricLabel}>
                {stopsCount === 1 ? 'Parada' : 'Paradas'}
              </Text>
              {packagesCount && packagesCount > stopsCount ? (
                <Text style={styles.metricSubLabel}>{packagesCount} pacotes</Text>
              ) : null}
            </View>

            <View style={styles.metricCard}>
              <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                <RouteIcon size={18} color="#10B981" />
              </View>
              <Text style={styles.metricValue}>{distanceKm} km</Text>
              <Text style={styles.metricLabel}>Distância</Text>
              <Text style={styles.metricSubLabel}>Traçado real</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                <Clock size={18} color="#F59E0B" />
              </View>
              <Text style={styles.metricValue}>{formattedDuration}</Text>
              <Text style={styles.metricLabel}>Tempo Est.</Text>
              <Text style={styles.metricSubLabel}>Tráfego viário</Text>
            </View>
          </View>

          {/* ── Action Buttons ── */}
          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
              ]}
              onPress={handleConfirm}
            >
              <Compass size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Ver Rota no Mapa</Text>
              <ArrowRight size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
    },
    container: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
      borderRadius: radius.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : colors.border,
      ...shadows.xl,
    },
    closeBtn: {
      position: 'absolute',
      top: 14,
      right: 14,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    btnPressed: {
      opacity: 0.75,
      transform: [{ scale: 0.94 }],
    },
    iconGlowWrapper: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#2563EB',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 4,
      borderColor: isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.2)',
      ...shadows.colored('#2563EB'),
    },
    checkBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      backgroundColor: '#FFFFFF',
      borderRadius: 10,
    },
    title: {
      ...typography.headline,
      color: colors.text,
      fontWeight: '900',
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    subtitle: {
      ...typography.bodySmall,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.sm,
      lineHeight: 18,
    },
    modeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.full,
      gap: 6,
      borderWidth: 1,
      borderColor: 'rgba(16, 185, 129, 0.25)',
      marginBottom: spacing.lg,
    },
    modeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    modeDotOffline: {
      backgroundColor: '#10B981',
    },
    modeDotOnline: {
      backgroundColor: '#3B82F6',
    },
    modeBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#6EE7B7' : '#059669',
    },
    metricsGrid: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    metricCard: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : colors.surfaceElevated,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
      gap: 2,
    },
    metricIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    metricValue: {
      fontSize: 15,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.2,
    },
    metricLabel: {
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: '600',
      fontSize: 11,
    },
    metricSubLabel: {
      fontSize: 9,
      color: colors.textDisabled,
      fontWeight: '500',
    },
    actionsRow: {
      width: '100%',
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2563EB',
      borderRadius: radius.lg,
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
      ...shadows.lg,
    },
    primaryBtnPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
      backgroundColor: '#1D4ED8',
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
  });
