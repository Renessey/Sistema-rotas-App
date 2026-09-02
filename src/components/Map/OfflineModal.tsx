/**
 * OfflineModal.tsx
 *
 * Modal completo de gerenciamento de mapas offline com 3 telas internas:
 *  - "home":     Lista de regiões salvas + botão "Baixar Área"
 *  - "selector": Overlay para selecionar a bounding-box no mapa
 *  - "progress": Barra de progresso do download em andamento
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  Download,
  HardDrive,
  MapPin,
  Trash2,
  WifiOff,
  X,
  ZoomIn,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius, shadows, spacing } from '../../theme';
import {
  OfflineMapService,
  estimateTileCount,
  estimateSizeMB,
  formatBytes,
  OFFLINE_MIN_ZOOM,
  OFFLINE_MAX_ZOOM,
  OFFLINE_TILE_LIMIT,
} from '../../services/OfflineMapService';
import type { OfflinePackWithMeta, DownloadProgressEvent } from '../../services/OfflineMapService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Screen = 'home' | 'selector' | 'progress';

interface OfflineModalProps {
  visible: boolean;
  onClose: () => void;
  /** URL do estilo atual do mapa (usado para baixar os tiles corretos) */
  currentStyleUrl: string;
  /**
   * Bounding-box atual do mapa visível na tela.
   */
  currentMapBounds?: [number, number, number, number];
  /** Callback para abrir o seletor visual interativo sobre o mapa */
  onRequestSelectAreaOnMap?: () => void;
  /** Download pendente configurado a partir do seletor sobre o mapa */
  pendingDownload?: {
    name: string;
    bounds: [number, number, number, number];
  } | null;
  onClearPendingDownload?: () => void;
  /** Estado global do Modo Offline */
  isOfflineMode?: boolean;
  onToggleOfflineMode?: (offline: boolean) => void;
}

// ─── Utilitários de data ──────────────────────────────────────────────────────

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Componente principal ────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');

