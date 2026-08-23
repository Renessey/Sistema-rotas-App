/**
 * HomeScreen — Dashboard principal do app RotaSimples.
 *
 * Componentes separados:
 *   <AppHeader />       — Logo + badge
 *   <GpsCard />         — Status do GPS em tempo real
 *   <StatsGrid />       — Grid de métricas (total/entregues/pendentes/insucesso)
 *   <ProgressCard />    — Barra de progresso da rota
 *   <ConnectivityRow /> — Status da roteirização (online/offline)
 *   <QuickActions />    — Botões de ação rápida
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  Alert,
  Modal,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { LocationService } from '../../services/gps/LocationService';
import { DatabaseService } from '../../storage/DatabaseService';
import { ValhallaService } from '../../services/routing/ValhallaService';
import { spacing, radius, shadows, typography } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';

import { BottomNavBar } from '../../components/Navigation/BottomNavBar';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = spacing.md;

/* ═══════════════════════════════════════════════════
   SCREEN
═══════════════════════════════════════════════════ */

export default function HomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const screen = React.useMemo(() => createScreenStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState({
    total: 0, located: 0, completed: 0, pending: 0, failed: 0,
  });
  const [locationText, setLocationText] = useState('Verificando localização…');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [offlineOk, setOfflineOk] = useState(false);
  const [routerOnline, setRouterOnline] = useState<boolean | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  /* ── Data loaders ── */
  const refreshStats = useCallback(() => {
    setStats(DatabaseService.getStats());
  }, []);

  const checkLocation = useCallback(async () => {
    const permission = await LocationService.requestPermission();
    if (permission === 'denied' || permission === 'blocked') {
      setLocationText('Permissão negada — abra as configurações');
      return;
    }
    try {
      const pos = await LocationService.getCurrentPosition();
      setGpsAccuracy(pos.accuracy);
      setLocationText(`${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`);
    } catch {
      setLocationText('GPS indisponível — ligue o GPS');
    }
  }, []);

  const checkConnectivity = useCallback(async () => {
    const tiles = await ValhallaService.tilesReady();
    setOfflineOk(tiles.installed);
    setRouterOnline(true);
  }, []);

  useEffect(() => {
    refreshStats();
    checkLocation();
    checkConnectivity();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 440, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 440, useNativeDriver: true }),
    ]).start();
  }, [refreshStats, checkLocation, checkConnectivity, fadeAnim, slideAnim]);

  useFocusEffect(
    useCallback(() => {
      refreshStats();
    }, [refreshStats]),
  );

  const progress = stats.total > 0 ? stats.completed / stats.total : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={screen.scroll}
        contentContainerStyle={[
          screen.content,
          {
            paddingTop: Math.max(insets.top, spacing.md),
            paddingBottom: spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          style={[screen.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {/* ① Header */}
          <AppHeader />

          {/* ② GPS */}
          <GpsCard
            locationText={locationText}
            accuracy={gpsAccuracy}
            onPress={checkLocation}
          />

          {/* ③ Stats — só mostra com dados */}
          {stats.total > 0 && <StatsGrid stats={stats} />}

          {/* ④ Progresso — só mostra com dados */}
          {stats.total > 0 && <ProgressCard completed={stats.completed} total={stats.total} progress={progress} />}

          {/* ⑤ Conectividade */}
          <ConnectivityRow routerOnline={routerOnline} offlineOk={offlineOk} />

          {/* ⑥ Ações */}
          <QuickActions stats={stats} navigation={navigation} onDeleted={refreshStats} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════════════════════════
   ① APP HEADER
═══════════════════════════════════════════════════ */

function AppHeader() {
  const { colors, theme, toggleTheme } = useTheme();
  const header = React.useMemo(() => createHeaderStyles(colors), [colors]);
  return (
    <View style={header.root}>
      <View style={header.textBlock}>
        <Text style={header.title}>RotaSimples</Text>
        <Text style={header.subtitle}>Gestão de Entregas Profissional</Text>
      </View>
      <Pressable onPress={toggleTheme} style={header.themeToggle}>
        <Text style={header.themeIcon}>{theme === 'light' ? '🌙' : '☀️'}</Text>
      </Pressable>
      <View style={header.badge}>
        <Text style={header.badgeIcon}>🚚</Text>
      </View>
    </View>
  );
}

const createHeaderStyles = (colors: any) => StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  textBlock: { flex: 1, gap: 3 },
  title: { ...typography.displayMedium, color: colors.primary },
  subtitle: { ...typography.caption, color: colors.textMuted },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  themeIcon: { fontSize: 20 },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeIcon: { fontSize: 28 },
});

/* ═══════════════════════════════════════════════════
   ② GPS CARD
═══════════════════════════════════════════════════ */

interface GpsCardProps {
  locationText: string;
  accuracy: number | null;
  onPress: () => void;
}

function GpsCard({ locationText, accuracy, onPress }: GpsCardProps) {
  const { colors } = useTheme();
  const gps = React.useMemo(() => createGpsStyles(colors), [colors]);
  const dotColor =
    accuracy === null ? colors.textMuted
    : accuracy < 15   ? colors.success
    : accuracy < 50   ? colors.warning
    : colors.danger;

  return (
    <Pressable
      style={({ pressed }) => [gps.card, pressed && gps.cardPressed]}
      onPress={onPress}
    >
      <View style={gps.left}>
        <View style={[gps.dot, { backgroundColor: dotColor }]} />
        <View style={gps.textBlock}>
          <Text style={gps.label}>Localização GPS</Text>
          <Text style={gps.value} numberOfLines={1}>{locationText}</Text>
        </View>
      </View>
      {accuracy !== null && (
        <View style={[gps.badge, { backgroundColor: dotColor + '22' }]}>
          <Text style={[gps.badgeText, { color: dotColor }]}>±{Math.round(accuracy)}m</Text>
        </View>
      )}
    </Pressable>
  );
}

const createGpsStyles = (colors: any) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardPressed: { opacity: 0.8 },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  textBlock: { flex: 1, minWidth: 0, gap: 2 },
  label: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.bodySmall, color: colors.text, fontWeight: '500' },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, flexShrink: 0 },
  badgeText: { ...typography.label, fontSize: 11 },
});

