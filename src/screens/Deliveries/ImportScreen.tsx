import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { ImportService, ParsedSpreadsheet } from '../../services/import/ImportService';
import { ValidationService } from '../../services/validation/ValidationService';
import { GeocodingService } from '../../services/geocoding/GeocodingService';
import { GoogleQuotaManager, QuotaExceededError } from '../../services/geocoding/GoogleQuotaManager';
import { ValhallaService } from '../../services/routing/ValhallaService';
import { DatabaseService } from '../../storage/DatabaseService';
import ColumnMappingModal from '../../components/ColumnMappingModal';
import type { ColumnMappingConfig } from '../../types/geo';
import { colors, spacing, radius, shadows, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Import'>;

type Phase = 'idle' | 'reading' | 'mapping' | 'validating' | 'geocoding' | 'done' | 'error';

interface GeoLog {
  name: string;
  provider: string;
  success: boolean;
}

export default function ImportScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [geoLogs, setGeoLogs] = useState<GeoLog[]>([]);
  const [parsedData, setParsedData] = useState<ParsedSpreadsheet | null>(null);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    valid: number;
    withoutAddress: number;
    withoutCep: number;
    duplicates: number;
    emptyRows: number;
    geocoded: number;
    failed: number;
  } | null>(null);
  const [geocodeProgress, setGeocodeProgress] = useState(0);
  const [geocodeTotal, setGeocodeTotal] = useState(0);
  const [quotaInfo, setQuotaInfo] = useState<{
    count: number;
    limit: number;
    remaining: number;
  }>({ count: 0, limit: 300, remaining: 300 });

  const refreshQuota = useCallback(async () => {
    try {
      const usage = await GoogleQuotaManager.getUsage();
      setQuotaInfo({
        count: usage.count,
        limit: usage.limit,
        remaining: usage.remaining,
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  const isBusy = phase === 'reading' || phase === 'validating' || phase === 'geocoding';

  const formatProviderName = (provider: string): string => {
    switch (provider) {
      case 'google':
        return 'Google Geocoding';
      case 'spreadsheet':
        return 'Planilha';
      case 'cache':
        return 'Cache Local';
      case 'viacep+nominatim':
        return 'ViaCEP + Google';
      case 'nominatim':
        return 'OpenStreetMap';
      case 'photon':
        return 'Photon';
      case 'brasilapi':
        return 'BrasilAPI';
      default:
        return provider;
    }
  };

  const handleImport = async () => {
    try {
      setPhase('reading');
      setMessage('Selecionando e lendo arquivo…');
      setGeoLogs([]);
      setSummary(null);

      const parsed = await ImportService.pickAndParseSpreadsheet();
      if (!parsed || parsed.rows.length === 0) {
        setPhase('idle');
        setMessage('Nenhuma linha encontrada ou importação cancelada.');
        return;
      }

      setParsedData(parsed);
      setShowMappingModal(true);
      setPhase('mapping');
    } catch (error) {
      console.error('[ImportScreen]', error);
      setPhase('error');
      setMessage('Erro ao importar o arquivo. Verifique o formato (.xlsx, .csv ou .txt).');
    }
  };

  const processWithMapping = async (mapping: ColumnMappingConfig) => {
    if (!parsedData || parsedData.rows.length === 0) return;
    setShowMappingModal(false);

    try {
      setPhase('validating');
      setMessage('Validando registros…');

      const normalized = ImportService.applyMapping(parsedData.rows, mapping);
      const result = ValidationService.validate(normalized);

      // Geocode records that have address but no coordinates
      const toGeocode = result.valid.filter(
        (d) => d.latitude === null || d.longitude === null,
      );
      setGeocodeTotal(toGeocode.length);
      setGeocodeProgress(0);

      const logs: GeoLog[] = [];
      let quotaExceeded = false;

      if (toGeocode.length > 0) {
        setPhase('geocoding');

        for (let i = 0; i < toGeocode.length; i++) {
          const delivery = toGeocode[i];
          setMessage(`Buscando no Google Maps (${i + 1}/${toGeocode.length})…`);

          // 1. Tenta coordenadas já existentes na linha da planilha
          const fromRow = GeocodingService.resolveFromRow(delivery);
          if (fromRow) {
            delivery.latitude = fromRow.latitude;
            delivery.longitude = fromRow.longitude;
            delivery.geocodingStatus = 'success';
            delivery.geocodingSource = fromRow.provider;
            logs.push({
              name: delivery.name,
              provider: formatProviderName(fromRow.provider),
              success: true,
            });
          } else {
            // 2. Verifica cota antes de chamar a API
            const hasQuota = await GoogleQuotaManager.hasQuotaAvailable();
            if (!hasQuota) {
              quotaExceeded = true;
              delivery.geocodingStatus = 'pending';
              logs.push({
                name: delivery.name,
                provider: 'Cota diária atingida (300/300)',
                success: false,
              });

              for (let j = i + 1; j < toGeocode.length; j++) {
                toGeocode[j].geocodingStatus = 'pending';
              }
              break;
            }

            try {
              console.log(
                `[ImportScreen] Google Search #${i + 1} ("${delivery.name}") → "${delivery.address}"`,
              );
              const searchRes = await GeocodingService.searchByNameAndAddress({
                name: delivery.name,
                address: delivery.address,
                number: delivery.number,
                neighborhood: delivery.neighborhood,
                city: delivery.city,
                state: delivery.state,
                cep: delivery.cep,
              });

              if (searchRes.success && searchRes.latitude !== undefined && searchRes.longitude !== undefined) {
                delivery.latitude = searchRes.latitude;
                delivery.longitude = searchRes.longitude;
                delivery.geocodingStatus = 'success';
                delivery.geocodingSource = searchRes.provider || 'google';
                if (searchRes.formattedAddress) {
                  delivery.address = searchRes.formattedAddress;
                }
                logs.push({
                  name: delivery.name,
                  provider: formatProviderName(searchRes.provider || 'google'),
                  success: true,
                });
              } else {
                delivery.geocodingStatus = 'failed';
                logs.push({
                  name: delivery.name,
                  provider: 'Não localizado',
                  success: false,
                });
              }
            } catch (err: unknown) {
              if (err instanceof QuotaExceededError) {
                quotaExceeded = true;
                delivery.geocodingStatus = 'pending';
                logs.push({
                  name: delivery.name,
                  provider: 'Limite de 300 req atingido',
                  success: false,
                });
                for (let j = i + 1; j < toGeocode.length; j++) {
                  toGeocode[j].geocodingStatus = 'pending';
                }
                break;
              } else {
                delivery.geocodingStatus = 'failed';
                logs.push({
                  name: delivery.name,
                  provider: 'Falha na consulta',
                  success: false,
                });
              }
            }

            // Throttling: intervalo de 200ms entre cada requisição sequencial
            if (i < toGeocode.length - 1) {
              await new Promise<void>((resolve) => setTimeout(() => resolve(), 200));
            }
          }

          // Snapping no Valhalla se tiver coordenadas
          if (delivery.latitude !== null && delivery.longitude !== null) {
            try {
              const snap = await ValhallaService.locate(
                [delivery.longitude, delivery.latitude],
                { radius: 100 },
              );
              if (snap.matched && snap.snapped) {
                delivery.snappedLongitude = snap.snapped[0];
                delivery.snappedLatitude = snap.snapped[1];
              } else {
                delivery.snappedLongitude = delivery.longitude;
                delivery.snappedLatitude = delivery.latitude;
              }
            } catch {
              delivery.snappedLongitude = delivery.longitude;
              delivery.snappedLatitude = delivery.latitude;
            }
          }

          setGeocodeProgress(i + 1);
          setGeoLogs([...logs]);
        }
      }

      // Persiste todas as entregas válidas no banco SQLite
      DatabaseService.clearDeliveries();
      result.valid.forEach((d) => DatabaseService.insertDelivery(d));

      const geocodedFinal = result.valid.filter(
        (d) => d.latitude !== null && d.longitude !== null,
      ).length;

      setSummary({
        total: result.total,
        valid: result.valid.length,
        withoutAddress: result.withoutAddress.length,
        withoutCep: result.withoutCep.length,
        duplicates: result.duplicates.length,
        emptyRows: result.emptyRows.length,
        geocoded: geocodedFinal,
        failed: result.valid.length - geocodedFinal,
      });

      await refreshQuota();

      if (quotaExceeded) {
        Alert.alert(
          'Limite Diário Atingido',
          'O limite diário de 300 consultas do Google Geocoding foi atingido para hoje. As entregas restantes foram salvas para revisão manual.',
          [{ text: 'Entendido' }],
        );
      }

      setPhase('done');
      setMessage(
        `${result.valid.length} entregas importadas — ${geocodedFinal} localizadas com Google Maps, ${
          result.valid.length - geocodedFinal
        } para resolver manualmente.`,
      );
    } catch (error) {
      console.error('[ImportScreen processWithMapping]', error);
      setPhase('error');
      setMessage('Erro ao processar e geocodificar as linhas da planilha.');
    }
  };

  const progressPct = geocodeTotal > 0 ? geocodeProgress / geocodeTotal : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero section */}
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>📊</Text>
        <Text style={styles.heroTitle}>Importar Entregas</Text>
        <Text style={styles.heroSub}>
          Selecione uma planilha <Text style={styles.bold}>.xlsx</Text>,{' '}
          <Text style={styles.bold}>.csv</Text> ou <Text style={styles.bold}>.txt</Text>.{'\n'}
          Geocodificação de alta precisão via <Text style={styles.bold}>Google Maps API</Text>.
        </Text>
      </View>

      {/* Quota indicator */}
      <View style={styles.quotaCard}>
        <View style={styles.quotaHeader}>
          <Text style={styles.quotaTitle}>⚡ Cota Diária Google Geocoding</Text>
          <View
            style={[
              styles.quotaBadge,
              {
                backgroundColor:
                  quotaInfo.remaining > 50
                    ? colors.successGhost
                    : quotaInfo.remaining > 0
                    ? colors.warningGhost
                    : colors.dangerGhost,
              },
            ]}
          >
            <Text
              style={[
                styles.quotaBadgeText,
                {
                  color:
                    quotaInfo.remaining > 50
                      ? colors.success
                      : quotaInfo.remaining > 0
                      ? colors.warning
                      : colors.danger,
                },
              ]}
            >
              {quotaInfo.count} / {quotaInfo.limit} usadas hoje
            </Text>
          </View>
        </View>
        <Text style={styles.quotaSub}>
          Limite de 300 consultas/dia com intervalo de 200ms por requisição para controle de taxa e custo.
        </Text>
      </View>

      {/* Supported columns info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Colunas reconhecidas automaticamente:</Text>
        <View style={styles.colList}>
          {[
            ['Nome/Cliente', 'Endereço/Rua'],
            ['Número', 'Complemento'],
            ['Bairro', 'Cidade'],
            ['Estado/UF', 'CEP'],
            ['Telefone/Celular', 'Pedido/Código'],
            ['Latitude', 'Longitude'],
          ].map(([a, b], i) => (
            <View key={i} style={styles.colRow}>
              <Text style={styles.colChip}>{a}</Text>
              <Text style={styles.colChip}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Import Button */}
      <Pressable
        style={[styles.importBtn, isBusy && styles.importBtnDisabled]}
        disabled={isBusy}
        onPress={handleImport}
      >
        {isBusy ? (
          <View style={styles.importBtnContent}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.importBtnText}>Processando…</Text>
          </View>
        ) : (
          <Text style={styles.importBtnText}>📄 Selecionar Arquivo (.xlsx / .csv)</Text>
        )}
      </Pressable>

      {/* Geocoding progress */}
      {phase === 'geocoding' && (
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Geocodificando com Google Maps</Text>
            <Text style={styles.progressPct}>{Math.round(progressPct * 100)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${progressPct * 100}%` as any }]}
            />
          </View>
          <Text style={styles.progressSub}>
            {geocodeProgress} de {geocodeTotal} endereços
          </Text>
          <Text style={styles.progressMsg}>{message}</Text>
        </View>
      )}

      {/* Geocoding log */}
      {geoLogs.length > 0 && (
        <View style={styles.logCard}>
          <Text style={styles.logTitle}>Log de Geocodificação (Google)</Text>
          {geoLogs.slice(-10).map((log, i) => (
            <View key={i} style={styles.logRow}>
              <Text
                style={[
                  styles.logIcon,
                  { color: log.success ? colors.success : colors.danger },
                ]}
              >
                {log.success ? '✅' : '❌'}
              </Text>
              <Text style={styles.logName} numberOfLines={1}>
                {log.name}
              </Text>
              <View
                style={[
                  styles.providerBadge,
                  {
                    backgroundColor: log.success
                      ? colors.primaryGhost
                      : colors.warningGhost,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.providerText,
                    {
                      color: log.success ? colors.primary : colors.warning,
                    },
                  ]}
                >
                  {log.provider}
                </Text>
              </View>
            </View>
          ))}
          {geoLogs.length > 10 && (
            <Text style={styles.logMore}>
              … e mais {geoLogs.length - 10} registros
            </Text>
          )}
        </View>
      )}

      {/* Status messages */}
      {phase === 'error' && (
        <View
          style={[
            styles.msgCard,
            {
              borderColor: colors.danger + '44',
              backgroundColor: colors.dangerGhost,
            },
          ]}
        >
          <Text style={styles.msgIcon}>❌</Text>
          <Text style={[styles.msgText, { color: colors.danger }]}>{message}</Text>
        </View>
      )}

      {/* Summary */}
      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Resumo da Importação</Text>
          <SummaryRow
            label="Total de linhas"
            value={summary.total}
            color={colors.primary}
          />
          <SummaryRow
            label="Válidas"
            value={summary.valid}
            color={colors.success}
          />
          <SummaryRow
            label="Com localização"
            value={summary.geocoded}
            color={colors.success}
          />
          <SummaryRow
            label="Para resolver"
            value={summary.failed}
            color={summary.failed > 0 ? colors.warning : colors.textMuted}
          />
          <SummaryRow
            label="Sem endereço"
            value={summary.withoutAddress}
            color={colors.danger}
          />
          <SummaryRow
            label="Sem CEP"
            value={summary.withoutCep}
            color={colors.warning}
          />
          <SummaryRow
            label="Duplicados"
            value={summary.duplicates}
            color={colors.warning}
          />
          <SummaryRow
            label="Linhas vazias"
            value={summary.emptyRows}
            color={colors.textMuted}
          />
        </View>
      )}

      {/* Done: success message + actions */}
      {phase === 'done' && (
        <View style={styles.doneCard}>
          <Text style={styles.doneIcon}>🎉</Text>
          <Text style={styles.doneMsg}>{message}</Text>
          <View style={styles.doneActions}>
            <Pressable
              style={styles.doneSecBtn}
              onPress={() => navigation.navigate('Deliveries')}
            >
              <Text style={styles.doneSecBtnText}>📋 Ver Lista</Text>
            </Pressable>
            <Pressable
              style={styles.donePrimBtn}
              onPress={() => navigation.navigate('Map')}
            >
              <Text style={styles.donePrimBtnText}>🗺️ Ver no Mapa</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Modal de Mapeamento de Colunas da Planilha */}
      {parsedData && (
        <ColumnMappingModal
          visible={showMappingModal}
          headers={parsedData.headers}
          firstRow={parsedData.rows[0]}
          totalRows={parsedData.rows.length}
          fileName={parsedData.fileName}
          onClose={() => {
            setShowMappingModal(false);
            setPhase('idle');
            setMessage('');
          }}
          onConfirm={processWithMapping}
        />
      )}
    </ScrollView>
  );
}

function SummaryRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={summaryStyles.row}>
      <Text style={summaryStyles.label}>{label}</Text>
      <View style={[summaryStyles.badge, { backgroundColor: color + '18' }]}>
        <Text style={[summaryStyles.value, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },

  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  heroIcon: { fontSize: 48 },
  heroTitle: { ...typography.headline, color: colors.text },
  heroSub: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  bold: { fontWeight: '700', color: colors.text },

  quotaCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadows.sm,
  },
  quotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quotaTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  quotaBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  quotaBadgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  quotaSub: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 16,
  },

  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadows.sm,
  },
  infoTitle: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  infoSubtext: { ...typography.caption, color: colors.textSecondary, lineHeight: 17 },
  colList: { gap: spacing.xs },
  colRow: { flexDirection: 'row', gap: spacing.xs },
  colChip: {
    ...typography.caption,
    color: colors.primary,
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    fontWeight: '600',
  },

  importBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    ...shadows.colored(colors.primary),
  },
  importBtnDisabled: { opacity: 0.6, ...shadows.sm },
  importBtnContent: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  importBtnText: { color: '#fff', ...typography.titleSmall, fontWeight: '700' },

  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.sm,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  progressPct: { ...typography.titleSmall, color: colors.primary },
  progressTrack: { height: 8, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.success, borderRadius: radius.full },
  progressSub: { ...typography.caption, color: colors.textMuted },
  progressMsg: { ...typography.caption, color: colors.primary },

  logCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadows.sm,
  },
  logTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logIcon: { fontSize: 13, width: 20 },
  logName: { ...typography.bodySmall, color: colors.text, flex: 1 },
  providerBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  providerText: { ...typography.caption, fontWeight: '600' },
  logMore: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },

  msgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  msgIcon: { fontSize: 20 },
  msgText: { ...typography.body, flex: 1 },

  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadows.sm,
  },
  summaryTitle: { ...typography.titleSmall, color: colors.text, marginBottom: spacing.sm },

  doneCard: {
    backgroundColor: colors.successGhost,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.success + '44',
  },
  doneIcon: { fontSize: 40 },
  doneMsg: { ...typography.body, color: colors.text, textAlign: 'center', lineHeight: 22 },
  doneActions: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  doneSecBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  doneSecBtnText: { ...typography.bodyMedium, color: colors.text },
  donePrimBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  donePrimBtnText: { ...typography.bodyMedium, color: '#fff', fontWeight: '700' },
});

const summaryStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  label: { ...typography.body, color: colors.textSecondary },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, minWidth: 36, alignItems: 'center' },
  value: { ...typography.bodyMedium, fontWeight: '700' },
});
