import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, RotateCcw, PenTool, Hand, Clock, Package, Route } from 'lucide-react-native';
import LassoCanvas, { LassoCanvasRef } from '../../components/Map/LassoCanvas';
import { createScreenStyles } from './MapScreenStyles';
import { useTheme } from '../../theme/ThemeContext';

interface LassoOverlayProps {
  lassoPanHandlers: object;
  lassoSubMode: 'draw' | 'pan';
  lassoCanvasRef: React.RefObject<LassoCanvasRef | null>;
  routeInfoDuration: string;
  routeInfoDistance: string;
  completedCount: number;
  totalPackagesCount: number;
  onCancel: () => void;
  onUndo: () => void;
  onToggleMode: () => void;
  onConfirm: () => void;
}

export function LassoOverlay({
  lassoPanHandlers,
  lassoSubMode,
  lassoCanvasRef,
  routeInfoDuration,
  routeInfoDistance,
  completedCount,
  totalPackagesCount,
  onCancel,
  onUndo,
  onToggleMode,
  onConfirm,
}: LassoOverlayProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createScreenStyles(colors), [colors]);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.lassoOverlay]}
      pointerEvents="box-none"
    >
      {/* Active 1-Finger Drawing Canvas Layer */}
      <View
        {...lassoPanHandlers}
        style={StyleSheet.absoluteFill}
        pointerEvents={lassoSubMode === 'draw' ? 'auto' : 'none'}
      >
        {/* LassoCanvas atualiza o SVG via ref imperativo — sem re-render React */}
        <LassoCanvas ref={lassoCanvasRef} />
      </View>

      {/* Top HUD Bar */}
      <View style={[styles.lassoTopHud, { top: insets.top + 8 }]} pointerEvents="none">
        <View style={styles.lassoHudCol}>
          <Text style={styles.lassoHudLabel}>RESTANTE</Text>
          <View style={styles.lassoHudRow}>
            <Clock size={13} color="#818CF8" />
            <Text style={styles.lassoHudVal}>{routeInfoDuration}</Text>
          </View>
        </View>
        <View style={styles.lassoHudDivider} />
        <View style={styles.lassoHudCol}>
          <Text style={styles.lassoHudLabel}>ENTREGAS</Text>
          <View style={styles.lassoHudRow}>
            <Package size={13} color="#10B981" />
            <Text style={styles.lassoHudVal}>
              {completedCount}/{totalPackagesCount}
            </Text>
          </View>
        </View>
        <View style={styles.lassoHudDivider} />
        <View style={styles.lassoHudCol}>
          <Text style={styles.lassoHudLabel}>DIST.</Text>
          <View style={styles.lassoHudRow}>
            <Route size={13} color="#38BDF8" />
            <Text style={styles.lassoHudVal}>{routeInfoDistance}</Text>
          </View>
        </View>
      </View>

      {/* Bottom Floating Bar */}
      <View
        style={[styles.lassoBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}
        pointerEvents="box-none"
      >
        {/* Close Button */}
        <Pressable
          style={({ pressed }) => [styles.lassoRoundDarkBtn, pressed && styles.btnPressed]}
          onPress={onCancel}
          hitSlop={12}
        >
          <X size={22} color="#FFFFFF" />
        </Pressable>

        {/* Undo Button */}
        <Pressable
          style={({ pressed }) => [styles.lassoRoundWhiteBtn, pressed && styles.btnPressed]}
          onPress={onUndo}
          hitSlop={12}
        >
          <RotateCcw size={20} color="#0F172A" />
        </Pressable>

        {/* Mode Switch Button: Desenhar vs Mover Mapa */}
        <Pressable
          style={({ pressed }) => [
            styles.lassoToggleModeBtn,
            lassoSubMode === 'draw'
              ? styles.lassoToggleModeBtnDraw
              : styles.lassoToggleModeBtnPan,
            pressed && styles.btnPressed,
          ]}
          onPress={onToggleMode}
          hitSlop={8}
        >
          {lassoSubMode === 'draw' ? (
            <>
              <PenTool size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.lassoToggleModeText}>DESENHAR</Text>
            </>
          ) : (
            <>
              <Hand size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.lassoToggleModeText}>MOVER MAPA</Text>
            </>
          )}
        </Pressable>

        {/* Confirm & Optimize Button */}
        <Pressable
          style={({ pressed }) => [styles.lassoConfirmBtn, pressed && styles.btnPressed]}
          onPress={onConfirm}
          hitSlop={8}
        >
          <Text style={styles.lassoConfirmBtnText}>CONFIRMAR E OTIMIZAR</Text>
        </Pressable>
      </View>
    </View>
  );
}
