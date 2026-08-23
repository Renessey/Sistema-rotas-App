import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows } from '../../theme';

export interface FloatingMapControlsProps {
  followGPS: boolean;
  hasRoute: boolean;
  onOpenLayers: () => void;
  onFitBounds?: () => void;
  onToggleFollowGPS: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onRefresh?: () => void;
}

export function FloatingMapControls({
  followGPS,
  onOpenLayers,
  onToggleFollowGPS,
}: FloatingMapControlsProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.floatingStack} pointerEvents="box-none">
        {/* GPS Centering / Location Target Button (Photo 2) */}
        <Pressable
          style={({ pressed }) => [
            styles.floatingBtn,
            followGPS && styles.floatingBtnActive,
            pressed && styles.btnPressed,
          ]}
          onPress={onToggleFollowGPS}
          hitSlop={8}
        >
          <Text style={[styles.btnIcon, followGPS && styles.btnIconActive]}>
            🎯
          </Text>
        </Pressable>

        {/* Map Layers / Style Button (Photo 2) */}
        <Pressable
          style={({ pressed }) => [
            styles.floatingBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={onOpenLayers}
          hitSlop={8}
        >
          <Text style={styles.btnIcon}>🗺️</Text>
        </Pressable>
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
      bottom: 270,
      gap: spacing.sm + 2,
      zIndex: 20,
    },
    floatingBtn: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#E2E8F0',
      ...shadows.md,
    },
    floatingBtnActive: {
      backgroundColor: '#2563EB',
      borderColor: '#1D4ED8',
    },
    btnIcon: {
      fontSize: 20,
      color: themeColors.text,
    },
    btnIconActive: {
      color: '#FFFFFF',
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.95 }],
    },
  });
