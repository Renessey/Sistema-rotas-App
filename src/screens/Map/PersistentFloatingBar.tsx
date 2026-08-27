import React from 'react';
import { Animated, Pressable, Text, ActivityIndicator, Alert } from 'react-native';
import { Zap, Check } from 'lucide-react-native';
import { createScreenStyles } from './MapScreenStyles';
import { useTheme } from '../../theme/ThemeContext';

interface PersistentFloatingBarProps {
  sheetTranslateY: Animated.Value;
  snapExpandedBottom: number;
  routeNeedsOptimization: boolean;
  optimizing: boolean;
  onOptimize: () => void;
}

export function PersistentFloatingBar({
  sheetTranslateY,
  snapExpandedBottom,
  routeNeedsOptimization,
  optimizing,
  onOptimize,
}: PersistentFloatingBarProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createScreenStyles(colors), [colors]);

  const handleFinishRoute = () => {
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

  return (
    <Animated.View
      style={[
        styles.persistentFloatingBar,
        {
          bottom: snapExpandedBottom + 12,
          transform: [{ translateY: sheetTranslateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={({ pressed }) => [
          styles.floatingOptBtn,
          routeNeedsOptimization && styles.floatingOptBtnActive,
          pressed && styles.btnPressed,
        ]}
        onPress={onOptimize}
        disabled={optimizing}
      >
        {optimizing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Zap size={16} color="#FFFFFF" />
            <Text style={styles.floatingOptBtnText}>
              {routeNeedsOptimization ? 'Otimizar Rota' : 'Reotimizar'}
            </Text>
          </>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.floatingFinishBtn, pressed && styles.btnPressed]}
        onPress={handleFinishRoute}
      >
        <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
        <Text style={styles.floatingFinishBtnText}>Finalizar</Text>
      </Pressable>
    </Animated.View>
  );
}
