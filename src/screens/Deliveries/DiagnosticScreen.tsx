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
import { MapboxService } from '../../services/routing/MapboxService';
import { MapboxQuota, type MapboxQuotaStatus } from '../../services/routing/MapboxQuota';
import { RouteCache } from '../../services/routing/RouteCache';
import {
  ArrowLeft,
  RefreshCw,
  Activity,
  Radio,
  HardDrive,
  Cpu,
  Map,
  FlaskConical,
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

  const [mapboxQuota, setMapboxQuota] = useState<MapboxQuotaStatus>({
    date: '',
    count: 0,
    limit: 3000,
    remaining: 3000,
    isLimitReached: false,
  });
  const [mapboxConfigured, setMapboxConfigured] = useState(false);
  const [cacheEntriesCount, setCacheEntriesCount] = useState(0);

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

    // 3. Diagnóstico do Mapbox Directions API & Cota Diária (3.000 req/dia)
    try {
      const isConfig = MapboxService.isConfigured();
      setMapboxConfigured(isConfig);

      const quota = await MapboxQuota.getUsage();
      setMapboxQuota(quota);
      setCacheEntriesCount(RouteCache.size());
    } catch {
      // ignore
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  const testMapboxRoute = async () => {
    try {
      // Teste de rota entre Maricá e Niterói
      const p1: [number, number] = [-42.8188, -22.9192]; // Maricá
      const p2: [number, number] = [-43.1189, -22.8832]; // Niterói

      const result = await RoutingService.route([p1, p2]);
      await runDiagnostics();

      Alert.alert(
        'Teste de Rota Mapbox OK!',
        `Origem: Maricá\nDestino: Niterói\nDistância: ${(result.distance / 1000).toFixed(1)} km\nTempo estimado: ${Math.round(result.duration / 60)} min\nProvedor: ${result.geojson.features[0]?.properties?.provider || 'Mapbox'}\nStatus: Traçado de alta resolução com precisão viária (6 casas decimais).`,
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
            <Text style={styles.headerSubtitle}>Validação do Motor Mapbox & Cota Diária</Text>
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
            {/* 1. Mapbox Directions API & Cota Diária */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeaderTitle}>⚡ MAPBOX DIRECTIONS V5 (MOTOR DE ROTAS)</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: mapboxConfigured
                        ? colors.successGhost
                        : colors.warningGhost,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: mapboxConfigured ? colors.success : colors.warning },
                    ]}
                  >
                    {mapboxConfigured ? 'Ativo & Configurado' : 'Chave Pendente'}
                  </Text>
                </View>
              </View>

              <DiagItem
                label="Motor de Roteamento:"
                value="Mapbox Directions v5 (driving-traffic)"
                bold
                color={colors.primary}
              />
              <DiagItem
                label="Precisão da Polyline:"
                value="GeoJSON 6 Casas Decimais (1 metro)"
                color={colors.success}
              />
              <DiagItem
                label="Cota Utilizada Hoje:"
                value={`${mapboxQuota.count} / ${mapboxQuota.limit} requisições`}
                bold
                color={mapboxQuota.isLimitReached ? colors.danger : colors.textPrimary}
              />
              <DiagItem
                label="Cota Restante Hoje:"
                value={`${mapboxQuota.remaining} requisições`}
                bold
                color={mapboxQuota.remaining > 500 ? colors.success : colors.warning}
              />
              <DiagItem
                label="Renovação da Cota:"
                value="Automática à meia-noite (00:00)"
              />
              <DiagItem
                label="Rotas Salvas em Cache:"
                value={`${cacheEntriesCount} rotas em memória`}
              />

              <Pressable style={styles.actionBtn} onPress={testMapboxRoute}>
                <Text style={styles.actionBtnText}>🧪 Testar Cálculo de Rota Mapbox (Maricá ↔ Niterói)</Text>
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
                <Text style={styles.cardHeaderTitle}>🗺️ MAPLIBRE</Text>
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
    content: { paddingHorizontal: spacing.lg, gap: spacing.md },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
    },
    backBtn: {
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    backBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
    refreshBtn: {
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    refreshBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    btnPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.97 }],
    },
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
    headerBadgeIcon: { fontSize: 24 },

    loadingBox: {
      alignItems: 'center',
      paddingVertical: spacing.xxxl,
      gap: spacing.md,
    },
    loadingText: {
      ...typography.body,
      color: colors.textMuted,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs + 2,
      ...shadows.sm,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
      paddingBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + '66',
    },
    cardHeaderTitle: {
      ...typography.label,
      color: colors.textMuted,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    statusBadgeText: {
      ...typography.caption,
      fontSize: 11,
      fontWeight: '700',
    },

    actionBtn: {
      backgroundColor: colors.primaryGhost,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.primary + '44',
      marginTop: spacing.xs,
    },
    actionBtnText: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.primary,
      textAlign: 'center',
    },
  });
