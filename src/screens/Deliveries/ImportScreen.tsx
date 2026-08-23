import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { ImportService, ParsedSpreadsheet } from '../../services/import/ImportService';
import { DatabaseService } from '../../storage/DatabaseService';
import ColumnMappingModal from '../../components/ColumnMappingModal';
import type { ColumnMappingConfig, DeliveryEntity } from '../../types/geo';
import type { ImportConversionReport } from '../../utils/coordinateParser';
import { colors, spacing, radius, shadows, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Import'>;

type Phase = 'idle' | 'reading' | 'mapping' | 'preview' | 'done' | 'error';

export default function ImportScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [parsedData, setParsedData] = useState<ParsedSpreadsheet | null>(null);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [importedDeliveries, setImportedDeliveries] = useState<Omit<DeliveryEntity, 'id'>[]>([]);
  const [report, setReport] = useState<ImportConversionReport | null>(null);
  const [listName, setListName] = useState('');

  const isBusy = phase === 'reading';

  const handlePickFile = async () => {
    try {
      setPhase('reading');
      setMessage('Selecionando e lendo arquivo offline…');
      setReport(null);
      setImportedDeliveries([]);

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

  const handleMappingConfirm = (mapping: ColumnMappingConfig) => {
    if (!parsedData || parsedData.rows.length === 0) return;
    setShowMappingModal(false);

    try {
      const result = ImportService.applyMapping(parsedData.rows, mapping);
      setImportedDeliveries(result.deliveries);
      setReport(result.report);
      
      const existingLists = DatabaseService.getAllLists();
      const nextNum = existingLists.length + 1;
      setListName(`Lista ${nextNum}`);

      setPhase('preview');
      setMessage(
        `${result.report.totalRows} linhas processadas: ${result.report.validCoordsCount} com coordenadas válidas.`,
      );
    } catch (error) {
      console.error('[ImportScreen applyMapping]', error);
      setPhase('error');
      setMessage('Erro ao processar as colunas da planilha.');
    }
  };

  const handleSaveToDatabase = () => {
    if (importedDeliveries.length === 0) return;

    // Cria a lista no SQLite e salva o lote
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
        <Text style={styles.heroIcon}>📊</Text>
        <Text style={styles.heroTitle}>Importar Planilha</Text>
        <Text style={styles.heroSub}>
          Importação <Text style={styles.bold}>100% Offline</Text> com coordenadas exatas da planilha (.xlsx ou .csv).
        </Text>
      </View>

      {/* Info Card: Regras de Importação Offline */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>⚡ Padrão Oficial de Importação Offline:</Text>
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
      {phase !== 'preview' && phase !== 'done' && (
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
            <Text style={styles.importBtnText}>📄 Selecionar Arquivo (.xlsx / .csv)</Text>
          )}
        </Pressable>
      )}

      {/* Status Messages */}
      {phase === 'error' && (
        <View style={styles.msgCardError}>
          <Text style={styles.msgIcon}>❌</Text>
          <Text style={styles.msgTextError}>{message}</Text>
        </View>
      )}

      {/* Resumo da Validação de Coordenadas (Fases 8 e 20) */}
      {report && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Relatório de Coordenadas</Text>
          <SummaryRow label="Total de linhas lidas" value={report.totalRows} color={colors.primary} />
          <SummaryRow label="Coordenadas válidas" value={report.validCoordsCount} color={colors.success} />
          <SummaryRow
            label="Coordenadas inválidas / fora dos limites"
            value={report.invalidCoordsCount}
            color={report.invalidCoordsCount > 0 ? colors.danger : colors.textMuted}
          />
          <SummaryRow
            label="Coordenadas suspeitas (0, 0)"
            value={report.suspiciousCoordsCount}
            color={report.suspiciousCoordsCount > 0 ? colors.warning : colors.textMuted}
          />
          <SummaryRow
            label="Linhas sem coordenadas"
            value={report.missingCoordsCount}
            color={report.missingCoordsCount > 0 ? colors.warning : colors.textMuted}
          />
        </View>
      )}

      {/* Tabela de Prévia / Conferência das Coordenadas (Task 8.4 e Task 20.2) */}
      {phase === 'preview' && importedDeliveries.length > 0 && (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>Conferência de Coordenadas</Text>
            <Text style={styles.previewSub}>
              Verifique os valores originais e convertidos antes de salvar no banco:
            </Text>
          </View>

          {/* Nome da Lista no SQLite */}
          <View style={styles.listNameInputBox}>
            <Text style={styles.listNameLabel}>🏷️ Salvar como:</Text>
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
                <Text style={[styles.tableCellHeader, { width: 110 }]}>Lat Convertida</Text>
                <Text style={[styles.tableCellHeader, { width: 110 }]}>Lon Convertida</Text>
                <Text style={[styles.tableCellHeader, { width: 90 }]}>Status</Text>
              </View>

              {/* Table Rows */}
              {importedDeliveries.slice(0, 50).map((d, index) => {
                const isValid = d.latitude !== null && d.longitude !== null;
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
                        { width: 110, color: isValid ? colors.success : colors.danger, fontWeight: '600' },
                      ]}
                      numberOfLines={1}
                    >
                      {d.latitude !== null ? d.latitude : 'Inválida'}
                    </Text>
                    <Text
                      style={[
                        styles.tableCell,
                        { width: 110, color: isValid ? colors.success : colors.danger, fontWeight: '600' },
                      ]}
                      numberOfLines={1}
                    >
                      {d.longitude !== null ? d.longitude : 'Inválida'}
                    </Text>
                    <View style={{ width: 90, alignItems: 'center' }}>
                      <Text
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: isValid ? colors.successGhost : colors.dangerGhost,
                            color: isValid ? colors.success : colors.danger,
                          },
                        ]}
                      >
                        {isValid ? 'Válida' : 'Inválida'}
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
              <Text style={styles.cancelBtnText}>Recarregar</Text>
            </Pressable>

            <Pressable style={styles.confirmSaveBtn} onPress={handleSaveToDatabase}>
              <Text style={styles.confirmSaveBtnText}>💾 Confirmar e Salvar ({importedDeliveries.length})</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Done State */}
      {phase === 'done' && (
        <View style={styles.doneCard}>
          <Text style={styles.doneIcon}>🎉</Text>
          <Text style={styles.doneTitle}>Importação Concluída!</Text>
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

  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  heroIcon: { fontSize: 44 },
  heroTitle: { ...typography.headline, color: colors.text },
  heroSub: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  bold: { fontWeight: '700', color: colors.text },

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
  infoSubtext: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  colList: { gap: spacing.xs, marginTop: spacing.xs },
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

  msgCardError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger + '44',
    backgroundColor: colors.dangerGhost,
  },
  msgIcon: { fontSize: 20 },
  msgTextError: { ...typography.body, color: colors.danger, flex: 1 },

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

  /* ── Preview Table ── */
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.md,
  },
  previewHeader: { gap: 2 },
  previewTitle: { ...typography.titleSmall, color: colors.text },
  previewSub: { ...typography.caption, color: colors.textMuted },
  listNameInputBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  listNameLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  listNameInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.primary + '55',
  },
  tableScroll: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  table: { minWidth: 850 },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableCellHeader: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '66',
  },
  tableRowEven: {
    backgroundColor: colors.surfaceElevated + '55',
  },
  tableRowInvalid: {
    backgroundColor: colors.dangerGhost + '44',
  },
  tableCell: {
    ...typography.caption,
    color: colors.text,
  },
  statusBadge: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  tableFooterNote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  previewActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmSaveBtn: {
    flex: 2,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.colored(colors.success),
  },
  confirmSaveBtnText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: '#fff',
  },

  /* ── Done Card ── */
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
  doneTitle: { ...typography.headline, color: colors.text },
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