/* ═══════════════════════════════════════════════════
   ③ STATS GRID
═══════════════════════════════════════════════════ */

interface StatsData {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  located: number;
}

function StatsGrid({ stats }: { stats: StatsData }) {
  const { colors } = useTheme();
  const statsGrid = React.useMemo(() => createStatsGridStyles(colors), [colors]);
  return (
    <View style={statsGrid.root}>
      <StatTile value={stats.total}     label="Total"     color={colors.primary}  icon="📦" />
      <StatTile value={stats.completed} label="Entregues" color={colors.success}  icon="✅" />
      <StatTile value={stats.pending}   label="Pendentes" color={colors.warning}  icon="⏳" />
      <StatTile value={stats.failed}    label="Insucesso" color={colors.danger}   icon="❌" />
    </View>
  );
}

function StatTile({ value, label, color, icon }: { value: number; label: string; color: string; icon: string; }) {
  const { colors } = useTheme();
  const statsGrid = React.useMemo(() => createStatsGridStyles(colors), [colors]);
  return (
    <View style={[statsGrid.tile, { borderTopColor: color }]}>
      <Text style={statsGrid.icon}>{icon}</Text>
      <Text style={[statsGrid.value, { color }]}>{value}</Text>
      <Text style={statsGrid.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const createStatsGridStyles = (colors: any) => StyleSheet.create({
  root: { flexDirection: 'row', gap: CARD_GAP },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 3,
    gap: 3,
    ...shadows.sm,
  },
  icon: { fontSize: 18 },
  value: { ...typography.headline, fontSize: 22 },
  label: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});

/* ═══════════════════════════════════════════════════
   ④ PROGRESS CARD
═══════════════════════════════════════════════════ */

interface ProgressCardProps {
  completed: number;
  total: number;
  progress: number;
}

function ProgressCard({ completed, total, progress }: ProgressCardProps) {
  const { colors } = useTheme();
  const prog = React.useMemo(() => createProgStyles(colors), [colors]);
  return (
    <View style={prog.card}>
      <View style={prog.headerRow}>
        <Text style={prog.label}>Progresso da Rota</Text>
        <Text style={prog.pct}>{Math.round(progress * 100)}%</Text>
      </View>
      <View style={prog.track}>
        <View style={[prog.fill, { width: `${progress * 100}%` as any }]} />
      </View>
      <Text style={prog.sub}>{completed} de {total} entregas concluídas</Text>
    </View>
  );
}

const createProgStyles = (colors: any) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  pct: { ...typography.titleSmall, color: colors.primary },
  track: { height: 8, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.success, borderRadius: radius.full },
  sub: { ...typography.caption, color: colors.textMuted },
});

