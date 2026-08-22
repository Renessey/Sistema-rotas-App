import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows } from '../../theme';

export interface FloatingMapControlsProps {
  followGPS: boolean;
  hasRoute: boolean;
  onOpenLayers: () => void;
  onFitBounds: () => void;
  onToggleFollowGPS: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRefresh?: () => void;
}

export function FloatingMapControls({
  followGPS,
  hasRoute,
  onOpenLayers,
  onFitBounds,
  onToggleFollowGPS,
  onZoomIn,
  onZoomOut,
  onRefresh,
}: FloatingMapControlsProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Top right floating group */}
      <View style={styles.topRightGroup} pointerEvents="box-none">
        {/* Camadas / Estilos do Mapa */}
        <Pressable
          style={({ pressed }) => [
            styles.ctrlBtn,
            styles.elevatedBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={onOpenLayers}
          hitSlop={6}
        >
          <Text style={styles.btnIcon}>🗺️</Text>
        </Pressable>

        {/* FitBounds / Enquadrar Todas as Paradas */}
        {hasRoute && (
          <Pressable
            style={({ pressed }) => [
              styles.ctrlBtn,
              styles.elevatedBtn,
              styles.fitBtn,
              pressed && styles.btnPressed,
            ]}
            onPress={onFitBounds}
            hitSlop={6}
          >
            <Text style={styles.btnIcon}>🎯</Text>
          </Pressable>
        )}

        {/* Botão de Atualizar / Recarregar */}
        {onRefresh && (
          <Pressable
            style={({ pressed }) => [
              styles.ctrlBtn,
              styles.elevatedBtn,
              pressed && styles.btnPressed,
            ]}
            onPress={onRefresh}
            hitSlop={6}
          >
            <Text style={styles.btnIcon}>🔄</Text>
          </Pressable>
        )}
      </View>

      {/* Middle/Bottom right zoom & GPS group */}
      <View style={styles.bottomRightGroup} pointerEvents="box-none">
        <View style={styles.dock}>
          {/* Seguir GPS / Centralizar na Posição */}
          <Pressable
            style={({ pressed }) => [
              styles.dockBtn,
              followGPS && { backgroundColor: colors.primary },
              pressed && styles.btnPressed,
            ]}
            onPress={onToggleFollowGPS}
            hitSlop={6}
          >
            <Text
              style={[
                styles.dockBtnText,
                styles.gpsIcon,
                followGPS && { color: '#FFFFFF' },
              ]}
            >
              ⌖
            </Text>
          </Pressable>

          <View style={styles.divider} />

          {/* Zoom In (+) */}
          <Pressable
            style={({ pressed }) => [styles.dockBtn, pressed && styles.btnPressed]}
            onPress={onZoomIn}
            hitSlop={6}
          >
            <Text style={styles.dockBtnText}>+</Text>
          </Pressable>

          <View style={styles.divider} />

          {/* Zoom Out (−) */}
          <Pressable
            style={({ pressed }) => [styles.dockBtn, pressed && styles.btnPressed]}
            onPress={onZoomOut}
            hitSlop={6}
          >
            <Text style={styles.dockBtnText}>−</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
    },
    topRightGroup: {
      position: 'absolute',
      top: 100,
      right: spacing.md,
      gap: spacing.sm,
      zIndex: 10,
    },
    bottomRightGroup: {
      position: 'absolute',
      bottom: 220,
      right: spacing.md,
      zIndex: 10,
    },
    ctrlBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.md,
    },
    elevatedBtn: {
      ...shadows.lg,
    },
    fitBtn: {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.primary + '55',
    },
    btnIcon: {
      fontSize: 19,
    },
    btnPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.94 }],
    },
    dock: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...shadows.lg,
    },
    dockBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dockBtnText: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '600',
    },
    gpsIcon: {
      fontSize: 22,
      fontWeight: '700',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 4,
    },
  });
