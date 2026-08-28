import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows } from '../../theme';
import { LocateFixed, Layers, Scissors } from 'lucide-react-native';

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
}

export function FloatingMapControls({
  followGPS,
  lassoMode = false,
  onOpenLayers,
  onToggleFollowGPS,
  onToggleLasso,
}: FloatingMapControlsProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.floatingStack} pointerEvents="box-none">
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
      bottom: 260,
      gap: spacing.sm + 2,
      zIndex: 20,
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
