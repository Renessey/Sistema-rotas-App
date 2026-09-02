import React from 'react';
import { Animated, Pressable, Text, ActivityIndicator, Alert } from 'react-native';
import { Zap, Check, Navigation } from 'lucide-react-native';
import { createScreenStyles } from '../MapScreenStyles';
import { useTheme } from '../../../theme/ThemeContext';

interface PersistentFloatingBarProps {
  sheetTranslateY: Animated.Value;
  snapExpandedBottom: number;
  routeNeedsOptimization: boolean;
  optimizing: boolean;
  hasRoute?: boolean;
  onOptimize: () => void;
  onStartNavigation?: () => void;
  onFinishRoute?: () => void;
}

export function PersistentFloatingBar({
  sheetTranslateY,
  snapExpandedBottom,
  routeNeedsOptimization,
  optimizing,
  hasRoute = false,
  onOptimize,
  onStartNavigation,
  onFinishRoute,
}: PersistentFloatingBarProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createScreenStyles(colors), [colors]);

  const handleFinishRoute = () => {
    if (onFinishRoute) {
      onFinishRoute();
      return;
    }
    Alert.alert(
      'Finalizar Rota',
      'Deseja concluir o itinerário da rota atual?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Sucesso', 'Rota finalizada com sucesso!');
          },
        },
      ],
    );
  };

  const showStartBtn = hasRoute && !routeNeedsOptimization;

  return (
    <Animated.View
      style={[
        styles.persistentFloatingBar,
        {
          bottom: snapExpandedBottom + 48,
          transform: [{ translateY: sheetTranslateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Botão Otimizar / Reotimizar */}
      <Pressable
        style={({ pressed }) => [
          styles.floatingOptBtn,
          routeNeedsOptimization && styles.floatingOptBtnActive,
          showStartBtn && { flex: 1 },
          pressed && styles.btnPressed,
        ]}
        onPress={onOptimize}
        disabled={optimizing}
      >
        {optimizing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Zap size={15} color="#FFFFFF" />
            <Text style={styles.floatingOptBtnText} numberOfLines={1}>
              {routeNeedsOptimization ? 'Otimizar' : 'Reotimizar'}
            </Text>
          </>
        )}
      </Pressable>

      {/* Botão Começar (Navegação Ativa) */}
      {showStartBtn && (
        <Pressable
          style={({ pressed }) => [
            styles.floatingStartBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={onStartNavigation}
        >
          <Navigation size={15} color="#FFFFFF" fill="#FFFFFF" />
          <Text style={styles.floatingStartBtnText}>Começar</Text>
        </Pressable>
      )}

      {/* Botão Finalizar */}
      <Pressable
        style={({ pressed }) => [
          styles.floatingFinishBtn,
          showStartBtn && { flex: 0.9 },
          pressed && styles.btnPressed,
        ]}
        onPress={handleFinishRoute}
      >
        <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
        <Text style={styles.floatingFinishBtnText}>Finalizar</Text>
      </Pressable>
    </Animated.View>
  );
}
