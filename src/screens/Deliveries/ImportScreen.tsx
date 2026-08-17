import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { ImportService } from '../../services/import/ImportService';
import { ValidationService } from '../../services/validation/ValidationService';
import { GeocodingService } from '../../services/geocoding/GeocodingService';
import { DatabaseService } from '../../storage/DatabaseService';
import { colors, spacing, radius } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Import'>;

type Phase = 'idle' | 'reading' | 'validating' | 'geocoding' | 'done' | 'error';

export default function ImportScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState<{
    total: number;
    valid: number;
    withoutAddress: number;
    withoutCep: number;
    duplicates: number;
    emptyRows: number;
  } | null>(null);
  const [geocodeProgress, setGeocodeProgress] = useState(0);
  const [geocodeTotal, setGeocodeTotal] = useState(0);

  const handleImport = async () => {
    try {
      setPhase('reading');
      setMessage('Lendo planilha…');
      const rawRows = await ImportService.pickAndReadSpreadsheet();
      if (rawRows.length === 0) {
        setPhase('idle');
        setMessage('Nenhuma linha encontrada ou importação cancelada.');
        return;
      }

      setPhase('validating');
      setMessage('Validando dados…');
      const normalized = ImportService.normalizeRows(rawRows);
      const result = ValidationService.validate(normalized);

      setSummary({
        total: result.total,
        valid: result.valid.length,
        withoutAddress: result.withoutAddress.length,
        withoutCep: result.withoutCep.length,
        duplicates: result.duplicates.length,
        emptyRows: result.emptyRows.length,
      });

      // Geocode records that have address but no coordinates
      const toGeocode = result.valid.filter(
        (d) => d.latitude === null || d.longitude === null,
      );
      setGeocodeTotal(toGeocode.length);
      setGeocodeProgress(0);

      if (toGeocode.length > 0) {
        setPhase('geocoding');
        setMessage(`Geocodificando endereços… (0/${toGeocode.length})`);

        let done = 0;
        for (const delivery of toGeocode) {
          const geo = await GeocodingService.geocode(
            `${delivery.address}${delivery.number ? ', ' + delivery.number : ''}`,
            delivery.city,
            delivery.state,
          );
          if (geo) {
            delivery.latitude = geo.latitude;
            delivery.longitude = geo.longitude;
            delivery.geocodingStatus = 'success';
          } else {
            delivery.geocodingStatus = 'failed';
          }
          done++;
          setGeocodeProgress(done);
          setMessage(`Geocodificando endereços… (${done}/${toGeocode.length})`);
        }
      }

      // Persist only valid records
      DatabaseService.clearDeliveries();
      const finalValid = result.valid.filter(
        (d) => d.latitude !== null && d.longitude !== null,
      );
      finalValid.forEach((d) => DatabaseService.insertDelivery(d));

      setPhase('done');
      setMessage(
        `Importação concluída: ${finalValid.length} entregas válidas com coordenadas.`,
      );
    } catch (error) {
      console.error('[ImportScreen]', error);
      setPhase('error');
      setMessage('Erro ao importar o arquivo. Verifique o formato (.xlsx ou .csv).');
    }
  };

  const SummaryRow = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.description}>
        Importe uma planilha <Text style={styles.bold}>.xlsx</Text> ou{' '}
        <Text style={styles.bold}>.csv</Text> com as entregas. Colunas são
        detectadas automaticamente.
      </Text>

      <Pressable
        style={[styles.primaryButton, phase === 'reading' || phase === 'validating' || phase === 'geocoding' ? styles.disabled : null]}
        disabled={phase === 'reading' || phase === 'validating' || phase === 'geocoding'}
        onPress={handleImport}
      >
        {(phase === 'reading' || phase === 'validating' || phase === 'geocoding') ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>📄 IMPORTAR PLANILHA</Text>
        )}
      </Pressable>

      {phase === 'geocoding' && (
        <Text style={styles.message}>{message}</Text>
      )}
      {phase === 'done' && <Text style={styles.successMessage}>{message}</Text>}
      {phase === 'error' && <Text style={styles.errorMessage}>{message}</Text>}

      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Total de entregas: {summary.total}</Text>
          <SummaryRow label="Válidos" value={summary.valid} color={colors.success} />
          <SummaryRow label="Sem endereço" value={summary.withoutAddress} color={colors.danger} />
          <SummaryRow label="Sem CEP" value={summary.withoutCep} color={colors.warning} />
          <SummaryRow label="Duplicados" value={summary.duplicates} color={colors.warning} />
          <SummaryRow label="Linhas vazias" value={summary.emptyRows} color={colors.textMuted} />
        </View>
      )}

      {phase === 'done' && (
        <>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Deliveries')}
          >
            <Text style={styles.secondaryButtonText}>📋 VER LISTA</Text>
          </Pressable>
          <Pressable
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Map')}
          >
            <Text style={styles.primaryButtonText}>🗺️ VER NO MAPA</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  description: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  bold: { fontWeight: '700', color: colors.text },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  message: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  successMessage: {
    fontSize: 14,
    color: colors.success,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorMessage: { fontSize: 14, color: colors.danger, textAlign: 'center' },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  summaryValue: { fontSize: 15, fontWeight: '700', width: 40 },
  summaryLabel: { fontSize: 15, color: colors.text },
});
