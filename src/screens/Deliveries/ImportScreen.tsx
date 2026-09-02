import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { ImportService, ParsedSpreadsheet, GeocodingSnapProgress } from '../../services/import/ImportService';
import { DatabaseService } from '../../storage/DatabaseService';
import ColumnMappingModal from '../../components/ColumnMappingModal';
import type { ColumnMappingConfig, DeliveryEntity } from '../../types/geo';
import type { ImportConversionReport } from '../../utils/coordinateParser';
import { spacing, radius, shadows, typography } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import {
  FileSpreadsheet,
  Zap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Save,
  Map,
  ListOrdered,
  RefreshCw,
  Tag,
  Upload,
  Compass,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'Import'>;

type Phase = 'idle' | 'reading' | 'mapping' | 'geocoding' | 'preview' | 'done' | 'error';

export default function ImportScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [parsedData, setParsedData] = useState<ParsedSpreadsheet | null>(null);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [importedDeliveries, setImportedDeliveries] = useState<Omit<DeliveryEntity, 'id'>[]>([]);
  const [geocodingProgress, setGeocodingProgress] = useState<GeocodingSnapProgress | null>(null);
  const [report, setReport] = useState<ImportConversionReport | null>(null);
  const [listName, setListName] = useState('');

  const isBusy = phase === 'reading' || phase === 'geocoding';

  const handlePickFile = async () => {
    try {
      setPhase('reading');
      setMessage('Selecionando e lendo arquivo…');
      setReport(null);
      setImportedDeliveries([]);
      setGeocodingProgress(null);

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
      setMessage('Erro ao importar o arquivo. Verifique o formato (.xlsx ou .csv).');
    }
  };

  const handleMappingConfirm = async (mapping: ColumnMappingConfig) => {
    if (!parsedData || parsedData.rows.length === 0) return;
    setShowMappingModal(false);

    try {
      setPhase('geocoding');
      setMessage('Geocodificando e alinhando paradas à malha viária (Snap v2)…');

      const mapped = ImportService.applyMapping(parsedData.rows, mapping);

      // Executa Geocoding + Snap v2 viário
      const result = await ImportService.geolocalizeAndSnapDeliveries(
        mapped.deliveries,
        (prog) => {
          setGeocodingProgress(prog);
        },
      );

      setImportedDeliveries(result.deliveries);

      const validCount = result.deliveries.filter((d) => d.latitude !== null && d.longitude !== null).length;
      const invalidCount = result.deliveries.length - validCount;
      setReport({
        totalRows: result.deliveries.length,
        validCoordsCount: validCount,
        invalidCoordsCount: invalidCount,
        suspiciousCoordsCount: 0,
        missingCoordsCount: invalidCount,
      });

      const existingLists = DatabaseService.getAllLists();
      const nextNum = existingLists.length + 1;
      setListName(`Lista ${nextNum}`);

      setPhase('preview');
      setMessage(
        `${result.deliveries.length} entregas processadas: ${validCount} geolocalizadas e alinhadas na via (Snap v2).`,
      );
    } catch (error) {
      console.error('[ImportScreen applyMapping]', error);
      setPhase('error');
      setMessage('Erro ao processar as colunas e geolocalizar as entregas.');
    }
  };

  const handleSaveToDatabase = () => {
    if (importedDeliveries.length === 0) return;

    const finalName = listName.trim() || `Lista ${DatabaseService.getAllLists().length + 1}`;
    const listId = DatabaseService.createList(finalName, parsedData?.fileName);
    DatabaseService.saveDeliveriesBatch(listId, importedDeliveries);

    setPhase('done');
    setMessage(
      `${importedDeliveries.length} entregas salvas com sucesso na "${finalName}".`,
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Section */}
      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <FileSpreadsheet size={32} color={colors.primary} />
        </View>
        <Text style={styles.heroTitle}>Importar Planilha</Text>
        <Text style={styles.heroSub}>
          Importação <Text style={styles.bold}>100% Offline</Text> com coordenadas exatas da planilha (.xlsx ou .csv).
        </Text>
      </View>

      {/* Info Card: Regras de Importação Offline */}
      <View style={styles.infoCard}>
        <View style={styles.infoTitleRow}>
          <Zap size={16} color={colors.primary} />
          <Text style={styles.infoTitle}>Padrão Oficial de Importação Offline:</Text>
        </View>
        <Text style={styles.infoSubtext}>
          A localização é extraída com <Text style={styles.bold}>precisão matemática exata</Text> das colunas Latitude e Longitude da sua planilha, sem depender de internet.
        </Text>
        <View style={styles.colList}>
          {[
            ['Destination', 'Latitude'],
            ['Bairro', 'Longitude'],
            ['City', 'ZipCode / Postal Code'],
            ['Pedido', 'Telefone'],
          ].map(([a, b], i) => (
            <View key={i} style={styles.colRow}>
              <Text style={styles.colChip}>{a}</Text>
              <Text style={styles.colChip}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Botão de Selecionar Arquivo */}
      {phase !== 'preview' && phase !== 'done' && phase !== 'geocoding' && (
        <Pressable
          style={[styles.importBtn, isBusy && styles.importBtnDisabled]}
          disabled={isBusy}
          onPress={handlePickFile}
        >
          {isBusy ? (
            <View style={styles.importBtnContent}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.importBtnText}>Lendo Arquivo…</Text>
            </View>
          ) : (
            <View style={styles.importBtnContent}>
              <Upload size={18} color="#FFFFFF" />
              <Text style={styles.importBtnText}>Selecionar Arquivo (.xlsx / .csv)</Text>
            </View>
          )}
        </Pressable>
      )}

      {/* Geocoding & Snap v2 Progress Card */}
      {phase === 'geocoding' && (
        <View style={styles.progressCard}>
          <View style={styles.progressHeaderRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.progressTitle}>Geocodificando e Ajustando à Malha Viária</Text>
          </View>
          <Text style={styles.progressSub}>
            Executando busca de coordenadas e alinhamento de alta precisão (Snap v2) para garantir rotas 100% sobre as ruas reais.
          </Text>

          {geocodingProgress && (
            <View style={styles.progressDetailsBox}>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(
                        100,
                        Math.round((geocodingProgress.current / Math.max(1, geocodingProgress.total)) * 100),
                      )}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.progressCountRow}>
                <Text style={styles.progressCountText}>
                  {geocodingProgress.current} de {geocodingProgress.total} processadas ({Math.round((geocodingProgress.current / Math.max(1, geocodingProgress.total)) * 100)}%)
                </Text>
              </View>
              {geocodingProgress.currentAddress ? (
                <Text style={styles.progressCurrentAddr} numberOfLines={1}>
                  📍 {geocodingProgress.currentAddress}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      )}

      {/* Status Messages */}
      {phase === 'error' && (
        <View style={styles.msgCardError}>
          <AlertCircle size={20} color={colors.danger} />
          <Text style={styles.msgTextError}>{message}</Text>
        </View>
      )}

      {/* Resumo da Validação de Coordenadas */}
      {report && phase === 'preview' && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Relatório de Coordenadas & Snap v2</Text>
          <SummaryRow label="Total de paradas importadas" value={report.totalRows} color={colors.primary} />
          <SummaryRow label="Coordenadas válidas / alinhadas" value={report.validCoordsCount} color={colors.success} />
          <SummaryRow
            label="Coordenadas pendentes / inválidas"
            value={report.invalidCoordsCount}
            color={report.invalidCoordsCount > 0 ? colors.danger : colors.textMuted}
          />
        </View>
      )}

      {/* Tabela de Prévia */}
      {phase === 'preview' && importedDeliveries.length > 0 && (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>Conferência de Coordenadas (Snap v2)</Text>
            <Text style={styles.previewSub}>
              Paradas verificadas e alinhadas ao eixo da malha viária oficial:
            </Text>
          </View>

          {/* Nome da Lista no SQLite */}
          <View style={styles.listNameInputBox}>
            <View style={styles.listNameLabelRow}>
              <Tag size={14} color={colors.primary} />
              <Text style={styles.listNameLabel}>Salvar como:</Text>
            </View>
            <TextInput
              style={styles.listNameInput}
              value={listName}
              onChangeText={setListName}
              placeholder="Ex: Lista 1, Romaneio Niterói..."
              placeholderTextColor={colors.textDisabled}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
            <View style={styles.table}>
              {/* Table Header */}
              <View style={styles.tableRowHeader}>
                <Text style={[styles.tableCellHeader, { width: 140 }]}>Destination</Text>
                <Text style={[styles.tableCellHeader, { width: 100 }]}>Bairro</Text>
                <Text style={[styles.tableCellHeader, { width: 90 }]}>City</Text>
                <Text style={[styles.tableCellHeader, { width: 90 }]}>ZipCode</Text>
                <Text style={[styles.tableCellHeader, { width: 110 }]}>Lat Original</Text>
                <Text style={[styles.tableCellHeader, { width: 110 }]}>Lon Original</Text>
                <Text style={[styles.tableCellHeader, { width: 115 }]}>Lat (Snap v2)</Text>
                <Text style={[styles.tableCellHeader, { width: 115 }]}>Lon (Snap v2)</Text>
                <Text style={[styles.tableCellHeader, { width: 110 }]}>Status</Text>
              </View>

              {/* Table Rows */}
              {importedDeliveries.slice(0, 50).map((d, index) => {
                const finalLat = d.snappedLatitude ?? d.latitude;
                const finalLon = d.snappedLongitude ?? d.longitude;
                const isValid = finalLat !== null && finalLon !== null && !isNaN(finalLat) && !isNaN(finalLon);
                const isSnapped = Boolean(d.snappedLatitude && d.snappedLongitude);

                return (
                  <View
                    key={index}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowEven,
                      !isValid && styles.tableRowInvalid,
                    ]}
                  >
                    <Text style={[styles.tableCell, { width: 140, fontWeight: '700' }]} numberOfLines={1}>
                      {d.destination}
                    </Text>
                    <Text style={[styles.tableCell, { width: 100 }]} numberOfLines={1}>
                      {d.bairro || '—'}
                    </Text>
                    <Text style={[styles.tableCell, { width: 90 }]} numberOfLines={1}>
                      {d.city || '—'}
                    </Text>
                    <Text style={[styles.tableCell, { width: 90 }]} numberOfLines={1}>
                      {d.zipCode || '—'}
                    </Text>
                    <Text style={[styles.tableCell, { width: 110, color: colors.textMuted }]} numberOfLines={1}>
                      {d.rawLatitude ?? '—'}
                    </Text>
                    <Text style={[styles.tableCell, { width: 110, color: colors.textMuted }]} numberOfLines={1}>
                      {d.rawLongitude ?? '—'}
                    </Text>
                    <Text
                      style={[
                        styles.tableCell,
                        { width: 115, color: isValid ? colors.success : colors.danger, fontWeight: '600' },
                      ]}
                      numberOfLines={1}
                    >
                      {finalLat !== null ? finalLat.toFixed(6) : 'Inválida'}
                    </Text>
                    <Text
                      style={[
                        styles.tableCell,
                        { width: 115, color: isValid ? colors.success : colors.danger, fontWeight: '600' },
                      ]}
                      numberOfLines={1}
                    >
                      {finalLon !== null ? finalLon.toFixed(6) : 'Inválida'}
                    </Text>
                    <View style={{ width: 110, alignItems: 'center' }}>
                      <Text
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: isSnapped
                              ? colors.primaryGhost
                              : isValid
                              ? colors.successGhost
                              : colors.dangerGhost,
                            color: isSnapped ? colors.primary : isValid ? colors.success : colors.danger,
                          },
                        ]}
                      >
                        {isSnapped ? 'Snap v2' : isValid ? 'Válida' : 'Inválida'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {importedDeliveries.length > 50 && (
            <Text style={styles.tableFooterNote}>
              Exibindo 50 de {importedDeliveries.length} registros. Todos serão salvos.
            </Text>
          )}

          {/* Botões de Ação da Prévia */}
          <View style={styles.previewActions}>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => {
                setPhase('idle');
                setImportedDeliveries([]);
                setReport(null);
              }}
            >
              <RefreshCw size={14} color={colors.textSecondary} />
              <Text style={styles.cancelBtnText}>Recarregar</Text>
            </Pressable>

            <Pressable style={styles.confirmSaveBtn} onPress={handleSaveToDatabase}>
              <Save size={16} color="#FFFFFF" />
              <Text style={styles.confirmSaveBtnText}>Confirmar e Salvar ({importedDeliveries.length})</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Done State */}
      {phase === 'done' && (
        <View style={styles.doneCard}>
          <CheckCircle2 size={44} color={colors.success} />
          <Text style={styles.doneTitle}>Importação Concluída!</Text>
          <Text style={styles.doneMsg}>{message}</Text>
          <View style={styles.doneActions}>
            <Pressable
              style={[styles.donePrimBtn, { flex: 1 }]}
              onPress={() => navigation.navigate('Map')}
            >
              <Map size={18} color="#FFFFFF" />
              <Text style={styles.donePrimBtnText}>Ver no Mapa</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Modal de Mapeamento de Colunas */}
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
          onConfirm={handleMappingConfirm}
        />
      )}
    </ScrollView>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={summaryStyles.row}>
      <Text style={[summaryStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[summaryStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  label: { ...typography.bodySmall },
  value: { ...typography.bodySmall, fontWeight: '700' },
});

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

    hero: { alignItems: 'center', paddingVertical: spacing.md, gap: spacing.xs },
    heroBadge: {
      width: 64,
      height: 64,
      borderRadius: radius.xl,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    heroTitle: { ...typography.displayMedium, color: colors.primary },
    heroSub: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
    bold: { fontWeight: '700', color: colors.text },

    infoCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    infoTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    infoTitle: { ...typography.label, color: colors.primary, fontWeight: '700' },
    infoSubtext: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
    colList: { gap: spacing.xs, marginTop: spacing.xs },
    colRow: { flexDirection: 'row', gap: spacing.xs },
    colChip: {
      flex: 1,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
      textAlign: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },

    importBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.colored(colors.primary),
    },
    importBtnDisabled: { opacity: 0.6 },
    importBtnContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    importBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },


    msgCardError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.dangerGhost,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.danger + '33',
    },
    msgTextError: { ...typography.bodySmall, color: colors.danger, flex: 1 },

    progressCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.primary + '44',
      ...shadows.sm,
    },
    progressHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    progressTitle: { ...typography.titleSmall, color: colors.primary, fontWeight: '700' },
    progressSub: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
    progressDetailsBox: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.sm,
      padding: spacing.sm,
      gap: 6,
      marginTop: spacing.xs,
    },
    progressBarBackground: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: radius.full,
    },
    progressCountRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    progressCountText: { ...typography.caption, fontWeight: '700', color: colors.text },
    progressCurrentAddr: { ...typography.caption, color: colors.textMuted, fontSize: 11 },

    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    summaryTitle: { ...typography.label, color: colors.textMuted, fontWeight: '700', marginBottom: spacing.xs },

    previewCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    previewHeader: { gap: 2 },
    previewTitle: { ...typography.titleSmall, color: colors.text },
    previewSub: { ...typography.caption, color: colors.textMuted },

    listNameInputBox: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    listNameLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    listNameLabel: {
      ...typography.label,
      color: colors.primary,
      fontWeight: '700',
    },
    listNameInput: {
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },

    tableScroll: { maxHeight: 320 },
    table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
    tableRowHeader: { flexDirection: 'row', backgroundColor: colors.surfaceElevated, paddingVertical: spacing.xs + 2 },
    tableCellHeader: { ...typography.caption, fontWeight: '700', color: colors.textSecondary, paddingHorizontal: spacing.xs, textAlign: 'center' },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
    tableRowEven: { backgroundColor: colors.surfaceElevated + '55' },
    tableRowInvalid: { backgroundColor: colors.dangerGhost },
    tableCell: { ...typography.caption, color: colors.text, paddingHorizontal: spacing.xs, textAlign: 'center' },
    statusBadge: { ...typography.label, fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
    tableFooterNote: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

    previewActions: { flexDirection: 'row', gap: spacing.md },
    cancelBtn: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    cancelBtnText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
    confirmSaveBtn: {
      flex: 2,
      flexDirection: 'row',
      backgroundColor: colors.success,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      ...shadows.colored(colors.success),
    },
    confirmSaveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    doneCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.success + '44',
      ...shadows.md,
    },
    doneTitle: { ...typography.title, color: colors.success },
    doneMsg: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
    doneActions: { flexDirection: 'row', gap: spacing.md, width: '100%' },
    doneSecBtn: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    doneSecBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    donePrimBtn: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      ...shadows.colored(colors.primary),
    },
    donePrimBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });

