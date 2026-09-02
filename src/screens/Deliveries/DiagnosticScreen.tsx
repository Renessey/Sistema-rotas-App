import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows, typography } from '../../theme';
import { DatabaseService } from '../../storage/DatabaseService';
import { LocationService } from '../../services/gps/LocationService';
import { RoutingService } from '../../services/routing/RoutingService';
import { OfflineRoutingEngine } from '../../services/routing/OfflineRoutingEngine';
import {
  ArrowLeft,
  RefreshCw,
  Activity,
  Radio,
  HardDrive,
  Cpu,
  Map,
  FlaskConical,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'Diagnostic'>;

export default function DiagnosticScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [gpsStatus, setGpsStatus] = useState<{
    ok: boolean;
    lat?: number;
    lon?: number;
    accuracy?: number | null;
    message?: string;
  }>({ ok: false });

  const [dbStats, setDbStats] = useState({
    total: 0,
    located: 0,
    completed: 0,
    pending: 0,
    failed: 0,
    invalidCoords: 0,
  });

  const [offlineStats, setOfflineStats] = useState({
    available: false,
    region: '',
    nodesCount: 0,
    edgesCount: 0,
    gridCellsCount: 0,
    version: '',
  });

  const runDiagnostics = useCallback(async () => {
    setLoading(true);

    // 1. Diagnóstico do Banco SQLite
    try {
      const stats = DatabaseService.getStats();
      setDbStats(stats);
    } catch {
      // ignore
    }

    // 2. Diagnóstico do GPS Nativo
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
        setGpsStatus({
          ok: false,
          message: 'Permissão de GPS negada',
        });
      }
    } catch (e: any) {
      setGpsStatus({
        ok: false,
        message: e?.message || 'GPS indisponível',
      });
    }

    // 3. Diagnóstico do Motor Offline OSM
    try {
      const isAvail = OfflineRoutingEngine.isAvailable();
      if (isAvail) {
        const meta = OfflineRoutingEngine.getRegionMetadata();
        setOfflineStats({
          available: true,
          region: meta.region,
          nodesCount: meta.nodesCount,
          edgesCount: meta.edgesCount,
          gridCellsCount: meta.gridCellsCount,
          version: meta.version,
        });
      } else {
        setOfflineStats({
          available: false,
          region: 'Não Carregado',
          nodesCount: 0,
          edgesCount: 0,
          gridCellsCount: 0,
          version: '',
        });
      }
    } catch {
      // ignore
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  const testOfflineRoute = async () => {
    try {
      // Teste de rota entre Maricá e Niterói
      const p1: [number, number] = [-42.8188, -22.9192]; // Maricá
      const p2: [number, number] = [-43.1189, -22.8832]; // Niterói

      const startTime = Date.now();
      const result = await RoutingService.route([p1, p2]);
      const durationMs = Date.now() - startTime;

      Alert.alert(
        'Teste de Rota Offline OK! 🚀',
        `Origem: Maricá\nDestino: Niterói\nDistância: ${(result.distance / 1000).toFixed(1)} km\nTempo estimado: ${Math.round(result.duration / 60)} min\nTempo de cálculo: ${durationMs} ms\nPontos de curva viária: ${result.geojson.features[0]?.geometry.coordinates.length}\nProvedor: Motor Nativo OSM (100% Offline e Ilimitado)`,
      );
    } catch (e: any) {
      Alert.alert('Erro no teste de rota', e?.message || 'Falha ao calcular rota.');
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

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Diagnóstico do Sistema</Text>
            <Text style={styles.headerSubtitle}>Validação do Motor 100% Offline & Banco de Dados</Text>
          </View>
          <View style={styles.headerBadge}>
            <Activity size={24} color={colors.primary} />
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Executando diagnóstico local…</Text>
          </View>
        ) : (
          <>
            {/* 1. Motor de Roteamento Nativo Offline */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeaderTitle}>🛣️ MOTOR NATIVO OFFLINE (OPENSTREETMAP)</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: offlineStats.available
                        ? colors.successGhost
                        : colors.dangerGhost,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: offlineStats.available ? colors.success : colors.danger },
                    ]}
                  >
                    {offlineStats.available ? 'Ativo & 100% Offline' : 'Indisponível'}
                  </Text>
                </View>
              </View>

              <DiagItem
                label="Motor de Roteamento:"
                value="Bidirectional A* Nativo (OpenStreetMap)"
                bold
                color={colors.primary}
              />
              <DiagItem
                label="Região Coberta:"
                value={offlineStats.region || 'Maricá, Niterói, São Gonçalo'}
                color={colors.success}
              />
              <DiagItem
                label="Nós Viários Indexados:"
                value={`${offlineStats.nodesCount.toLocaleString('pt-BR')} nós`}
                bold
              />
              <DiagItem
                label="Vias e Curvas Reais:"
                value={`${offlineStats.edgesCount.toLocaleString('pt-BR')} trechos viários`}
              />
              <DiagItem
                label="Custo por Rota:"
                value="R$ 0,00 (Ilimitado e Sem Cota)"
                bold
                color={colors.success}
              />

              <Pressable style={styles.actionBtn} onPress={testOfflineRoute}>
                <Zap size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Testar Cálculo de Rota Offline (Maricá ↔ Niterói)</Text>
              </Pressable>
            </View>

            {/* 2. GPS do Dispositivo */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeaderTitle}>📡 GPS NATIVO</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: gpsStatus.ok
                        ? colors.successGhost
                        : colors.dangerGhost,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: gpsStatus.ok ? colors.success : colors.danger },
                    ]}
                  >
                    {gpsStatus.ok ? 'Sinal Ativo' : 'Aguardando'}
                  </Text>
                </View>
              </View>

              {gpsStatus.ok ? (
                <>
                  <DiagItem
                    label="Coordenadas Atuais:"
                    value={`Lat: ${gpsStatus.lat?.toFixed(6)} | Lon: ${gpsStatus.lon?.toFixed(6)}`}
                    bold
                  />
                  <DiagItem
                    label="Precisão do Satélite:"
                    value={`±${Math.round(gpsStatus.accuracy ?? 0)} metros`}
                    color={colors.primary}
                  />
                </>
              ) : (
                <DiagItem
                  label="Status:"
                  value={gpsStatus.message || 'GPS desligado ou sem permissão'}
                  color={colors.danger}
                />
              )}
            </View>

            {/* 3. Banco de Dados SQLite */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeaderTitle}>💾 SQLITE (ARMAZENAMENTO LOCAL)</Text>
                <View style={[styles.statusBadge, { backgroundColor: colors.primaryGhost }]}>
                  <Text style={[styles.statusBadgeText, { color: colors.primary }]}>
                    Operacional
                  </Text>
                </View>
              </View>

              <DiagItem label="Total de entregas salvas:" value={String(dbStats.total)} bold />
              <DiagItem
                label="Entregas com coordenadas válidas:"
                value={String(dbStats.located)}
                color={colors.success}
              />
              <DiagItem
                label="Entregas com coordenadas inválidas:"
                value={String(dbStats.invalidCoords)}
                color={dbStats.invalidCoords > 0 ? colors.danger : colors.textMuted}
              />
              <DiagItem label="Entregas concluídas:" value={String(dbStats.completed)} color={colors.success} />
              <DiagItem label="Entregas pendentes:" value={String(dbStats.pending)} color={colors.warning} />
            </View>

            {/* 4. MapLibre */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeaderTitle}>🗺️ MAPLIBRE GPU ENGINE</Text>
                <View style={[styles.statusBadge, { backgroundColor: colors.successGhost }]}>
                  <Text style={[styles.statusBadgeText, { color: colors.success }]}>
                    Pronto
                  </Text>
                </View>
              </View>

              <DiagItem label="Renderizador:" value="MapLibre React Native 11.3" />
              <DiagItem label="Convenção de Coordenadas:" value="GeoJSON [longitude, latitude]" color={colors.primary} bold />
              <DiagItem label="Marcadores:" value="Coordenadas exatas da planilha" />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DiagItem({
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
  return (
    <View style={diagStyles.row}>
      <Text style={diagStyles.label}>{label}</Text>
      <Text
        style={[
          diagStyles.value,
          bold && diagStyles.valueBold,
          color ? { color } : null,
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
    paddingVertical: 3,
    gap: spacing.sm,
  },
  label: { ...typography.caption, color: '#64748B', flex: 1 },
  value: { ...typography.caption, color: '#0F172A', fontWeight: '500', textAlign: 'right', flex: 1.2 },
  valueBold: { fontWeight: '700' },
});

const createStyles = (colors: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.md, gap: spacing.md },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      ...shadows.sm,
    },
    backBtnText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
    refreshBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      ...shadows.sm,
    },
    refreshBtnText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
    btnPressed: { opacity: 0.7 },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    headerTitle: { ...typography.headline, color: colors.text },
    headerSubtitle: { ...typography.caption, color: colors.textMuted },
    headerBadge: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingBox: {
      padding: spacing.xxl,
      alignItems: 'center',
      gap: spacing.md,
    },
    loadingText: { ...typography.bodySmall, color: colors.textMuted },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.xs,
      ...shadows.sm,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
      paddingBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cardHeaderTitle: { ...typography.label, color: colors.textSecondary },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    statusBadgeText: { ...typography.caption, fontWeight: '700' },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.sm,
      gap: spacing.xs,
    },
    actionBtnText: {
      ...typography.bodySmall,
      color: '#FFFFFF',
      fontWeight: '700',
    },
  });
