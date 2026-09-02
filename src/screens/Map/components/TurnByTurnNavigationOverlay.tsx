import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CornerUpLeft,
  X,
  Search,
  Volume2,
  VolumeX,
  Mic,
  TriangleAlert,
  Navigation,
  GitFork,
} from 'lucide-react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { radius, shadows, spacing } from '../../../theme';
import type { RouteStop, LngLat } from '../../../types/geo';

export type NavigationOrientationMode = 'course' | 'north';

interface TurnByTurnNavigationOverlayProps {
  nextStop: RouteStop | null;
  routeDistanceM: number;
  routeDurationS: number;
  currentLocation: LngLat | null;
  orientationMode: NavigationOrientationMode;
  currentHeading: number | null;
  onToggleOrientation: () => void;
  onExitNavigation: () => void;
  onRecenter: () => void;
  onFitRouteOverview: () => void;
  onToggleMute?: () => void;
  onSearchPress?: () => void;
  onReportPress?: () => void;
}

export function TurnByTurnNavigationOverlay({
  nextStop,
  routeDistanceM,
  routeDurationS,
  orientationMode,
  currentHeading,
  onToggleOrientation,
  onExitNavigation,
  onRecenter,
  onFitRouteOverview,
  onToggleMute,
  onSearchPress,
  onReportPress,
}: TurnByTurnNavigationOverlayProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [isMuted, setIsMuted] = useState(false);

  // Calcula tempo estimado de chegada (ETA)
  const [etaString, setEtaString] = useState('');
  const durationMin = Math.max(1, Math.round(routeDurationS / 60));
  const distanceKm = (routeDistanceM / 1000).toFixed(1).replace('.', ',');

  useEffect(() => {
    const now = new Date();
    const arrivalTime = new Date(now.getTime() + routeDurationS * 1000);
    const hours = arrivalTime.getHours().toString().padStart(2, '0');
    const mins = arrivalTime.getMinutes().toString().padStart(2, '0');
    setEtaString(`${hours}:${mins}`);
  }, [routeDurationS]);

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
    onToggleMute?.();
  };

  const handleReport = () => {
    if (onReportPress) {
      onReportPress();
    } else {
      Alert.alert('Reportar Ocorrência', 'Selecione o tipo de evento na via:', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Tráfego Intenso' },
        { text: 'Via Bloqueada / Obras' },
        { text: 'Radar / Polícia' },
      ]);
    }
  };

  const destinationText = nextStop?.address || nextStop?.deliveries[0]?.destination || 'Destino';
  const bairroText = nextStop?.bairro || nextStop?.city || '';

  // Agulha da bússola: em 'course' ela aponta para o norte magnético relativo, em 'north' aponta para cima (0°)
  const compassAngle = orientationMode === 'north' ? 0 : -(currentHeading || 0);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ── 1. Top Navigation Maneuver Banner (Dark Teal / Forest Green) ── */}
      <View style={[styles.topBannerContainer, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <View style={styles.topBannerMain}>
          <View style={styles.maneuverIconCol}>
            <CornerUpLeft size={38} color="#FFFFFF" strokeWidth={3.2} />
          </View>

          <View style={styles.maneuverInfoCol}>
            <Text style={styles.maneuverDistance}>170 m</Text>
            <Text style={styles.maneuverStreet} numberOfLines={1}>
              {destinationText}
            </Text>
            {bairroText ? (
              <Text style={styles.maneuverBairro} numberOfLines={1}>
                {bairroText}
              </Text>
            ) : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.micCircle, pressed && styles.btnPressed]}
            hitSlop={8}
            onPress={() => Alert.alert('Comando de Voz', 'Fale o endereço ou comando desejado.')}
          >
            <Mic size={22} color="#0284C7" strokeWidth={2.5} />
          </Pressable>
        </View>

        {/* Sub-banner "Depois, ↰" */}
        <View style={styles.subBannerPill}>
          <Text style={styles.subBannerText}>Depois,</Text>
          <CornerUpLeft size={16} color="#FFFFFF" strokeWidth={3} />
        </View>
      </View>

      {/* ── 2. Right Floating Action Column ── */}
      <View style={[styles.rightFloatingCol, { top: Math.max(insets.top, 12) + 140 }]}>
        {/* Compass Button (Alterna Norte para Cima vs Seguir Curso) */}
        <Pressable
          style={({ pressed }) => [
            styles.roundControlBtn,
            styles.compassBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={onToggleOrientation}
          hitSlop={8}
          accessibilityLabel="Alternar orientação do mapa: Norte ou Curso"
        >
          {/* Agulha de Bússola estilizada Foto 2 (Metade Vermelha Norte / Metade Branca Sul) */}
          <View style={[styles.compassNeedleWrap, { transform: [{ rotate: `${compassAngle}deg` }] }]}>
            <View style={styles.needleNorth} />
            <View style={styles.needleSouth} />
          </View>
          {orientationMode === 'north' && (
            <View style={styles.northIndicatorDot}>
              <Text style={styles.northIndicatorText}>N</Text>
            </View>
          )}
        </Pressable>

        {/* Search Button */}
        <Pressable
          style={({ pressed }) => [styles.roundControlBtn, pressed && styles.btnPressed]}
          onPress={onSearchPress || (() => Alert.alert('Buscar no Percurso', 'Pesquisar postos, paradas ou vias.'))}
          hitSlop={8}
        >
          <Search size={22} color="#334155" strokeWidth={2.2} />
        </Pressable>

        {/* Audio / Mute Button */}
        <Pressable
          style={({ pressed }) => [styles.roundControlBtn, pressed && styles.btnPressed]}
          onPress={handleMuteToggle}
          hitSlop={8}
        >
          {isMuted ? (
            <VolumeX size={22} color="#94A3B8" strokeWidth={2.2} />
          ) : (
            <Volume2 size={22} color="#334155" strokeWidth={2.2} />
          )}
        </Pressable>
      </View>

      {/* ── 3. Bottom Floating Controls (Recentralizar & Reportar) ── */}
      <View style={[styles.bottomFloatingRow, { bottom: Math.max(insets.bottom, 10) + 105 }]}>
        <Pressable
          style={({ pressed }) => [styles.floatingPillBtn, pressed && styles.btnPressed]}
          onPress={onRecenter}
        >
          <Navigation size={18} color="#0D9488" fill="#0D9488" />
          <Text style={styles.floatingPillTextRecentralizar}>Recentralizar</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.floatingPillBtn, pressed && styles.btnPressed]}
          onPress={handleReport}
        >
          <TriangleAlert size={18} color="#D97706" />
          <Text style={styles.floatingPillTextReportar}>Reportar</Text>
        </Pressable>
      </View>

      {/* ── 4. Bottom Navigation Bar (White Card) ── */}
      <View style={[styles.bottomNavBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {/* Handle pill bar */}
        <View style={styles.bottomHandleBar} />

        <View style={styles.bottomNavRow}>
          {/* Close / Exit Button */}
          <Pressable
            style={({ pressed }) => [styles.navCircleBtn, pressed && styles.btnPressed]}
            onPress={onExitNavigation}
            hitSlop={10}
            accessibilityLabel="Sair da navegação"
          >
            <X size={22} color="#475569" strokeWidth={2.5} />
          </Pressable>

          {/* Center Metric Text */}
          <View style={styles.navMetricsCenter}>
            <Text style={styles.navMinutesText}>{durationMin} min</Text>
            <Text style={styles.navSubInfoText}>
              {distanceKm} km  •  {etaString || '13:15'}
            </Text>
          </View>

          {/* Route Overview / Alternatives Button */}
          <Pressable
            style={({ pressed }) => [styles.navCircleBtn, pressed && styles.btnPressed]}
            onPress={onFitRouteOverview}
            hitSlop={10}
            accessibilityLabel="Visão geral da rota"
          >
            <GitFork size={22} color="#475569" strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBannerContainer: {
    position: 'absolute',
    top: 0,
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 100,
  },
  topBannerMain: {
    backgroundColor: '#005C53', // Dark Teal / Forest Green do Google Maps
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadows.xl,
    elevation: 10,
  },
  maneuverIconCol: {
    width: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  maneuverInfoCol: {
    flex: 1,
    gap: 1,
  },
  maneuverDistance: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  maneuverStreet: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  maneuverBairro: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  micCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  subBannerPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#042F2E',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.md,
    marginTop: 3,
    marginLeft: spacing.sm,
    ...shadows.sm,
  },
  subBannerText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  rightFloatingCol: {
    position: 'absolute',
    right: spacing.md,
    alignItems: 'center',
    gap: spacing.sm + 2,
    zIndex: 90,
  },
  roundControlBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
    elevation: 6,
  },
  compassBtn: {
    position: 'relative',
  },
  compassNeedleWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needleNorth: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#EF4444', // Red North pointer
  },
  needleSouth: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#94A3B8', // Gray/White South pointer
  },
  northIndicatorDot: {
    position: 'absolute',
    top: 3,
    alignSelf: 'center',
  },
  northIndicatorText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#EF4444',
  },
  bottomFloatingRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 90,
  },
  floatingPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 10,
    borderRadius: radius.full,
    gap: 6,
    ...shadows.md,
    elevation: 5,
  },
  floatingPillTextRecentralizar: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
  },
  floatingPillTextReportar: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  bottomNavBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: 8,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    ...shadows.xl,
    elevation: 12,
    zIndex: 100,
  },
  bottomHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 6,
  },
  bottomNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  navCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  navMetricsCenter: {
    alignItems: 'center',
    gap: 2,
  },
  navMinutesText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#10B981', // Emerald Green como na Foto 2
    letterSpacing: -0.5,
  },
  navSubInfoText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
