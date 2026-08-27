import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { shadows } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import type { DeliveryStatus } from '../../types/geo';
import { Check, X } from 'lucide-react-native';

export interface CustomMarkerPinProps {
  sequenceNumber?: number | string;
  status?: DeliveryStatus;
  isActive?: boolean;
  isNext?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  isLassoSelected?: boolean;
  count?: number;
}

export function CustomMarkerPin({
  sequenceNumber = 1,
  status = 'pending',
  isActive = false,
  isNext = false,
  isCompleted = false,
  isFailed = false,
  isLassoSelected = false,
  count = 1,
}: CustomMarkerPinProps) {
  const { colors } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  // Formata o número da parada como 2 dígitos (ex: 01, 02, 06...)
  const formattedNumber =
    typeof sequenceNumber === 'number'
      ? String(sequenceNumber).padStart(2, '0')
      : String(sequenceNumber);

  const isCurrentActive = isNext || isActive;

  useEffect(() => {
    if (isCurrentActive) {
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
  }, [isCurrentActive, pulseAnim, pulseOpacity]);

  // Esquema de Cores:
  // - Selecionado pelo Laço: Roxo vibrante (#7C3AED) com borda (#6D28D9) e texto branco (Screenshot 2)
  // - Parada Atual (isCurrentActive): Azul Escuro (#1D4ED8) com texto branco
  // - Paradas Restantes: Azul Claro (#DBEAFE) com borda azul (#3B82F6) e texto azul escuro
  // - Concluídas: Verde Esmeralda (#10B981)
  // - Falhas: Vermelho (#EF4444)
  let bgColor = '#DBEAFE';
  let borderColor = '#3B82F6';
  let textColor = '#1D4ED8';
  let caretColor = '#3B82F6';

  if (isLassoSelected) {
    bgColor = '#7C3AED';
    borderColor = '#A78BFA';
    caretColor = '#7C3AED';
    textColor = '#FFFFFF';
  } else if (isCompleted || status === 'completed') {
    bgColor = colors.success;
    borderColor = colors.success;
    caretColor = colors.success;
    textColor = '#FFFFFF';
  } else if (isFailed || status === 'failed') {
    bgColor = colors.danger;
    borderColor = colors.danger;
    caretColor = colors.danger;
    textColor = '#FFFFFF';
  } else if (isCurrentActive) {
    bgColor = '#1D4ED8';
    borderColor = '#1E3A8A';
    caretColor = '#1D4ED8';
    textColor = '#FFFFFF';
  }

  return (
    <View style={styles.container}>
      {/* Pulse effect para a parada atual / ativa */}
      {isCurrentActive && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              backgroundColor: '#1D4ED8',
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
          isCurrentActive && styles.badgeActive,
        ]}
      >
        {isCompleted || status === 'completed' ? (
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        ) : isFailed || status === 'failed' ? (
          <X size={14} color="#FFFFFF" strokeWidth={3} />
        ) : (
          <Text
            style={[
              styles.numberText,
              { color: textColor },
              isCurrentActive && styles.numberTextFilled,
            ]}
          >
            {formattedNumber}
          </Text>
        )}

        {/* Badge contador quando há mais de 1 entrega no mesmo endereço */}
        {count > 1 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
      </View>

      {/* Ponteiro para coordenada exata */}
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
