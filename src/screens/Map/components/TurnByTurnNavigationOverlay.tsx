import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  CornerUpRight,
  ArrowUp,
  RotateCcw,
  MapPin,
  X,
  TriangleAlert,
  Navigation,
  GitFork,
} from 'lucide-react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { radius, shadows, spacing } from '../../../theme';
import type { RouteStop, LngLat, GeoJSONFeatureCollection } from '../../../types/geo';

export type NavigationOrientationMode = 'course' | 'north';

interface ManeuverState {
  distanceText: string;
  instructionText: string;
  type: 'straight' | 'left' | 'right' | 'slight_left' | 'slight_right' | 'u_turn' | 'arrive';
  nextInstructionText?: string;
  nextType?: 'straight' | 'left' | 'right' | 'slight_left' | 'slight_right' | 'u_turn' | 'arrive';
}

function fastDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * 111139;
  const avgLat = ((lat1 + lat2) * Math.PI) / 360;
  const dLon = (lon2 - lon1) * 111139 * Math.cos(avgLat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function calculateBearing(start: [number, number], end: [number, number]): number {
  const startLat = (start[1] * Math.PI) / 180;
  const startLng = (start[0] * Math.PI) / 180;
  const endLat = (end[1] * Math.PI) / 180;
  const endLng = (end[0] * Math.PI) / 180;
  const dLng = endLng - startLng;
  const y = Math.sin(dLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function normalizeAngle(diff: number): number {
  let angle = diff;
  while (angle < -180) angle += 360;
  while (angle > 180) angle -= 360;
  return angle;
}

function renderManeuverIcon(type: ManeuverState['type'], size = 38) {
  switch (type) {
    case 'left':
    case 'slight_left':
      return <CornerUpLeft size={size} color="#FFFFFF" strokeWidth={3.2} />;
    case 'right':
    case 'slight_right':
      return <CornerUpRight size={size} color="#FFFFFF" strokeWidth={3.2} />;
    case 'u_turn':
      return <RotateCcw size={size} color="#FFFFFF" strokeWidth={3} />;
    case 'arrive':
      return <MapPin size={size} color="#FFFFFF" strokeWidth={3} />;
    default:
      return <ArrowUp size={size} color="#FFFFFF" strokeWidth={3.5} />;
  }
}

interface TurnByTurnNavigationOverlayProps {
  nextStop: RouteStop | null;
  routeDistanceM: number;
  routeDurationS: number;
  currentLocation: LngLat | null;
  route?: GeoJSONFeatureCollection | null;
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
  currentLocation,
  route,
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

  const maneuver: ManeuverState = useMemo(() => {
    const coords = (route?.features?.[0]?.geometry?.coordinates as LngLat[]) || [];
    if (!coords || coords.length < 2 || !currentLocation) {
      const distStr =
        routeDistanceM >= 1000
          ? `${(routeDistanceM / 1000).toFixed(1).replace('.', ',')} km`
          : `${Math.round(routeDistanceM)} m`;
      return {
        distanceText: distStr,
        instructionText: 'Siga em frente no percurso',
        type: 'straight',
      };
    }

    // 1. Achar o segmento mais próximo da posição GPS atual
    let closestIdx = 0;
    let minDistance = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = fastDistance(currentLocation[0], currentLocation[1], coords[i][0], coords[i][1]);
      if (d < minDistance) {
        minDistance = d;
        closestIdx = i;
      }
    }

    // Distância total restante até o destino
    let distRemaining = fastDistance(
      currentLocation[0],
      currentLocation[1],
      coords[closestIdx][0],
      coords[closestIdx][1],
    );
    for (let i = closestIdx; i < coords.length - 1; i++) {
      distRemaining += fastDistance(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
    }

    if (distRemaining <= 45) {
      return {
        distanceText: `${Math.round(distRemaining)} m`,
        instructionText: 'Você está chegando ao destino',
        type: 'arrive',
      };
    }

    // 2. Procurar a primeira curva significativa (deflexão angular >= 28 graus)
    let firstTurnIdx = -1;
    let firstTurnAngle = 0;
    let distToFirstTurn = fastDistance(
      currentLocation[0],
      currentLocation[1],
      coords[closestIdx][0],
      coords[closestIdx][1],
    );

    for (let i = closestIdx; i < coords.length - 2; i++) {
      const seg1 = calculateBearing(coords[i], coords[i + 1]);
      const seg2 = calculateBearing(coords[i + 1], coords[i + 2]);
      const diff = normalizeAngle(seg2 - seg1);
      distToFirstTurn += fastDistance(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);

      if (Math.abs(diff) >= 28) {
        firstTurnIdx = i + 1;
        firstTurnAngle = diff;
        break;
      }
    }

    // Se nenhuma curva expressiva à frente no trecho
    if (firstTurnIdx === -1 || distToFirstTurn > 1500) {
      const distStr =
        distRemaining >= 1000
          ? `${(distRemaining / 1000).toFixed(1).replace('.', ',')} km`
          : `${Math.round(distRemaining)} m`;
      return {
        distanceText: distStr,
        instructionText: 'Siga em frente na via',
        type: 'straight',
      };
    }

    const distTurnStr =
      distToFirstTurn >= 1000
        ? `${(distToFirstTurn / 1000).toFixed(1).replace('.', ',')} km`
        : `${Math.round(distToFirstTurn / 10) * 10} m`;

    let turnType: ManeuverState['type'] = 'straight';
    let turnAction = '';

    if (firstTurnAngle > 135 || firstTurnAngle < -135) {
      turnType = 'u_turn';
      turnAction = 'Faça o retorno';
    } else if (firstTurnAngle > 75) {
      turnType = 'right';
      turnAction = 'Vire à direita';
    } else if (firstTurnAngle > 28) {
      turnType = 'slight_right';
      turnAction = 'Curva suave à direita';
    } else if (firstTurnAngle < -75) {
      turnType = 'left';
      turnAction = 'Vire à esquerda';
    } else {
      turnType = 'slight_left';
      turnAction = 'Curva suave à esquerda';
    }

    let instruction = '';
    if (distToFirstTurn <= 30) {
      instruction = `${turnAction} agora`;
    } else if (distToFirstTurn <= 500) {
      instruction = `A ${distTurnStr}, ${turnAction.toLowerCase()}`;
    } else {
      instruction = `Siga em frente, a ${distTurnStr} ${turnAction.toLowerCase()}`;
    }

    // 3. Procurar próxima manobra (sub-banner "Depois,")
    let nextTurnAngle = 0;
    let nextAction = '';
    let nextType: ManeuverState['type'] | undefined = undefined;

    if (firstTurnIdx !== -1) {
      for (let j = firstTurnIdx; j < Math.min(coords.length - 2, firstTurnIdx + 20); j++) {
        const segA = calculateBearing(coords[j], coords[j + 1]);
        const segB = calculateBearing(coords[j + 1], coords[j + 2]);
        const diffB = normalizeAngle(segB - segA);
        if (Math.abs(diffB) >= 28) {
          nextTurnAngle = diffB;
          break;
        }
      }

      if (nextTurnAngle !== 0) {
        if (nextTurnAngle > 135 || nextTurnAngle < -135) {
          nextType = 'u_turn';
          nextAction = 'faça o retorno';
        } else if (nextTurnAngle > 75) {
          nextType = 'right';
          nextAction = 'vire à direita';
        } else if (nextTurnAngle > 28) {
          nextType = 'slight_right';
          nextAction = 'curva à direita';
        } else if (nextTurnAngle < -75) {
          nextType = 'left';
          nextAction = 'vire à esquerda';
        } else {
          nextType = 'slight_left';
          nextAction = 'curva à esquerda';
        }
      }
    }

    return {
      distanceText: distTurnStr,
      instructionText: instruction,
      type: turnType,
      nextInstructionText: nextAction ? `Depois, ${nextAction}` : undefined,
      nextType,
    };
  }, [route, currentLocation, routeDistanceM]);

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
            {renderManeuverIcon(maneuver.type, 38)}
          </View>

          <View style={styles.maneuverInfoCol}>
            <Text style={styles.maneuverDistance}>{maneuver.distanceText}</Text>
            <Text style={styles.maneuverStreet} numberOfLines={1}>
              {maneuver.instructionText}
            </Text>
            {destinationText ? (
              <Text style={styles.maneuverBairro} numberOfLines={1}>
                {destinationText}{bairroText ? ` • ${bairroText}` : ''}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Sub-banner "Depois, ↰" */}
        {maneuver.nextInstructionText ? (
          <View style={styles.subBannerPill}>
            <Text style={styles.subBannerText}>{maneuver.nextInstructionText}</Text>
            {renderManeuverIcon(maneuver.nextType || 'straight', 16)}
          </View>
        ) : null}
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
