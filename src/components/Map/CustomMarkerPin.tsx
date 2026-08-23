import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, shadows } from '../../theme';
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

  // Format sequence number as two digits (e.g. 01, 02, 06, 07)
  const formattedNumber =
    typeof sequenceNumber === 'number'
      ? String(sequenceNumber).padStart(2, '0')
      : String(sequenceNumber);

  useEffect(() => {
    if (isNext || isActive) {
      const pulseLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.4,
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

  // Determine styles matching photos 1 & 2
  // Photos show:
  // - Next / Active / First stop (e.g. 01): Solid blue tag with white text
  // - Other pending stops (02, 06, 07...): White tag with blue border and blue text
  const isFilledBlue = isNext || isActive || formattedNumber === '01';

  let bgColor = '#FFFFFF';
  let borderColor = '#2563EB';
  let textColor = '#2563EB';
  let caretColor = '#2563EB';

  if (isCompleted || status === 'completed') {
    bgColor = colors.success;
    borderColor = colors.success;
    caretColor = colors.success;
    textColor = '#FFFFFF';
  } else if (isFailed || status === 'failed') {
    bgColor = colors.danger;
    borderColor = colors.danger;
    caretColor = colors.danger;
    textColor = '#FFFFFF';
  } else if (isFilledBlue) {
    bgColor = '#2563EB';
    borderColor = '#1D4ED8';
    caretColor = '#2563EB';
    textColor = '#FFFFFF';
  }

  return (
    <View style={styles.container}>
      {/* Pulse effect for next / active stop */}
      {(isNext || isActive) && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              backgroundColor: isNext ? '#2563EB' : colors.warning,
              transform: [{ scale: pulseAnim }],
              opacity: pulseOpacity,
            },
          ]}
        />
      )}

      {/* Tag Badge */}
      <View
        style={[
          styles.badge,
          {
            backgroundColor: bgColor,
            borderColor: borderColor,
          },
          (isNext || isActive) && styles.badgeActive,
        ]}
      >
        {isCompleted || status === 'completed' ? (
          <Text style={styles.iconText}>✓</Text>
        ) : isFailed || status === 'failed' ? (
          <Text style={styles.iconText}>✕</Text>
        ) : (
          <Text
            style={[
              styles.numberText,
              { color: textColor },
              isFilledBlue && styles.numberTextFilled,
            ]}
          >
            {formattedNumber}
          </Text>
        )}

        {/* Count badge for stacked stops */}
        {count > 1 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
      </View>

      {/* Pointer Caret pointing precisely to coordinates */}
      <View style={[styles.caret, { borderTopColor: caretColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 44,
  },
  pulseRing: {
    position: 'absolute',
    top: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    zIndex: 1,
  },
  badge: {
    minWidth: 34,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    zIndex: 2,
    ...shadows.md,
  },
  badgeActive: {
    minWidth: 38,
    height: 30,
    paddingHorizontal: 7,
    borderWidth: 2.5,
    ...shadows.lg,
  },
  caret: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
    zIndex: 2,
  },
  numberText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  numberTextFilled: {
    fontWeight: '900',
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