export function OfflineModal({
  visible,
  onClose,
  currentStyleUrl,
  currentMapBounds,
  onRequestSelectAreaOnMap,
  pendingDownload,
  onClearPendingDownload,
  isOfflineMode = false,
  onToggleOfflineMode,
}: OfflineModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // ── Estado de tela ──
  const [screen, setScreen] = useState<Screen>('home');

  // ── Home ──
  const [regions, setRegions] = useState<OfflinePackWithMeta[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [totalUsed, setTotalUsed] = useState(0);

  // ── Selector ──
  const [regionName, setRegionName] = useState('');
  const [selectedBounds, setSelectedBounds] =
    useState<[number, number, number, number] | null>(null);
  const [tileEstimate, setTileEstimate] = useState(0);
  const [sizeMbEstimate, setSizeMbEstimate] = useState(0);
  const [boundsError, setBoundsError] = useState('');

  // ── Progress ──
  const [progress, setProgress] = useState(0);
  const [progressDetails, setProgressDetails] = useState<DownloadProgressEvent | null>(null);
  const [downloadState, setDownloadState] = useState<
    'downloading' | 'complete' | 'error' | 'idle'
  >('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const progressAnim = useRef(new Animated.Value(0)).current;
  const activePackIdRef = useRef<string | null>(null);

  // ── Animação de entrada/saída ──
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Carregar regiões salvas
  const loadRegions = useCallback(async () => {
    setLoadingRegions(true);
    try {
      const [list, used] = await Promise.all([
        OfflineMapService.listRegions(),
        OfflineMapService.getTotalUsedBytes(),
      ]);
      setRegions(list);
      setTotalUsed(used);
    } catch {
      setRegions([]);
    } finally {
      setLoadingRegions(false);
    }
  }, []);

  // Iniciar download
  const triggerDownload = useCallback(
    (name: string, b: [number, number, number, number]) => {
      setScreen('progress');
      setProgress(0);
      setDownloadState('downloading');
      setProgressDetails(null);
      setErrorMsg('');

      OfflineMapService.downloadRegion(
        name,
        currentStyleUrl,
        b,
        (evt) => {
          setProgressDetails(evt);
          setProgress(evt.percentage);
        },
        (packId) => {
          activePackIdRef.current = packId;
          setDownloadState('complete');
          setProgress(100);
          loadRegions();
        },
        (msg) => {
          setDownloadState('error');
          setErrorMsg(msg);
        },
      ).then((pack) => {
        activePackIdRef.current = pack.id;
      });
    },
    [currentStyleUrl, loadRegions],
  );

  useEffect(() => {
    if (visible) {
      if (pendingDownload) {
        setScreen('progress');
        triggerDownload(pendingDownload.name, pendingDownload.bounds);
        onClearPendingDownload?.();
      } else {
        setScreen('home');
      }

      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      loadRegions();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, pendingDownload, triggerDownload, onClearPendingDownload, loadRegions, slideAnim, backdropAnim]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  // Ação de baixar área: se tiver o seletor no mapa, abre o seletor visual no mapa
  const handleSelectArea = useCallback(() => {
    if (onRequestSelectAreaOnMap) {
      onRequestSelectAreaOnMap();
    } else {
      // Fallback
      if (currentMapBounds) {
        setSelectedBounds(currentMapBounds);
        const est = estimateTileCount(currentMapBounds, OFFLINE_MIN_ZOOM, OFFLINE_MAX_ZOOM);
        setTileEstimate(est);
        setSizeMbEstimate(estimateSizeMB(est));
      }
      setRegionName(`Mapa ${formatDate(Date.now())}`);
      setScreen('selector');
    }
  }, [onRequestSelectAreaOnMap, currentMapBounds]);

  // Confirmar e iniciar download a partir da tela de selector manual
  const handleStartDownload = useCallback(() => {
    if (!selectedBounds) return;
    const name = regionName.trim() || `Mapa ${formatDate(Date.now())}`;
    triggerDownload(name, selectedBounds);
  }, [selectedBounds, regionName, triggerDownload]);

  // Excluir região
  const handleDelete = useCallback(
    (id: string, name: string) => {
      Alert.alert(
        'Excluir mapa offline?',
        `O mapa "${name}" será removido permanentemente do dispositivo.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir',
            style: 'destructive',
            onPress: async () => {
              try {
                await OfflineMapService.deleteRegion(id);
                await loadRegions();
              } catch {
                Alert.alert('Erro', 'Não foi possível excluir o mapa.');
              }
            },
          },
        ],
      );
    },
    [loadRegions],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 20),
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* ─────────────── HOME ─────────────── */}
          {screen === 'home' && (
            <HomeScreen
              styles={styles}
              colors={colors}
              regions={regions}
              loadingRegions={loadingRegions}
              totalUsed={totalUsed}
              onClose={onClose}
              onDownload={handleSelectArea}
              onDelete={handleDelete}
              isOfflineMode={isOfflineMode}
              onToggleOfflineMode={onToggleOfflineMode}
            />
          )}

          {/* ─────────────── SELECTOR ─────────────── */}
          {screen === 'selector' && (
            <SelectorScreen
              styles={styles}
              colors={colors}
              regionName={regionName}
              setRegionName={setRegionName}
              selectedBounds={selectedBounds}
              tileEstimate={tileEstimate}
              sizeMbEstimate={sizeMbEstimate}
              boundsError={boundsError}
              onBack={() => setScreen('home')}
              onConfirm={handleStartDownload}
            />
          )}

          {/* ─────────────── PROGRESS ─────────────── */}
          {screen === 'progress' && (
            <ProgressScreen
              styles={styles}
              colors={colors}
              progress={progress}
              progressAnim={progressAnim}
              progressDetails={progressDetails}
              downloadState={downloadState}
              errorMsg={errorMsg}
              onBack={() => {
                setScreen('home');
                loadRegions();
              }}
              onDone={() => {
                setScreen('home');
                loadRegions();
              }}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela: HOME
// ─────────────────────────────────────────────────────────────────────────────

interface HomeScreenProps {
  styles: ReturnType<typeof createStyles>;
  colors: any;
  regions: OfflinePackWithMeta[];
  loadingRegions: boolean;
  totalUsed: number;
  onClose: () => void;
  onDownload: () => void;
  onDelete: (id: string, name: string) => void;
  isOfflineMode: boolean;
  onToggleOfflineMode?: (offline: boolean) => void;
}

function HomeScreen({
  styles,
  colors,
  regions,
  loadingRegions,
  totalUsed,
  onClose,
  onDownload,
  onDelete,
}: HomeScreenProps) {
  return (
    <>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconBadge, { backgroundColor: '#F59E0B' }]}>
            <WifiOff size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.title}>Mapas & Regiões Offline</Text>
            <Text style={styles.subtitle}>Gerencie os dados e mapas locais do app</Text>
          </View>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
          <X size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.homeScroll}
        contentContainerStyle={styles.homeScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status do Motor 100% Offline */}
        <View style={styles.offlineStatusBanner}>
          <View style={styles.offlineStatusHeader}>
            <View style={styles.statusDotActive} />
            <Text style={styles.offlineStatusTitle}>SISTEMA 100% OFFLINE ATIVO</Text>
          </View>
          <Text style={styles.offlineStatusDesc}>
            O aplicativo opera com motor de rotas nativo embarcado, sem consumir internet e sem custos de API.
          </Text>
        </View>

        {/* Espaço em disco e Botão Baixar */}
        <View style={styles.diskRow}>
          <HardDrive size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.diskText}>
            Armazenamento usado: <Text style={styles.diskValue}>{formatBytes(totalUsed)}</Text>
          </Text>
        </View>

        {/* Botão principal de baixar área */}
        <Pressable
          style={({ pressed }) => [styles.downloadBtn, pressed && styles.btnPressed]}
          onPress={onDownload}
        >
          <Download size={18} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={styles.downloadBtnText}>Baixar Nova Área no Mapa</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>REGIÕES SALVAS & DISPONÍVEIS</Text>

        {/* 1. Região Nativa Embarcada OSM (Sempre Presente e Ativa) */}
        <View style={styles.embeddedRegionCard}>
          <View style={[styles.regionIconBadge, styles.badgeComplete]}>
            <CheckCircle size={16} color="#10B981" />
          </View>
          <View style={styles.regionInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.regionName} numberOfLines={1}>
                Maricá, Niterói & São Gonçalo
              </Text>
              <View style={styles.embeddedPill}>
                <Text style={styles.embeddedPillText}>Embarcado</Text>
              </View>
            </View>
            <Text style={styles.regionMeta}>
              50.429 nós viários · Malha viária OSM integrada
            </Text>
          </View>
        </View>

        {/* 2. Regiões Baixadas pelo Usuário */}
        {loadingRegions ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          regions.map((r) => (
            <RegionCard
              key={r.pack.id}
              region={r}
              styles={styles}
              colors={colors}
              onDelete={onDelete}
            />
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </>
  );
}

// ─── RegionCard ───────────────────────────────────────────────────────────────

function RegionCard({
  region,
  styles,
  colors,
  onDelete,
}: {
  region: OfflinePackWithMeta;
  styles: ReturnType<typeof createStyles>;
  colors: any;
  onDelete: (id: string, name: string) => void;
}) {
  const { meta, status } = region;
  const isComplete = status?.state === 'complete' || (status?.percentage ?? 0) >= 100;
  const pct = Math.round(status?.percentage ?? 0);

  return (
    <View style={styles.regionCard}>
      <View style={[styles.regionIconBadge, isComplete ? styles.badgeComplete : styles.badgePending]}>
        {isComplete ? (
          <CheckCircle size={16} color="#10B981" />
        ) : (
          <Download size={16} color="#F59E0B" />
        )}
      </View>

      <View style={styles.regionInfo}>
        <Text style={styles.regionName} numberOfLines={1}>{meta.name}</Text>
        <Text style={styles.regionMeta}>
          {formatDate(meta.downloadedAt)} · {formatBytes(meta.tileSizeEstimateBytes)} ·{' '}
          Zoom {meta.minZoom}–{meta.maxZoom}
        </Text>
        {!isComplete && (
          <View style={styles.miniProgressBg}>
            <View style={[styles.miniProgressFill, { width: `${pct}%` }]} />
          </View>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
        onPress={() => onDelete(meta.id, meta.name)}
        hitSlop={8}
      >
        <Trash2 size={16} color={colors.danger} />
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela: SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

interface SelectorScreenProps {
  styles: ReturnType<typeof createStyles>;
  colors: any;
  regionName: string;
  setRegionName: (v: string) => void;
  selectedBounds: [number, number, number, number] | null;
  tileEstimate: number;
  sizeMbEstimate: number;
  boundsError: string;
  onBack: () => void;
  onConfirm: () => void;
}

function SelectorScreen({
  styles,
  colors,
  regionName,
  setRegionName,
  selectedBounds,
  tileEstimate,
  sizeMbEstimate,
  boundsError,
  onBack,
  onConfirm,
}: SelectorScreenProps) {
  const isOverLimit = tileEstimate > OFFLINE_TILE_LIMIT;

  return (
    <>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={8}>
          <ChevronLeft size={22} color={colors.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Configurar Download</Text>
          <Text style={styles.subtitle}>Área visível no mapa</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Instruções visuais */}
        <View style={styles.selectorHint}>
          <ZoomIn size={20} color="#3B82F6" strokeWidth={2} />
          <Text style={styles.selectorHintText}>
            Ajuste o zoom e posição do mapa na tela principal antes de baixar.
            A área atual visível será salva para uso offline.
          </Text>
        </View>

        {/* Preview dos bounds */}
        {selectedBounds ? (
          <View style={styles.boundsCard}>
            <View style={styles.boundsRow}>
              <Text style={styles.boundsLabel}>Oeste</Text>
              <Text style={styles.boundsVal}>{selectedBounds[0].toFixed(4)}°</Text>
            </View>
            <View style={styles.boundsRow}>
              <Text style={styles.boundsLabel}>Sul</Text>
              <Text style={styles.boundsVal}>{selectedBounds[1].toFixed(4)}°</Text>
            </View>
            <View style={styles.boundsRow}>
              <Text style={styles.boundsLabel}>Leste</Text>
              <Text style={styles.boundsVal}>{selectedBounds[2].toFixed(4)}°</Text>
            </View>
            <View style={styles.boundsRow}>
              <Text style={styles.boundsLabel}>Norte</Text>
              <Text style={styles.boundsVal}>{selectedBounds[3].toFixed(4)}°</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.boundsCard, { alignItems: 'center', padding: 20 }]}>
            <AlertCircle size={24} color={colors.warning} />
            <Text style={[styles.boundsLabel, { marginTop: 8, textAlign: 'center' }]}>
              Sem dados de área disponíveis.{'\n'}Mova o mapa e tente novamente.
            </Text>
          </View>
        )}

        {/* Estimativa */}
        {selectedBounds && (
          <View style={styles.estimateCard}>
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>Tiles estimados</Text>
              <Text style={[styles.estimateVal, isOverLimit && { color: colors.danger }]}>
                {tileEstimate.toLocaleString()}
              </Text>
            </View>
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>Tamanho estimado</Text>
              <Text style={styles.estimateVal}>{sizeMbEstimate.toFixed(1)} MB</Text>
            </View>
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>Zoom</Text>
              <Text style={styles.estimateVal}>{OFFLINE_MIN_ZOOM} – {OFFLINE_MAX_ZOOM}</Text>
            </View>
          </View>
        )}

        {boundsError ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={14} color={colors.danger} />
            <Text style={styles.errorBannerText}>{boundsError}</Text>
          </View>
        ) : null}

        {/* Nome da região */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>NOME DO MAPA</Text>
        <TextInput
          style={[styles.nameInput, { color: colors.text, borderColor: colors.border }]}
          value={regionName}
          onChangeText={setRegionName}
          placeholder="Ex: Centro da Cidade"
          placeholderTextColor={colors.textMuted}
          maxLength={60}
        />

        {/* Botão de confirmação */}
        <Pressable
          style={({ pressed }) => [
            styles.confirmBtn,
            (!selectedBounds || isOverLimit) && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
          onPress={onConfirm}
          disabled={!selectedBounds || isOverLimit}
        >
          <Download size={18} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={styles.downloadBtnText}>Confirmar e Baixar</Text>
        </Pressable>

        <View style={{ height: 20 }} />
      </ScrollView>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela: PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressScreenProps {
  styles: ReturnType<typeof createStyles>;
  colors: any;
  progress: number;
  progressAnim: Animated.Value;
  progressDetails: DownloadProgressEvent | null;
  downloadState: 'downloading' | 'complete' | 'error' | 'idle';
  errorMsg: string;
  onBack: () => void;
  onDone: () => void;
}

function ProgressScreen({
  styles,
  colors,
  progress,
  progressAnim,
  progressDetails,
  downloadState,
  errorMsg,
  onBack,
  onDone,
}: ProgressScreenProps) {
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const isComplete = downloadState === 'complete';
  const isError = downloadState === 'error';

  return (
    <View style={styles.progressContainer}>
      {/* Header */}
      <View style={styles.header}>
        {(isComplete || isError) && (
          <Pressable style={styles.backBtn} onPress={onBack} hitSlop={8}>
            <ChevronLeft size={22} color={colors.primary} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {isComplete ? 'Download concluído!' : isError ? 'Erro no download' : 'Baixando mapa…'}
          </Text>
          <Text style={styles.subtitle}>
            {isComplete
              ? 'Mapa disponível para uso offline'
              : isError
              ? 'Verifique sua conexão'
              : 'Não feche o app durante o download'}
          </Text>
        </View>
      </View>

      {/* Ícone de estado */}
      <View style={styles.progressIconArea}>
        {isComplete ? (
          <View style={[styles.stateIconBadge, { backgroundColor: '#D1FAE5' }]}>
            <CheckCircle size={40} color="#10B981" />
          </View>
        ) : isError ? (
          <View style={[styles.stateIconBadge, { backgroundColor: '#FEE2E2' }]}>
            <AlertCircle size={40} color="#EF4444" />
          </View>
        ) : (
          <View style={[styles.stateIconBadge, { backgroundColor: '#DBEAFE' }]}>
            <Download size={40} color="#3B82F6" />
          </View>
        )}
      </View>

      {/* Percentual */}
      <Text style={[styles.progressPct, isComplete && { color: '#10B981' }, isError && { color: '#EF4444' }]}>
        {isError ? 'Falhou' : `${Math.round(progress)}%`}
      </Text>

      {/* Barra */}
      <View style={styles.progressBarBg}>
        <Animated.View
          style={[
            styles.progressBarFill,
            { width: progressWidth },
            isComplete && { backgroundColor: '#10B981' },
            isError && { backgroundColor: '#EF4444' },
          ]}
        />
      </View>

      {/* Detalhes */}
      {progressDetails && !isComplete && !isError && (
        <View style={styles.progressDetails}>
          <Text style={styles.progressDetailText}>
            {progressDetails.completedTileCount} /{' '}
            {progressDetails.requiredResourceCount} recursos
          </Text>
          <Text style={styles.progressDetailText}>
            {formatBytes(progressDetails.completedResourceSize)} baixados
          </Text>
        </View>
      )}

      {isError && errorMsg ? (
        <View style={styles.errorBanner}>
          <AlertCircle size={14} color={colors.danger} />
          <Text style={styles.errorBannerText}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Ações */}
      {isComplete && (
        <Pressable
          style={({ pressed }) => [styles.confirmBtn, pressed && styles.btnPressed]}
          onPress={onDone}
        >
          <CheckCircle size={18} color="#FFFFFF" />
          <Text style={styles.downloadBtnText}>Ver Mapas Salvos</Text>
        </Pressable>
      )}

      {isError && (
        <Pressable
          style={({ pressed }) => [styles.backBtnLarge, pressed && styles.btnPressed]}
          onPress={onBack}
        >
          <ChevronLeft size={18} color={colors.primary} />
          <Text style={styles.backBtnText}>Voltar</Text>
        </Pressable>
      )}

      {!isComplete && !isError && (
        <View style={styles.downloadingIndicator}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.downloadingText}>Download em andamento…</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const createStyles = (colors: any) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl + 4,
      borderTopRightRadius: radius.xl + 4,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      height: SH * 0.82,
      ...shadows.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    iconBadge: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textMuted,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },
    homeScroll: {
      flex: 1,
    },
    homeScrollContent: {
      paddingBottom: 24,
    },
    offlineStatusBanner: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
      gap: 6,
    },
    offlineStatusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusDotActive: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#10B981',
    },
    offlineStatusTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 0.5,
    },
    offlineStatusDesc: {
      fontSize: 11,
      color: colors.textMuted,
      lineHeight: 15,
    },
    embeddedRegionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: 'rgba(16, 185, 129, 0.35)',
      padding: spacing.sm + 2,
      marginBottom: spacing.xs + 2,
    },
    embeddedPill: {
      backgroundColor: 'rgba(16, 185, 129, 0.15)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    embeddedPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#10B981',
    },
    diskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.sm,
    },
    diskText: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '500',
    },
    diskValue: {
      color: colors.text,
      fontWeight: '700',
    },
    downloadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      backgroundColor: '#1D4ED8',
      borderRadius: radius.md + 2,
      paddingVertical: 13,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
      ...shadows.md,
    },
    downloadBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -0.2,
    },
    sectionLabel: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.8,
      marginBottom: spacing.xs,
    },
    regionList: {
      flex: 1,
    },
    regionListContent: {
      paddingBottom: 8,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
      gap: spacing.sm,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      paddingHorizontal: 24,
    },
    regionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm + 2,
      marginBottom: spacing.xs + 2,
    },
    regionIconBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeComplete: {
      backgroundColor: '#D1FAE5',
    },
    badgePending: {
      backgroundColor: '#FEF3C7',
    },
    regionInfo: {
      flex: 1,
      gap: 2,
    },
    regionName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    regionMeta: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '500',
    },
    miniProgressBg: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginTop: 4,
      overflow: 'hidden',
    },
    miniProgressFill: {
      height: '100%',
      backgroundColor: '#F59E0B',
      borderRadius: 2,
    },
    deleteBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.dangerGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Selector ──
    selectorHint: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs + 2,
      backgroundColor: '#EFF6FF',
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: '#BFDBFE',
    },
    selectorHintText: {
      flex: 1,
      fontSize: 13,
      color: '#1D4ED8',
      lineHeight: 19,
      fontWeight: '500',
    },
    boundsCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: 6,
    },
    boundsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    boundsLabel: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    boundsVal: {
      fontSize: 12,
      color: colors.text,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    estimateCard: {
      backgroundColor: '#F0FDF4',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: '#BBF7D0',
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: 6,
    },
    estimateRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    estimateLabel: {
      fontSize: 12,
      color: '#065F46',
      fontWeight: '600',
    },
    estimateVal: {
      fontSize: 12,
      color: '#065F46',
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.dangerGhost,
      borderRadius: radius.sm,
      padding: spacing.sm,
      marginBottom: spacing.sm,
    },
    errorBannerText: {
      flex: 1,
      fontSize: 12,
      color: colors.danger,
      fontWeight: '600',
      lineHeight: 16,
    },
    nameInput: {
      height: 46,
      borderWidth: 1.5,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      fontSize: 14,
      fontWeight: '600',
      backgroundColor: colors.surfaceElevated,
      marginBottom: spacing.md,
    },
    confirmBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      backgroundColor: '#1D4ED8',
      borderRadius: radius.md + 2,
      paddingVertical: 13,
      paddingHorizontal: spacing.lg,
      ...shadows.md,
    },
    btnDisabled: {
      opacity: 0.45,
    },
    btnPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.97 }],
    },

    // ── Progress ──
    progressContainer: {
      paddingBottom: 8,
    },
    progressIconArea: {
      alignItems: 'center',
      marginVertical: 24,
    },
    stateIconBadge: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressPct: {
      textAlign: 'center',
      fontSize: 38,
      fontWeight: '900',
      color: '#3B82F6',
      letterSpacing: -1,
      marginBottom: spacing.sm,
    },
    progressBarBg: {
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: '#3B82F6',
      borderRadius: 5,
    },
    progressDetails: {
      alignItems: 'center',
      gap: 4,
      marginBottom: spacing.md,
    },
    progressDetailText: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    downloadingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    downloadingText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    backBtnLarge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primaryGhost,
      borderRadius: radius.md,
      paddingVertical: 12,
      marginTop: spacing.sm,
    },
    backBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
  });
