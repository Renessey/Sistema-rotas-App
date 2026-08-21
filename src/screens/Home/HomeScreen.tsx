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
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { LocationService } from '../../services/gps/LocationService';
import { DatabaseService } from '../../storage/DatabaseService';
import { ValhallaService } from '../../services/routing/ValhallaService';
import { spacing, radius, shadows, typography } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';

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
    try {
      const r = await fetch('https://valhalla1.openstreetmap.de', { signal: AbortSignal.timeout(3000) });
      setRouterOnline(r.ok || r.status < 500);
    } catch {
      try {
        const r2 = await fetch('https://router.project-osrm.org', { signal: AbortSignal.timeout(3000) });
        setRouterOnline(r2.ok || r2.status < 500);
      } catch {
        setRouterOnline(false);
      }
    }
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

  const progress = stats.total > 0 ? stats.completed / stats.total : 0;

  return (
    <ScrollView
      style={screen.scroll}
      contentContainerStyle={[
        screen.content,
        {
          paddingTop: Math.max(insets.top, spacing.md),
          paddingBottom: Math.max(insets.bottom, spacing.xl),
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
        <QuickActions stats={stats} navigation={navigation} />
      </Animated.View>
    </ScrollView>
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
  const status =
    routerOnline === null
      ? { color: colors.textMuted, label: 'Verificando conectividade…', icon: '🔄' }
      : routerOnline
      ? { color: colors.success, label: 'Roteirização Online',           icon: '✅' }
      : { color: colors.warning, label: 'Sem Internet — rotas aprox.',   icon: '⚠️' };

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
}

function QuickActions({ stats, navigation }: QuickActionsProps) {
  const { colors } = useTheme();
  const qa = React.useMemo(() => createQaStyles(colors), [colors]);
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
    </View>
  );
}

interface ActionBtnProps {
  icon: string;
  label: string;
  sublabel?: string;
  color: string;
  disabled?: boolean;
  prominent?: boolean;
  flex?: boolean;
  onPress: () => void;
}

function ActionBtn({ icon, label, sublabel, color, disabled, prominent, flex, onPress }: ActionBtnProps) {
  const { colors } = useTheme();
  const ab = React.useMemo(() => createAbStyles(colors), [colors]);
  const containerStyle: ViewStyle[] = [
    ab.btn,
    prominent ? ab.btnProminent : {},
    { backgroundColor: disabled ? colors.surfaceElevated : (prominent ? color : colors.surface) },
    disabled ? ab.btnDisabled : {},
    flex ? { flex: 1 } : {},
    prominent && !disabled ? (shadows.colored(color) as ViewStyle) : {},
  ];

  const textColor = prominent ? '#fff' : (disabled ? colors.textMuted : colors.text);
  const subColor  = prominent ? 'rgba(255,255,255,0.75)' : (disabled ? colors.textDisabled : colors.textMuted);

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
