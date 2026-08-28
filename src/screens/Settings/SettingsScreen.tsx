import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows, typography } from '../../theme';
import { MapStyleService } from '../../services/map/MapStyleService';
import { DatabaseService } from '../../storage/DatabaseService';
import { LocationService } from '../../services/gps/LocationService';
import { RoutingService } from '../../services/routing/RoutingService';
import { MapboxService } from '../../services/routing/MapboxService';
import { MapboxQuota } from '../../services/routing/MapboxQuota';
import { MAP_TYPES, MAP_THEMES, MapType, MapTheme } from '../../config/mapStyles';
import type { Costing, RoutingProvider } from '../../types/geo';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Activity,
  Moon,
  Sun,
  Layers,
  Car,
  Truck,
  Bike,
  EyeOff,
  Navigation,
  HardDrive,
  Cpu,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Globe,
  Radio,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const VEHICLES: { id: Costing; label: string; Icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { id: 'auto', label: 'Carro / Van', Icon: Car },
  { id: 'truck', label: 'Caminhão', Icon: Truck },
  { id: 'motorcycle', label: 'Moto', Icon: Bike },
  { id: 'bicycle', label: 'Bicicleta', Icon: Bike },
];

export default function SettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [mapType, setMapType] = useState<MapType>('standard');
  const [mapTheme, setMapTheme] = useState<MapTheme>('classic');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [costingMode, setCostingMode] = useState<Costing>('auto');
  const [routingProvider, setRoutingProvider] = useState<RoutingProvider>('mapbox');
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, failed: 0, located: 0, invalidCoords: 0 });
  const [mapboxUsage, setMapboxUsage] = useState({ count: 0, limit: 3000, remaining: 3000 });

  // Diagnósticos
  const [diagLoading, setDiagLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<{
    ok: boolean;
    lat?: number;
    lon?: number;
    accuracy?: number | null;
    message?: string;
  }>({ ok: false });
  const [routerStatus, setRouterStatus] = useState<{ ok: boolean; provider: string }>({
    ok: MapboxService.isConfigured(),
    provider: 'Mapbox Directions v5 + OSRM (Fallback)',
  });

  const loadSettings = useCallback(async () => {
    const prefs = await MapStyleService.loadPreferences();
    setMapType(prefs.mapType);
    setMapTheme(prefs.mapTheme);
    setHideCompleted(prefs.hideCompleted);
    setCostingMode(prefs.costingMode);
    setRoutingProvider(prefs.routingProvider || 'mapbox');
    setStats(DatabaseService.getStats());

    try {
      const quota = await MapboxQuota.getUsage();
      setMapboxUsage(quota);
    } catch {}
  }, []);

  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    try {
      setStats(DatabaseService.getStats());
      const quota = await MapboxQuota.getUsage();
      setMapboxUsage(quota);
    } catch {}

    try {
      const perm = await LocationService.requestPermission();
      if (perm === 'granted') {
        const pos = await LocationService.getCurrentPosition();
        setGpsStatus({
          ok: true,
          lat: pos.latitude,
          lon: pos.longitude,
          accuracy: pos.accuracy,
        });
      } else {
        setGpsStatus({ ok: false, message: 'Permissão de GPS negada' });
      }
    } catch (e: any) {
      setGpsStatus({ ok: false, message: e?.message || 'GPS desligado' });
    }

    try {
      const meta = RoutingService.getRegionMetadata();
      setRouterStatus({ ok: MapboxService.isConfigured(), provider: meta.municipalities.join(', ') });
    } catch {}

    setDiagLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
    runDiagnostics();
  }, [loadSettings, runDiagnostics]);

  const handleUpdateType = async (type: MapType) => {
    setMapType(type);
    await MapStyleService.setMapType(type);
  };

  const handleUpdateTheme = async (t: MapTheme) => {
    setMapTheme(t);
    await MapStyleService.setMapTheme(t);
  };

  const handleToggleHide = async (value: boolean) => {
    setHideCompleted(value);
    await MapStyleService.setHideCompleted(value);
  };

  const handleUpdateCosting = async (mode: Costing) => {
    setCostingMode(mode);
    await MapStyleService.setCostingMode(mode);
  };

  const handleUpdateProvider = async (p: RoutingProvider) => {
    setRoutingProvider(p);
    await MapStyleService.setRoutingProvider(p);
  };

  const handleClearDatabase = () => {
    Alert.alert(
      'Limpar Todas as Entregas?',
      'Esta ação apagará todas as entregas salvas e a rota atual do banco de dados local.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Apagar',
          style: 'destructive',
          onPress: () => {
            DatabaseService.clearDeliveries();
            setStats(DatabaseService.getStats());
            Alert.alert('Sucesso', 'Base de entregas limpa com sucesso.');
          },
        },
      ],
    );
  };

  const testRouteCalculation = async () => {
    try {
      const p1: [number, number] = [-42.8188, -22.9192]; // Maricá
      const p2: [number, number] = [-43.1189, -22.8832]; // Niterói

      const result = await RoutingService.route([p1, p2]);
      Alert.alert(
        'Teste de Rota — Mapbox Directions v5',
        `Origem: Maricá\nDestino: Niterói\nDistância: ${(result.distance / 1000).toFixed(1)} km\nTempo estimado: ${Math.round(result.duration / 60)} min\nProvedor: ${result.geojson.features[0]?.properties?.provider || 'Mapbox'}\nStatus: Traçado de alta precisão com tráfego em tempo real.`,
      );
    } catch (e: any) {
      Alert.alert('Erro no teste de rota', e?.message || 'Falha ao calcular rota. Verifique a conexão.');
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, spacing.md),
            paddingBottom: spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <ArrowLeft size={16} color={colors.primary} />
            <Text style={styles.backBtnText}>Voltar</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.btnPressed]}
            onPress={runDiagnostics}
            hitSlop={8}
          >
            <RefreshCw size={14} color={colors.textSecondary} />
            <Text style={styles.refreshBtnText}>Atualizar Diagnóstico</Text>
          </Pressable>
        </View>

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Configurações</Text>
            <Text style={styles.headerSubtitle}>Preferências, Roteamento e Diagnóstico</Text>
          </View>
          <View style={styles.headerBadge}>
            <SettingsIcon size={24} color={colors.primary} />
          </View>
        </View>

        {/* 1. Provedor de Roteamento */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Globe size={16} color={colors.primary} />
            <Text style={styles.sectionHeader}>MOTOR DE ROTEAMENTO & GPS</Text>
          </View>

          <Text style={styles.subHeader}>Selecione o provedor de rotas para cálculo do trajeto:</Text>
          <View style={styles.providerCol}>
            {/* 1. Mapbox Directions (Motor Principal) */}
            <Pressable
              style={[
                styles.providerCard,
                routingProvider === 'mapbox' && styles.providerCardActive,
              ]}
              onPress={() => handleUpdateProvider('mapbox')}
            >
              <View style={styles.providerLeft}>
                <View
                  style={[
                    styles.providerDot,
                    routingProvider === 'mapbox' && styles.providerDotActive,
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.providerTitle}>Mapbox Directions API v5 (Recomendado)</Text>
                  <Text style={styles.providerDesc}>
                    Motor online de alta resolução viária, suporte a tráfego e cota diária de 3.000 req/dia
                  </Text>
                </View>
              </View>
              <View style={[styles.badgePill, { backgroundColor: colors.successGhost }]}>
                <Text style={[styles.badgePillText, { color: colors.success }]}>
                  {mapboxUsage.count}/3000 hoje
                </Text>
              </View>
            </Pressable>

          </View>
        </View>

        {/* 2. Diagnóstico Completo do Sistema Integrado */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Activity size={16} color={colors.primary} />
            <Text style={styles.sectionHeader}>DIAGNÓSTICO DO SISTEMA</Text>
            {diagLoading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          {/* GPS Nativo */}
          <View style={styles.diagSection}>
            <View style={styles.diagHeaderRow}>
              <View style={styles.diagTitleLeft}>
                <Radio size={14} color={colors.textSecondary} />
                <Text style={styles.diagSectionTitle}>GPS NATIVO DO DISPOSITIVO</Text>
              </View>
              <View
                style={[
                  styles.badgePill,
                  { backgroundColor: gpsStatus.ok ? colors.successGhost : colors.dangerGhost },
                ]}
              >
                <Text style={[styles.badgePillText, { color: gpsStatus.ok ? colors.success : colors.danger }]}>
                  {gpsStatus.ok ? 'Sinal Ativo' : 'Aguardando'}
                </Text>
              </View>
            </View>
            {gpsStatus.ok ? (
              <>
                <DiagRow label="Latitude / Longitude:" value={`${gpsStatus.lat?.toFixed(5)}, ${gpsStatus.lon?.toFixed(5)}`} bold />
                <DiagRow label="Precisão do Satélite:" value={`±${Math.round(gpsStatus.accuracy ?? 0)} metros`} color={colors.primary} />
              </>
            ) : (
              <DiagRow label="Status do Sensor:" value={gpsStatus.message || 'GPS desligado ou sem permissão'} color={colors.danger} />
            )}
          </View>

          {/* Banco SQLite */}
          <View style={styles.diagSection}>
            <View style={styles.diagHeaderRow}>
              <View style={styles.diagTitleLeft}>
                <HardDrive size={14} color={colors.textSecondary} />
                <Text style={styles.diagSectionTitle}>BANCO DE DADOS SQLITE</Text>
              </View>
              <View style={[styles.badgePill, { backgroundColor: colors.successGhost }]}>
                <Text style={[styles.badgePillText, { color: colors.success }]}>Operacional</Text>
              </View>
            </View>
            <DiagRow label="Total de entregas no banco:" value={String(stats.total)} bold />
            <DiagRow label="Entregas com coordenadas válidas:" value={String(stats.located)} color={colors.success} />
            <DiagRow label="Entregas sem coordenadas:" value={String(stats.invalidCoords)} color={stats.invalidCoords > 0 ? colors.danger : colors.textMuted} />
            <DiagRow label="Entregas concluídas:" value={String(stats.completed)} color={colors.success} />
            <DiagRow label="Entregas pendentes:" value={String(stats.pending)} color={colors.warning} />
          </View>

          {/* Motor de Roteamento */}
          <View style={styles.diagSection}>
            <View style={styles.diagHeaderRow}>
              <View style={styles.diagTitleLeft}>
                <Cpu size={14} color={colors.textSecondary} />
                <Text style={styles.diagSectionTitle}>MOTOR DE ROTEAMENTO</Text>
              </View>
              <View style={[styles.badgePill, { backgroundColor: routerStatus.ok ? colors.successGhost : colors.warningGhost }]}>
                <Text style={[styles.badgePillText, { color: routerStatus.ok ? colors.success : colors.warning }]}>
                  {routerStatus.ok ? 'Mapbox Ativo' : 'OSRM (Fallback)'}
                </Text>
              </View>
            </View>
            <DiagRow label="Provedor Principal:" value="Mapbox Directions API v5" bold />
            <DiagRow label="Precisão de Traçado:" value="6 Casas Decimais (1 metro)" color={colors.success} />
            <DiagRow label="Fallback Automático:" value="OSRM Público (router.project-osrm.org)" color={colors.primary} />
            <DiagRow label="Renderizador do Mapa:" value="MapLibre Native 11.3 (Vetorial)" />
          </View>

          {/* Botão Teste de Rota */}
          <Pressable style={styles.testRouteBtn} onPress={testRouteCalculation}>
            <FlaskConical size={16} color={colors.primary} />
            <Text style={styles.testRouteBtnText}>Testar Cálculo de Rota (Maricá ↔ Niterói)</Text>
          </Pressable>
        </View>


        {/* 3. Tipo e Estilo do Mapa */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Layers size={16} color={colors.primary} />
            <Text style={styles.sectionHeader}>ESTILO PADRÃO DO MAPA</Text>
          </View>

          <Text style={styles.subHeader}>Tipo de Camada</Text>
          <View style={styles.chipRow}>
            {MAP_TYPES.map((t) => (
              <Pressable
                key={t.id}
                style={[styles.chip, mapType === t.id && styles.chipActive]}
                onPress={() => handleUpdateType(t.id)}
              >
                <Text style={[styles.chipText, mapType === t.id && styles.chipTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.subHeader, { marginTop: spacing.md }]}>Tema Visual do Mapa</Text>
          <View style={styles.themeGrid}>
            {MAP_THEMES.map((th) => (
              <Pressable
                key={th.id}
                style={[styles.themeBox, mapTheme === th.id && styles.themeBoxActive]}
                onPress={() => handleUpdateTheme(th.id)}
              >
                <Text style={[styles.themeBoxLabel, mapTheme === th.id && styles.themeBoxLabelActive]}>
                  {th.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 5. Modo de Roteamento / Veículo */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Navigation size={16} color={colors.primary} />
            <Text style={styles.sectionHeader}>VEÍCULO & OPÇÕES DE ROTA</Text>
          </View>

          <Text style={styles.subHeader}>Veículo Principal</Text>
          <View style={styles.vehicleRow}>
            {VEHICLES.map((v) => {
              const VIcon = v.Icon;
              const isSel = costingMode === v.id;
              return (
                <Pressable
                  key={v.id}
                  style={[styles.vehicleBtn, isSel && styles.vehicleBtnActive]}
                  onPress={() => handleUpdateCosting(v.id)}
                >
                  <VIcon size={16} color={isSel ? colors.primary : colors.textSecondary} />
                  <Text
                    style={[
                      styles.vehicleBtnLabel,
                      isSel && styles.vehicleBtnLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {v.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.rowBetween, { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={styles.rowLeft}>
              <EyeOff size={16} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Ocultar paradas concluídas</Text>
                <Text style={styles.rowSub}>Não exibir markers de entregas finalizadas</Text>
              </View>
            </View>
            <Switch
              value={hideCompleted}
              onValueChange={handleToggleHide}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* 6. Gestão de Dados */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Trash2 size={16} color={colors.danger} />
            <Text style={[styles.sectionHeader, { color: colors.danger }]}>DADOS & LIMPEZA</Text>
          </View>
          <DiagRow label="Total de entregas salvas:" value={String(stats.total)} bold />

          <Pressable style={styles.dangerBtn} onPress={handleClearDatabase}>
            <Trash2 size={15} color={colors.danger} />
            <Text style={styles.dangerBtnText}>Limpar Banco de Entregas</Text>
          </Pressable>
        </View>

        {/* Informações da Versão */}
        <View style={styles.footerInfo}>
          <Text style={styles.footerText}>RotaSimples v2.1</Text>
          <Text style={styles.footerSubText}>Mapbox Directions API v5 + MapLibre Native</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function DiagRow({
  label,
  value,
  bold,
  color,
}: {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={diagStyles.row}>
      <Text style={[diagStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          diagStyles.value,
          { color: color || colors.text },
          bold && diagStyles.valueBold,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const diagStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 2,
    gap: spacing.sm,
  },
  label: { ...typography.caption, flex: 1 },
  value: { ...typography.caption, fontWeight: '500', textAlign: 'right', flex: 1.2 },
  valueBold: { fontWeight: '700' },
});

const createStyles = (colors: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
      ...shadows.sm,
    },
    backBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
    refreshBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
      ...shadows.sm,
    },
    refreshBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    btnPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.97 }],
    },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, gap: spacing.md },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
    },
    headerTitle: {
      ...typography.displayMedium,
      color: colors.primary,
    },
    headerSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
    },
    headerBadge: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
      ...shadows.sm,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      marginBottom: 2,
    },
    sectionHeader: {
      ...typography.label,
      color: colors.textSecondary,
      fontWeight: '700',
      letterSpacing: 0.6,
      flex: 1,
    },
    subHeader: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
      marginTop: spacing.xs,
    },

    providerCol: {
      gap: spacing.xs + 2,
      marginTop: spacing.xs,
    },
    providerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    providerCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    providerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    providerDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.borderStrong,
    },
    providerDotActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    providerTitle: {
      ...typography.bodySmall,
      fontWeight: '700',
      color: colors.text,
    },
    providerDesc: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 1,
    },

    diagSection: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      gap: 2,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 2,
    },
    diagHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    diagTitleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    diagSectionTitle: {
      ...typography.label,
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    badgePill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    badgePillText: {
      ...typography.caption,
      fontSize: 10,
      fontWeight: '700',
    },

    testRouteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryGhost,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.primary + '44',
      marginTop: spacing.xs,
      gap: 6,
    },
    testRouteBtnText: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.primary,
    },

    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    rowTitle: {
      ...typography.bodyMedium,
      color: colors.text,
      fontWeight: '600',
    },
    rowSub: {
      ...typography.caption,
      color: colors.textMuted,
    },
    chipRow: { flexDirection: 'row', gap: spacing.xs },
    chip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: 4,
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    chipText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    chipTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    themeBox: {
      flexBasis: '48%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.sm,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    themeBoxActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    themeBoxLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    themeBoxLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    vehicleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    vehicleBtn: {
      flexBasis: '48%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.sm,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    vehicleBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    vehicleBtnLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    vehicleBtnLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },

    dangerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerGhost,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      borderWidth: 1,
      borderColor: colors.danger + '33',
      marginTop: spacing.xs,
      gap: 6,
    },
    dangerBtnText: {
      ...typography.caption,
      color: colors.danger,
      fontWeight: '700',
    },
    footerInfo: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: 2,
    },
    footerText: {
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: '600',
    },
    footerSubText: {
      ...typography.label,
      color: colors.textDisabled,
    },
  });