/* ═══════════════════════════════════════════════════
   ⑤ CONNECTIVITY ROW
═══════════════════════════════════════════════════ */

interface ConnectivityRowProps {
  routerOnline: boolean | null;
  offlineOk: boolean;
}

function ConnectivityRow({ routerOnline, offlineOk }: ConnectivityRowProps) {
  const { colors } = useTheme();
  const conn = React.useMemo(() => createConnStyles(colors), [colors]);
  const status = {
    color: colors.success,
    label: 'Valhalla 100% Offline (Maricá, Niterói, SG)',
    icon: '⚡',
  };

  return (
    <View style={[conn.row, { borderColor: status.color + '44' }]}>
      <Text style={conn.icon}>{status.icon}</Text>
      <Text style={[conn.text, { color: status.color }]} numberOfLines={1}>
        {status.label}
      </Text>
      {offlineOk && (
        <View style={conn.offlineBadge}>
          <Text style={conn.offlineText}>Offline OK</Text>
        </View>
      )}
    </View>
  );
}

const createConnStyles = (colors: any) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    ...shadows.sm,
  },
  icon: { fontSize: 16, flexShrink: 0 },
  text: { ...typography.bodySmall, fontWeight: '600', flex: 1 },
  offlineBadge: {
    backgroundColor: colors.success + '22',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    flexShrink: 0,
  },
  offlineText: { ...typography.caption, color: colors.success, fontWeight: '700' },
});

/* ═══════════════════════════════════════════════════
   ⑥ QUICK ACTIONS
═══════════════════════════════════════════════════ */

interface QuickActionsProps {
  stats: StatsData;
  navigation: Props['navigation'];
  onDeleted: () => void;
}

function QuickActions({ stats, navigation, onDeleted }: QuickActionsProps) {
  const { colors } = useTheme();
  const qa = React.useMemo(() => createQaStyles(colors), [colors]);
  const [modalVisible, setModalVisible] = useState(false);

  const handleConfirmDelete = () => {
    DatabaseService.clearDeliveries();
    setModalVisible(false);
    onDeleted();
  };

  return (
    <View style={qa.root}>
      <Text style={qa.sectionLabel}>AÇÕES RÁPIDAS</Text>

      <ActionBtn
        icon="📄"
        label="Importar Planilha"
        sublabel=".xlsx  ·  .csv  ·  .txt"
        color={colors.primary}
        onPress={() => navigation.navigate('Import')}
      />

      <View style={qa.row}>
        <ActionBtn
          icon="📋"
          label="Ver Entregas"
          sublabel={`${stats.total} registros`}
          color={colors.textSecondary}
          disabled={stats.total === 0}
          flex
          onPress={() => navigation.navigate('Deliveries')}
        />
        <ActionBtn
          icon="🗺️"
          label="Ver no Mapa"
          sublabel="Visualizar rota"
          color={colors.info}
          disabled={stats.total === 0}
          flex
          onPress={() => navigation.navigate('Map')}
        />
      </View>

      <ActionBtn
        icon="⚡"
        label="Iniciar Navegação"
        sublabel={
          stats.pending > 0
            ? `${stats.pending} parada${stats.pending !== 1 ? 's' : ''} pendente${stats.pending !== 1 ? 's' : ''}`
            : 'Nenhuma entrega pendente'
        }
        color={colors.success}
        disabled={stats.pending === 0}
        prominent
        onPress={() => navigation.navigate('Map')}
      />

      {/* Botão Card Moderno de Apagar Planilha */}
      <DeleteSpreadsheetCard
        total={stats.total}
        onPress={() => setModalVisible(true)}
      />

      {/* Modal Customizado de Confirmação */}
      <DeleteSpreadsheetModal
        visible={modalVisible}
        stats={stats}
        onClose={() => setModalVisible(false)}
        onConfirm={handleConfirmDelete}
      />
    </View>
  );
}

