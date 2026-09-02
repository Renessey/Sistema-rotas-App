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
import { OfflineRoutingEngine } from '../../services/routing/OfflineRoutingEngine';
import { MAP_TYPES, MAP_THEMES, MapType, MapTheme } from '../../config/mapStyles';
import type { Costing, RoutingProvider } from '../../types/geo';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Activity,
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
  Radio,
  Zap,
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
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, failed: 0, located: 0, invalidCoords: 0 });

  // Diagnósticos
  const [diagLoading, setDiagLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<{
    ok: boolean;
    lat?: number;
    lon?: number;
    accuracy?: number | null;
    message?: string;
  }>({ ok: false });

  const [offlineEngineInfo, setOfflineEngineInfo] = useState({
    region: '',
    nodesCount: 0,
    edgesCount: 0,
    available: false,
  });

  const loadSettings = useCallback(async () => {
    const prefs = await MapStyleService.loadPreferences();
    setMapType(prefs.mapType);
    setMapTheme(prefs.mapTheme);
    setHideCompleted(prefs.hideCompleted);
    setCostingMode(prefs.costingMode);
    setStats(DatabaseService.getStats());

    if (OfflineRoutingEngine.isAvailable()) {
      const meta = OfflineRoutingEngine.getRegionMetadata();
      setOfflineEngineInfo({
        region: meta.region,
        nodesCount: meta.nodesCount,
        edgesCount: meta.edgesCount,
        available: true,
      });
    }
  }, []);

  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    try {
      setStats(DatabaseService.getStats());
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

    if (OfflineRoutingEngine.isAvailable()) {
      const meta = OfflineRoutingEngine.getRegionMetadata();
      setOfflineEngineInfo({
        region: meta.region,
        nodesCount: meta.nodesCount,
        edgesCount: meta.edgesCount,
        available: true,
      });
    }

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

  const handleUpdateTheme = async (theme: MapTheme) => {
    setMapTheme(theme);
    await MapStyleService.setMapTheme(theme);
  };

  const handleToggleHide = async (val: boolean) => {
    setHideCompleted(val);
    await MapStyleService.setHideCompleted(val);
  };

  const handleUpdateCosting = async (mode: Costing) => {
    setCostingMode(mode);
    await MapStyleService.setCostingMode(mode);
  };

  const testRouteCalculation = async () => {
    try {
      const p1: [number, number] = [-42.8188, -22.9192];
      const p2: [number, number] = [-43.1189, -22.8832];
      const t0 = Date.now();
      const result = await RoutingService.route([p1, p2]);
      const delta = Date.now() - t0;

      Alert.alert(
        'Teste de Rota Offline OK! 🚀',
        `Origem: Maricá\nDestino: Niterói\nDistância: ${(result.distance / 1000).toFixed(1)} km\nTempo estimado: ${Math.round(result.duration / 60)} min\nTempo de cálculo: ${delta} ms\nPontos de curva: ${result.geojson.features[0]?.geometry.coordinates.length}\nMotor: OpenStreetMap Nativo (100% Offline)`,
      );
    } catch (e: any) {
      Alert.alert('Erro no teste de rota', e?.message || 'Falha ao calcular rota offline.');
    }
  };

  const handleClearDatabase = () => {
    Alert.alert(
      'Limpar Todas as Entregas?',
      'Esta ação irá apagar permanentemente todas as entregas salvas no banco de dados local.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar Tudo',
          style: 'destructive',
          onPress: () => {
            DatabaseService.clearAll();
            setStats(DatabaseService.getStats());
            Alert.alert('Sucesso', 'Banco de entregas limpo.');
          },
        },
      ],
    );
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
        {/* Top Bar */}
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
            <Text style={styles.refreshBtnText}>Atualizar</Text>
          </Pressable>
        </View>

        {/* Header Title */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Configurações</Text>
            <Text style={styles.headerSub}>Motor de Rotas 100% Offline & Preferências</Text>
          </View>
          <View style={styles.headerIcon}>
            <SettingsIcon size={22} color={colors.primary} />
          </View>
        </View>

        {/* 1. Status do Motor Offline OSM */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Zap size={16} color={colors.primary} />
            <Text style={styles.sectionHeader}>MOTOR DE ROTEAMENTO NATIVO (OSM)</Text>
          </View>

          <View style={styles.providerCardActive}>
            <View style={styles.providerLeft}>
              <View style={styles.providerDotActive} />
              <View style={{ flex: 1 }}>
                <Text style={styles.providerTitle}>Motor Nativo OpenStreetMap</Text>
                <Text style={styles.providerDesc}>
                  Calcula rotas curva a curva e otimiza dezenas de paradas sem internet, com custo zero e sem limite de requisições.
                </Text>
              </View>
            </View>
            <View style={[styles.badgePill, { backgroundColor: colors.successGhost }]}>
              <Text style={[styles.badgePillText, { color: colors.success }]}>
                100% Ilimitado
              </Text>
            </View>
          </View>

          <View style={{ marginTop: spacing.sm, gap: 4 }}>
            <DiagRow label="Região Viária:" value={offlineEngineInfo.region || 'Maricá - Niterói - SG'} color={colors.primary} bold />
            <DiagRow label="Nós Viários Indexados:" value={`${offlineEngineInfo.nodesCount.toLocaleString('pt-BR')} nós`} />
            <DiagRow label="Trechos com Curvas Reais:" value={`${offlineEngineInfo.edgesCount.toLocaleString('pt-BR')} vias`} />
          </View>
        </View>

        {/* 2. Diagnóstico do Sistema */}
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

          {/* Botão Teste de Rota */}
          <Pressable style={styles.testRouteBtn} onPress={testRouteCalculation}>
            <FlaskConical size={16} color={colors.primary} />
            <Text style={styles.testRouteBtnText}>Testar Cálculo de Rota Offline (Maricá ↔ Niterói)</Text>
          </Pressable>
        </View>

        {/* 3. Estilo e Camadas do Mapa */}
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

        {/* 4. Modo de Roteamento / Veículo */}
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

        {/* 5. Gestão de Dados */}
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
          <Text style={styles.footerSubText}>Motor Nativo Offline OpenStreetMap + MapLibre</Text>
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
      opacity: 0.7,
      transform: [{ scale: 0.98 }],
    },
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    headerTitle: {
      ...typography.headline,
      color: colors.text,
      fontWeight: '800',
    },
    headerSub: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: 2,
    },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: spacing.md,
    },
    sectionHeader: {
      ...typography.label,
      color: colors.textSecondary,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    subHeader: {
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: '700',
      marginBottom: spacing.xs,
    },
    providerCardActive: {
      backgroundColor: colors.primaryGhost,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.primary,
      gap: spacing.sm,
    },
    providerLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    providerDotActive: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
      marginTop: 4,
    },
    providerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    providerDesc: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: 2,
      lineHeight: 16,
    },
    badgePill: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    badgePillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    diagSection: {
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    diagHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    diagTitleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    diagSectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.3,
    },
    testRouteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryGhost,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primary,
      gap: 6,
      marginTop: spacing.xs,
    },
    testRouteBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    chipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    themeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    themeBox: {
      flex: 1,
      minWidth: '45%',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    themeBoxActive: {
      backgroundColor: colors.primaryGhost,
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    themeBoxLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    themeBoxLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    vehicleRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    vehicleBtn: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    vehicleBtnActive: {
      backgroundColor: colors.primaryGhost,
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    vehicleBtnLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    vehicleBtnLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    rowTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    rowSub: {
      ...typography.caption,
      color: colors.textMuted,
    },
    dangerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerGhost,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.danger,
      gap: 6,
      marginTop: spacing.sm,
    },
    dangerBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.danger,
    },
    footerInfo: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: 2,
    },
    footerText: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    footerSubText: {
      fontSize: 10,
      color: colors.textMuted,
    },
  });
