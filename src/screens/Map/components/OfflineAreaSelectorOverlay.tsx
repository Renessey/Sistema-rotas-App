/**
 * OfflineAreaSelectorOverlay.tsx
 *
 * Overlay interativo sobre o mapa para seleção manual de área para download offline.
 * Mostra uma moldura de enquadramento (viewfinder) com máscara escura semi-transparente,
 * estatísticas em tempo real (zoom, tiles estimados, MB) e botão de confirmação.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Modal,
  TextInput,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Download,
  X,
  LocateFixed,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  ZoomIn,
  Layers,
  MapPin,
} from 'lucide-react-native';
import type { MapRef } from '@maplibre/maplibre-react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { radius, shadows, spacing } from '../../../theme';
import {
  estimateTileCount,
  estimateSizeMB,
  formatBytes,
  OFFLINE_MIN_ZOOM,
  OFFLINE_MAX_ZOOM,
  OFFLINE_TILE_LIMIT,
} from '../../../services/OfflineMapService';
import type { LngLat } from '../../../types/geo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface OfflineAreaSelectorOverlayProps {
  visible: boolean;
  mapRef: React.RefObject<MapRef | null>;
  currentLocation: LngLat | null;
  onCenterUser?: () => void;
  onCancel: () => void;
  onConfirmArea: (name: string, bounds: [number, number, number, number]) => void;
  currentZoom?: number;
}

export function OfflineAreaSelectorOverlay({
  visible,
  mapRef,
  currentLocation,
  onCenterUser,
  onCancel,
  onConfirmArea,
  currentZoom = 13,
}: OfflineAreaSelectorOverlayProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Dimensões do quadro de seleção (viewfinder)
  const FRAME_MARGIN_X = 22;
  const FRAME_TOP = Math.max(insets.top, 16) + 105;
  const FRAME_BOTTOM = Math.max(insets.bottom, 16) + 120;
  const FRAME_WIDTH = SCREEN_WIDTH - FRAME_MARGIN_X * 2;
  const FRAME_HEIGHT = SCREEN_HEIGHT - FRAME_TOP - FRAME_BOTTOM;

  // Estado das métricas da área enquadrada
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [tileCount, setTileCount] = useState<number>(0);
  const [sizeMB, setSizeMB] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(currentZoom);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [regionName, setRegionName] = useState<string>('');

  // Animação de pulso na borda
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.65, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [visible, pulseAnim]);

  // Função para recalcular o Bounding Box do quadro na tela
  const calculateFrameBounds = useCallback(async () => {
    if (!mapRef.current) return;
    try {
      const x1 = FRAME_MARGIN_X;
      const y1 = FRAME_TOP;
      const x2 = FRAME_MARGIN_X + FRAME_WIDTH;
      const y2 = FRAME_TOP + FRAME_HEIGHT;

      // Desprojeta os cantos opostos da moldura na tela para coordenadas geográficas
      const p1 = await mapRef.current.unproject([x1, y1]);
      const p2 = await mapRef.current.unproject([x2, y2]);

      let zoom = currentZoom;
      try {
        zoom = await mapRef.current.getZoom();
        setZoomLevel(zoom);
      } catch {}

      if (p1 && p2) {
        const west = Math.min(p1[0], p2[0]);
        const east = Math.max(p1[0], p2[0]);
        const south = Math.min(p1[1], p2[1]);
        const north = Math.max(p1[1], p2[1]);

        const newBounds: [number, number, number, number] = [west, south, east, north];
        setBounds(newBounds);

        const tiles = estimateTileCount(newBounds, OFFLINE_MIN_ZOOM, OFFLINE_MAX_ZOOM);
        setTileCount(tiles);
        setSizeMB(estimateSizeMB(tiles));
      }
    } catch {
      // Fallback para getBounds() completo
      try {
        const b = await mapRef.current.getBounds();
        if (b) {
          const newBounds = b as [number, number, number, number];
          setBounds(newBounds);
          const tiles = estimateTileCount(newBounds, OFFLINE_MIN_ZOOM, OFFLINE_MAX_ZOOM);
          setTileCount(tiles);
          setSizeMB(estimateSizeMB(tiles));
        }
      } catch {}
    }
  }, [mapRef, FRAME_MARGIN_X, FRAME_TOP, FRAME_WIDTH, FRAME_HEIGHT, currentZoom]);

  // Atualiza no início e a cada intervalo enquanto visível
  useEffect(() => {
    if (!visible) {
      setShowConfirmModal(false);
      return;
    }
    calculateFrameBounds();
    const interval = setInterval(calculateFrameBounds, 600);
    return () => clearInterval(interval);
  }, [visible, calculateFrameBounds]);

  if (!visible) return null;

  const isOverLimit = tileCount > OFFLINE_TILE_LIMIT;
  const isZoomTooFar = zoomLevel < 9.5;
  const isInvalid = !bounds || isOverLimit || isZoomTooFar;

  const handleOpenConfirm = () => {
    if (isInvalid) return;
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1)
      .toString()
      .padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
    setRegionName(`Mapa Offline ${dateStr}`);
    setShowConfirmModal(true);
  };

  const handleFinalConfirm = () => {
    if (!bounds) return;
    const name = regionName.trim() || `Mapa Offline ${Date.now()}`;
    setShowConfirmModal(false);
    onConfirmArea(name, bounds);
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* ── 1. Máscaras Escuras ao Redor do Quadro ── */}
      {/* Topo */}
      <View
        style={[styles.scrim, { top: 0, left: 0, right: 0, height: FRAME_TOP }]}
        pointerEvents="none"
      />
      {/* Rodapé */}
      <View
        style={[styles.scrim, { bottom: 0, left: 0, right: 0, height: FRAME_BOTTOM }]}
        pointerEvents="none"
      />
      {/* Lateral Esquerda */}
      <View
        style={[
          styles.scrim,
          { top: FRAME_TOP, left: 0, width: FRAME_MARGIN_X, height: FRAME_HEIGHT },
        ]}
        pointerEvents="none"
      />
      {/* Lateral Direita */}
      <View
        style={[
          styles.scrim,
          { top: FRAME_TOP, right: 0, width: FRAME_MARGIN_X, height: FRAME_HEIGHT },
        ]}
        pointerEvents="none"
      />

      {/* ── 2. Moldura de Seleção Central (Viewfinder) ── */}
      <View
        style={[
          styles.viewfinder,
          {
            top: FRAME_TOP,
            left: FRAME_MARGIN_X,
            width: FRAME_WIDTH,
            height: FRAME_HEIGHT,
            borderColor: isInvalid ? '#EF4444' : '#3B82F6',
          },
        ]}
        pointerEvents="none"
      >
        {/* Cantoneiras estilizadas (High-Tech Reticle) */}
        <View style={[styles.cornerTL, { borderColor: isInvalid ? '#EF4444' : '#60A5FA' }]} />
        <View style={[styles.cornerTR, { borderColor: isInvalid ? '#EF4444' : '#60A5FA' }]} />
        <View style={[styles.cornerBL, { borderColor: isInvalid ? '#EF4444' : '#60A5FA' }]} />
        <View style={[styles.cornerBR, { borderColor: isInvalid ? '#EF4444' : '#60A5FA' }]} />

        {/* Cruz central de mira */}
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />

        {/* Badge do Quadro */}
        <Animated.View
          style={[
            styles.viewfinderBadge,
            {
              opacity: pulseAnim,
              backgroundColor: isInvalid ? 'rgba(239, 68, 68, 0.85)' : 'rgba(37, 99, 235, 0.85)',
            },
          ]}
        >
          <Text style={styles.viewfinderBadgeText}>
            {isInvalid ? 'ÁREA MUITO GRANDE' : 'ÁREA SELECIONADA'}
          </Text>
        </Animated.View>
      </View>

      {/* ── 3. HUD Superior Flutuante ── */}
      <View
        style={[styles.topHUD, { paddingTop: Math.max(insets.top, 12) }]}
        pointerEvents="box-none"
      >
        <View style={styles.topHUDCard}>
          <View style={styles.topHUDHeader}>
            <View style={styles.topHUDTitleWrap}>
              <View style={styles.topHUDIconBadge}>
                <MapPin size={16} color="#3B82F6" strokeWidth={2.4} />
              </View>
              <View>
                <Text style={styles.topHUDTitle}>SELECIONE A ÁREA NO MAPA</Text>
                <Text style={styles.topHUDSub}>
                  Mova e dê zoom para enquadrar sua região de entregas
                </Text>
              </View>
            </View>

            <Pressable style={styles.hudCloseBtn} onPress={onCancel} hitSlop={8}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Métricas em Tempo Real */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>ZOOM</Text>
              <Text style={styles.metricVal}>{zoomLevel.toFixed(1)}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>TILES ESTIMADOS</Text>
              <Text
                style={[
                  styles.metricVal,
                  isOverLimit && { color: '#EF4444' },
                ]}
              >
                {tileCount > 0 ? tileCount.toLocaleString() : '---'}
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>TAMANHO</Text>
              <Text style={styles.metricVal}>
                {sizeMB > 0 ? `${sizeMB.toFixed(1)} MB` : '---'}
              </Text>
            </View>
          </View>

          {/* Alerta se passar do limite ou zoom for baixo */}
          {isOverLimit && (
            <View style={styles.alertBar}>
              <AlertTriangle size={13} color="#EF4444" />
              <Text style={styles.alertBarText}>
                Área excede o limite de {OFFLINE_TILE_LIMIT.toLocaleString()} tiles. Aproxime mais o mapa.
              </Text>
            </View>
          )}

          {isZoomTooFar && !isOverLimit && (
            <View style={[styles.alertBar, { backgroundColor: '#FEF3C7' }]}>
              <AlertTriangle size={13} color="#D97706" />
              <Text style={[styles.alertBarText, { color: '#B45309' }]}>
                Aproxime o mapa (zoom mínimo recomendado: 10).
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── 4. Barra de Ações Inferior Flutuante ── */}
      <View
        style={[
          styles.bottomHUD,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.bottomHUDCard}>
          <Pressable
            style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed]}
            onPress={onCancel}
          >
            <Text style={styles.btnSecondaryText}>Cancelar</Text>
          </Pressable>

          {onCenterUser && currentLocation && (
            <Pressable
              style={({ pressed }) => [styles.btnGps, pressed && styles.btnPressed]}
              onPress={onCenterUser}
              hitSlop={6}
            >
              <LocateFixed size={20} color="#3B82F6" />
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.btnPrimary,
              isInvalid && styles.btnDisabled,
              pressed && styles.btnPressed,
            ]}
            onPress={handleOpenConfirm}
            disabled={isInvalid}
          >
            <Download size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.btnPrimaryText}>Confirmar Área</Text>
          </Pressable>
        </View>
      </View>

      {/* ── 5. Modal de Confirmação do Nome da Região ── */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={[styles.topHUDIconBadge, { backgroundColor: '#DBEAFE' }]}>
                <Download size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Salvar Mapa Offline</Text>
                <Text style={styles.modalSub}>
                  Confirme o nome para identificar esta área
                </Text>
              </View>
            </View>

            {/* Resumo da Região */}
            <View style={styles.modalSummaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Níveis de Zoom:</Text>
                <Text style={styles.summaryVal}>{OFFLINE_MIN_ZOOM} até {OFFLINE_MAX_ZOOM}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tiles:</Text>
                <Text style={styles.summaryVal}>{tileCount.toLocaleString()}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Espaço em Disco:</Text>
                <Text style={[styles.summaryVal, { color: '#10B981', fontWeight: '800' }]}>
                  ~{sizeMB.toFixed(1)} MB
                </Text>
              </View>
            </View>

            {/* Input Nome */}
            <Text style={styles.inputLabel}>NOME DO MAPA</Text>
            <TextInput
              style={styles.textInput}
              value={regionName}
              onChangeText={setRegionName}
              placeholder="Ex: Rio de Janeiro - Zona Sul"
              placeholderTextColor="#94A3B8"
              autoFocus
              selectTextOnFocus
              maxLength={50}
            />

            {/* Botões do Modal */}
            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Voltar e Ajustar</Text>
              </Pressable>

              <Pressable
                style={styles.modalConfirmBtn}
                onPress={handleFinalConfirm}
              >
                <Download size={16} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.modalConfirmBtnText}>Iniciar Download</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (themeColors: any) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFill,
      zIndex: 99,
    },
    scrim: {
      position: 'absolute',
      backgroundColor: 'rgba(15, 23, 42, 0.48)',
    },
    viewfinder: {
      position: 'absolute',
      borderRadius: 16,
      borderWidth: 2,
      borderStyle: 'solid',
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cornerTL: {
      position: 'absolute',
      top: -3,
      left: -3,
      width: 24,
      height: 24,
      borderTopWidth: 4,
      borderLeftWidth: 4,
      borderTopLeftRadius: 16,
    },
    cornerTR: {
      position: 'absolute',
      top: -3,
      right: -3,
      width: 24,
      height: 24,
      borderTopWidth: 4,
      borderRightWidth: 4,
      borderTopRightRadius: 16,
    },
    cornerBL: {
      position: 'absolute',
      bottom: -3,
      left: -3,
      width: 24,
      height: 24,
      borderBottomWidth: 4,
      borderLeftWidth: 4,
      borderBottomLeftRadius: 16,
    },
    cornerBR: {
      position: 'absolute',
      bottom: -3,
      right: -3,
      width: 24,
      height: 24,
      borderBottomWidth: 4,
      borderRightWidth: 4,
      borderBottomRightRadius: 16,
    },
    crosshairH: {
      position: 'absolute',
      width: 28,
      height: 1.5,
      backgroundColor: 'rgba(255, 255, 255, 0.55)',
    },
    crosshairV: {
      position: 'absolute',
      height: 28,
      width: 1.5,
      backgroundColor: 'rgba(255, 255, 255, 0.55)',
    },
    viewfinderBadge: {
      position: 'absolute',
      bottom: 12,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    viewfinderBadgeText: {
      fontSize: 10,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 0.8,
    },
    topHUD: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    topHUDCard: {
      width: '100%',
      backgroundColor: themeColors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: themeColors.border,
      padding: spacing.md,
      ...shadows.lg,
      elevation: 12,
      gap: 10,
    },
    topHUDHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    topHUDTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    topHUDIconBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: themeColors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topHUDTitle: {
      fontSize: 13,
      fontWeight: '900',
      color: themeColors.text,
      letterSpacing: 0.4,
    },
    topHUDSub: {
      fontSize: 11,
      color: themeColors.textMuted,
      fontWeight: '500',
    },
    hudCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: themeColors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: themeColors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    metricItem: {
      alignItems: 'center',
      flex: 1,
    },
    metricLabel: {
      fontSize: 9,
      fontWeight: '800',
      color: themeColors.textMuted,
      letterSpacing: 0.5,
    },
    metricVal: {
      fontSize: 13,
      fontWeight: '900',
      color: themeColors.primary,
      marginTop: 2,
    },
    metricDivider: {
      width: 1,
      height: 22,
      backgroundColor: themeColors.border,
    },
    alertBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#FEE2E2',
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    alertBarText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#DC2626',
      flex: 1,
      lineHeight: 15,
    },
    bottomHUD: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    bottomHUDCard: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: themeColors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: themeColors.border,
      padding: spacing.md,
      ...shadows.xl,
      elevation: 16,
    },
    btnSecondary: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: radius.md,
      backgroundColor: themeColors.surfaceElevated,
      borderWidth: 1,
      borderColor: themeColors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnSecondaryText: {
      fontSize: 13,
      fontWeight: '700',
      color: themeColors.textSecondary,
    },
    btnGps: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: themeColors.primaryGhost,
      borderWidth: 1,
      borderColor: themeColors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: radius.md,
      backgroundColor: '#2563EB',
      ...shadows.md,
    },
    btnPrimaryText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -0.2,
    },
    btnDisabled: {
      opacity: 0.4,
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.97 }],
    },

    // Modal Confirmation Dialog
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: themeColors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: themeColors.border,
      ...shadows.xl,
      gap: 14,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: themeColors.text,
      letterSpacing: -0.3,
    },
    modalSub: {
      fontSize: 12,
      color: themeColors.textMuted,
      fontWeight: '500',
    },
    modalSummaryBox: {
      backgroundColor: themeColors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: themeColors.border,
      padding: spacing.sm + 4,
      gap: 6,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    summaryLabel: {
      fontSize: 12,
      color: themeColors.textMuted,
      fontWeight: '600',
    },
    summaryVal: {
      fontSize: 12,
      color: themeColors.text,
      fontWeight: '700',
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: themeColors.textMuted,
      letterSpacing: 0.6,
      marginBottom: -4,
    },
    textInput: {
      height: 48,
      backgroundColor: themeColors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: themeColors.border,
      paddingHorizontal: 14,
      fontSize: 14,
      fontWeight: '600',
      color: themeColors.text,
    },
    modalActionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: themeColors.surfaceElevated,
      borderWidth: 1,
      borderColor: themeColors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: themeColors.textSecondary,
    },
    modalConfirmBtn: {
      flex: 1.3,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: '#2563EB',
    },
    modalConfirmBtnText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
  });