/* ─── Delete Spreadsheet Button (Clean & Modern Action) ─── */
function DeleteSpreadsheetCard({
  total,
  onPress,
}: {
  total: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const ds = React.useMemo(() => createDeleteStyles(colors), [colors]);
  const disabled = total === 0;

  return (
    <Pressable
      style={({ pressed }) => [
        ds.btn,
        disabled && ds.btnDisabled,
        !disabled && pressed && ds.btnPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={ds.leftContent}>
        <View style={[ds.iconBox, disabled && ds.iconBoxDisabled]}>
          <Text style={ds.icon}>🗑️</Text>
        </View>
        <View style={ds.textBlock}>
          <Text style={[ds.title, disabled && ds.titleDisabled]}>
            Apagar Planilha
          </Text>
          <Text style={[ds.sublabel, disabled && ds.sublabelDisabled]}>
            {total > 0
              ? `${total} ${total === 1 ? 'entrega importada' : 'entregas importadas'}`
              : 'Nenhuma planilha carregada'}
          </Text>
        </View>
      </View>

      {!disabled && (
        <View style={ds.pillBadge}>
          <Text style={ds.pillText}>Limpar</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ─── Custom Modern Delete Confirmation Modal ─── */
function DeleteSpreadsheetModal({
  visible,
  stats,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  stats: StatsData;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useTheme();
  const dm = React.useMemo(() => createModalStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={dm.overlay}>
        <Pressable style={dm.backdrop} onPress={onClose} />

        <View style={dm.sheet}>
          {/* Drag Handle */}
          <View style={dm.handle} />

          {/* Clean Danger Icon */}
          <View style={dm.iconCircle}>
            <Text style={dm.headerIcon}>🗑️</Text>
          </View>

          {/* Header Texts */}
          <View style={dm.headerText}>
            <Text style={dm.title}>Apagar Planilha de Entregas?</Text>
            <Text style={dm.description}>
              Todas as <Text style={dm.boldText}>{stats.total} entregas</Text> salvas e a rota atual serão removidas permanentemente deste dispositivo.
            </Text>
          </View>

          {/* Stats Breakdown Row */}
          {stats.total > 0 && (
            <View style={dm.statsBox}>
              <ModalStatTile label="Total" count={stats.total} color={colors.primary} icon="📦" />
              <ModalStatTile label="Entregues" count={stats.completed} color={colors.success} icon="✅" />
              <ModalStatTile label="Pendentes" count={stats.pending} color={colors.warning} icon="⏳" />
              <ModalStatTile label="Falhas" count={stats.failed} color={colors.danger} icon="❌" />
            </View>
          )}

          {/* Offline Database Notice */}
          <View style={dm.noticeBox}>
            <Text style={dm.noticeIcon}>💡</Text>
            <Text style={dm.noticeText}>
              Os registros serão apagados do banco de dados local SQLite.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={dm.actionsRow}>
            <Pressable
              style={({ pressed }) => [dm.cancelBtn, pressed && dm.btnPressed]}
              onPress={onClose}
            >
              <Text style={dm.cancelBtnText}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [dm.confirmBtn, pressed && dm.btnPressed]}
              onPress={onConfirm}
            >
              <Text style={dm.confirmBtnText}>Sim, Apagar Tudo</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ModalStatTile({
  label,
  count,
  color,
  icon,
}: {
  label: string;
  count: number;
  color: string;
  icon: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[modalStatStyles.tile, { borderColor: colors.border }]}>
      <Text style={modalStatStyles.icon}>{icon}</Text>
      <Text style={[modalStatStyles.count, { color }]}>{count}</Text>
      <Text style={[modalStatStyles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const modalStatStyles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderWidth: 1,
    gap: 2,
  },
  icon: { fontSize: 13 },
  count: { ...typography.titleSmall, fontWeight: '700' },
  label: { ...typography.caption, fontSize: 10, fontWeight: '600' },
});

const createDeleteStyles = (colors: any) => StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.sm,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
    backgroundColor: colors.dangerGhost,
    borderColor: colors.danger + '33',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.dangerGhost,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxDisabled: {
    backgroundColor: colors.border,
  },
  icon: {
    fontSize: 20,
  },
  textBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.text,
  },
  titleDisabled: {
    color: colors.textMuted,
  },
  sublabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  sublabelDisabled: {
    color: colors.textDisabled,
  },
  pillBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.dangerGhost,
    borderWidth: 1,
    borderColor: colors.danger + '33',
  },
  pillText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.danger,
  },
});

const createModalStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    ...shadows.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: colors.borderStrong,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  iconCircle: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.dangerGhost,
    borderWidth: 1.5,
    borderColor: colors.danger + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerText: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  title: {
    ...typography.title,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  boldText: {
    fontWeight: '700',
    color: colors.danger,
  },
  statsBox: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + '22',
  },
  noticeIcon: {
    fontSize: 14,
  },
  noticeText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 1.3,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.colored(colors.danger),
  },
  confirmBtnText: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: '#fff',
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});

interface ActionBtnProps {
  icon: string;
  label: string;
  sublabel?: string;
  color: string;
  disabled?: boolean;
  prominent?: boolean;
  danger?: boolean;
  flex?: boolean;
  onPress: () => void;
}

function ActionBtn({ icon, label, sublabel, color, disabled, prominent, danger, flex, onPress }: ActionBtnProps) {
  const { colors } = useTheme();
  const ab = React.useMemo(() => createAbStyles(colors), [colors]);
  const containerStyle: ViewStyle[] = [
    ab.btn,
    prominent ? ab.btnProminent : {},
    {
      backgroundColor: disabled
        ? colors.surfaceElevated
        : prominent
        ? color
        : danger
        ? colors.dangerGhost
        : colors.surface,
    },
    danger && !disabled && !prominent ? { borderColor: colors.danger + '44' } : {},
    disabled ? ab.btnDisabled : {},
    flex ? { flex: 1 } : {},
    prominent && !disabled ? (shadows.colored(color) as ViewStyle) : {},
  ];

  const textColor = prominent
    ? '#fff'
    : disabled
    ? colors.textMuted
    : danger
    ? colors.danger
    : colors.text;
  const subColor = prominent
    ? 'rgba(255,255,255,0.75)'
    : disabled
    ? colors.textDisabled
    : danger
    ? colors.danger + 'aa'
    : colors.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [...containerStyle, !disabled && pressed ? ab.pressed : {}]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[ab.icon, prominent && ab.iconLarge]}>{icon}</Text>
      <View style={ab.textBlock}>
        <Text style={[ab.label, { color: textColor }]} numberOfLines={1}>{label}</Text>
        {sublabel ? (
          <Text style={[ab.sublabel, { color: subColor }]} numberOfLines={1}>{sublabel}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const createAbStyles = (colors: any) => StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  btnProminent: {
    borderWidth: 0,
    paddingVertical: spacing.lg,
  },
  btnDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.984 }] },
  icon: { fontSize: 22, flexShrink: 0 },
  iconLarge: { fontSize: 26 },
  textBlock: { flex: 1, minWidth: 0, gap: 2 },
  label: { ...typography.bodyMedium },
  sublabel: { ...typography.caption },
});

const createQaStyles = (colors: any) => StyleSheet.create({
  root: { gap: CARD_GAP },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: -spacing.xs,
  },
  row: { flexDirection: 'row', gap: CARD_GAP },
});

/* ═══════════════════════════════════════════════════
   SCREEN STYLES
═══════════════════════════════════════════════════ */

const createScreenStyles = (colors: any) => StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  inner: {
    flex: 1,
    gap: CARD_GAP,
  },
});
