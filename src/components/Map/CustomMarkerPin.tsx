import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, radius, shadows, typography } from '../../theme';
import type { DeliveryStatus } from '../../types/geo';

export interface CustomMarkerPinProps {
  sequenceNumber?: number | string;
  status?: DeliveryStatus;
  isActive?: boolean;
  isNext?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  count?: number;
}

export function CustomMarkerPin({
  sequenceNumber = 1,
  status = 'pending',
  isActive = false,
  isNext = false,
  isCompleted = false,
  isFailed = false,
  count = 1,
}: CustomMarkerPinProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (isNext || isActive) {
      const pulseLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.45,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.6,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    }
  }, [isNext, isActive, pulseAnim, pulseOpacity]);

  // Determine colors based on status
  let bgColor = colors.primary; // Blue for pending
  let iconContent: React.ReactNode = (
    <Text style={styles.numberText}>{sequenceNumber}</Text>
  );

  if (isCompleted || status === 'completed') {
    bgColor = colors.success; // Green for completed
    iconContent = <Text style={styles.iconText}>✓</Text>;
  } else if (isFailed || status === 'failed') {
    bgColor = colors.danger; // Red for failed
    iconContent = <Text style={styles.iconText}>✕</Text>;
  } else if (isNext) {
    bgColor = '#2563EB'; // Vibrant royal blue with pulse
    iconContent = (
      <Text style={[styles.numberText, styles.nextNumberText]}>
        {sequenceNumber}
      </Text>
    );
  } else if (isActive) {
    bgColor = colors.warning; // Amber for currently selected stop
    iconContent = (
      <Text style={[styles.numberText, styles.activeNumberText]}>
        {sequenceNumber}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {/* Pulse effect for next / active stop */}
      {(isNext || isActive) && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              backgroundColor: isNext ? colors.primary : colors.warning,
              transform: [{ scale: pulseAnim }],
              opacity: pulseOpacity,
            },
          ]}
        />
      )}

      {/* Main Rectangular Pin Badge */}
      <View
        style={[
          styles.badge,
          { backgroundColor: bgColor },
          (isNext || isActive) && styles.badgeElevated,
          isActive && styles.badgeActiveBorder,
        ]}
      >
        {iconContent}

        {/* Multiple deliveries badge on same stop */}
        {count > 1 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
      </View>

      {/* Downward triangle pointer / caret pointing precisely to coordinate */}
      <View style={[styles.caret, { borderTopColor: bgColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 48,
  },
  pulseRing: {
    position: 'absolute',
    top: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    zIndex: 1,
  },
  badge: {
    minWidth: 32,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    flexDirection: 'row',
    zIndex: 2,
    ...shadows.md,
  },
  badgeElevated: {
    minWidth: 36,
    height: 30,
    paddingHorizontal: 8,
    borderWidth: 2.5,
    ...shadows.lg,
  },
  badgeActiveBorder: {
    borderColor: '#FEF08A', // Light gold ring
  },
  caret: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
    zIndex: 2,
  },
  numberText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  nextNumberText: {
    fontSize: 14,
    fontWeight: '900',
  },
  activeNumberText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E293B',
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 10,
    ...shadows.sm,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
