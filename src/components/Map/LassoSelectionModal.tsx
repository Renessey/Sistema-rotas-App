import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { radius, shadows, spacing, typography } from '../../theme';
import { X, Zap, RotateCcw, Scissors } from 'lucide-react-native';
import type { RouteStop } from '../../types/geo';

interface LassoSelectionModalProps {
  visible: boolean;
  selectedStops: RouteStop[];
  onConfirm: () => void;
  onUndo: () => void;
  onClose: () => void;
}

export function LassoSelectionModal({
  visible,
  selectedStops,
  onConfirm,
  onUndo,
  onClose,
}: LassoSelectionModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const scaleAnim = React.useRef(new Animated.Value(0.85)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.85, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  if (!visible) return null;

  const count = selectedStops.length;
  const totalPackages = selectedStops.reduce((s, st) => s + st.totalCount, 0);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        {/* Backdrop */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          style={[styles.card, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconWrap}>
                <Scissors size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Seleção por Laço</Text>
                <Text style={styles.subtitle}>Confirme a ação para os pontos selecionados</Text>
              </View>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Count Badge */}
          <View style={styles.countBadgeRow}>
            <View style={styles.countBadge}>
              <Text style={styles.countNumber}>{count}</Text>
              <Text style={styles.countLabel}>
                {count === 1 ? 'ponto selecionado' : 'pontos selecionados'}
              </Text>
            </View>
            {totalPackages !== count && (
              <View style={[styles.countBadge, { backgroundColor: colors.primaryGhost, borderColor: colors.primary + '33' }]}>
                <Text style={[styles.countNumber, { color: colors.primary }]}>{totalPackages}</Text>
                <Text style={[styles.countLabel, { color: colors.primary }]}>pacotes total</Text>
              </View>
            )}
          </View>

          {/* Stops Preview */}
          {count > 0 && (
            <View style={styles.stopsPreview}>
              {selectedStops.slice(0, 3).map((stop, i) => (
                <View key={stop.key} style={styles.stopPreviewRow}>
                  <View style={styles.stopPreviewDot} />
                  <Text style={styles.stopPreviewText} numberOfLines={1}>
                    {i + 1}. {stop.address}
                  </Text>
                </View>
              ))}
              {count > 3 && (
                <Text style={styles.moreText}>+{count - 3} outros pontos...</Text>
              )}
            </View>
          )}

          {count === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                Nenhum ponto dentro do laço desenhado. Tente novamente.
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [styles.undoBtn, pressed && styles.btnPressed]}
              onPress={onUndo}
              hitSlop={4}
            >
              <RotateCcw size={15} color={colors.textSecondary} />
              <Text style={styles.undoBtnText}>Retroceder</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.confirmBtn,
                count === 0 && styles.confirmBtnDisabled,
                pressed && count > 0 && styles.btnPressed,
              ]}
              onPress={count > 0 ? onConfirm : undefined}
              disabled={count === 0}
            >
              <Zap size={16} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>Confirmar e Reotimizar</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      paddingHorizontal: spacing.md,
    },
    card: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: radius.xxl,
      padding: spacing.lg,
      gap: spacing.md,
      ...shadows.xl,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...typography.title,
      color: colors.text,
      fontWeight: '800',
    },
    subtitle: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: 1,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    countBadgeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    countBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    countNumber: {
      ...typography.title,
      color: colors.text,
      fontWeight: '800',
    },
    countLabel: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    stopsPreview: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.sm,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stopPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    stopPreviewDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    stopPreviewText: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '600',
      flex: 1,
    },
    moreText: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: 2,
      marginLeft: spacing.sm,
    },
    emptyBox: {
      backgroundColor: colors.warningGhost,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.warning + '44',
    },
    emptyText: {
      ...typography.bodySmall,
      color: colors.warning,
      fontWeight: '600',
      textAlign: 'center',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    undoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    undoBtnText: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    confirmBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      gap: 6,
      ...shadows.sm,
    },
    confirmBtnDisabled: {
      backgroundColor: colors.borderStrong,
    },
    confirmBtnText: {
      fontSize: 14,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.97 }],
    },
  });
