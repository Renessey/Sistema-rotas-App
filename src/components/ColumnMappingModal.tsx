import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import type { ColumnMappingConfig } from '../types/geo';
import { guessMapping, buildAddressQuery } from '../utils/columnMappingHeuristics';
import { colors, spacing, radius, shadows, typography } from '../theme';
import { useTheme } from '../theme/ThemeContext';

export interface ColumnMappingModalProps {
  visible: boolean;
  headers: string[];
  firstRow?: Record<string, unknown>;
  totalRows: number;
  fileName?: string;
  onClose: () => void;
  onConfirm: (mapping: ColumnMappingConfig) => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ColumnMappingModal({
  visible,
  headers,
  firstRow = {},
  totalRows,
  fileName,
  onClose,
  onConfirm,
}: ColumnMappingModalProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const [selectedName, setSelectedName] = useState<string | undefined>();
  const [selectedAddressCols, setSelectedAddressCols] = useState<string[]>([]);
  const [selectedLat, setSelectedLat] = useState<string | undefined>();
  const [selectedLng, setSelectedLng] = useState<string | undefined>();
  const [selectedPhone, setSelectedPhone] = useState<string | undefined>();
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-seleciona heurística sempre que novos cabeçalhos chegam
  useEffect(() => {
    if (headers && headers.length > 0) {
      const guessed = guessMapping(headers, firstRow);
      setSelectedName(guessed.nameCol);
      setSelectedAddressCols(guessed.addressCols);
      setSelectedLat(guessed.latitudeCol);
      setSelectedLng(guessed.longitudeCol);
      setSelectedPhone(guessed.phoneCol);
    }
  }, [headers, firstRow]);

  const handleSelectName = (h: string) => {
    setSelectedName(h);
    // Remove o nome das colunas de endereço para nunca ser enviado para geocodificação
    setSelectedAddressCols((prev) => prev.filter((col) => col !== h));
  };

  const toggleAddressCol = (header: string) => {
    // Se a coluna clicada for o nome atual, desmarca o nome
    if (selectedName === header) {
      setSelectedName(undefined);
    }
    setSelectedAddressCols((prev) => {
      if (prev.includes(header)) {
        return prev.filter((h) => h !== header);
      }
      return [...prev, header];
    });
  };

  // Preview dinâmico do endereço montado (exclusivo das colunas de endereço)
  const previewAddress = useMemo(() => {
    const cleanCols = selectedAddressCols.filter((col) => col !== selectedName);
    return buildAddressQuery(firstRow, cleanCols);
  }, [firstRow, selectedAddressCols, selectedName]);

  const previewName = useMemo(() => {
    if (!selectedName) return 'Cliente sem nome';
    return String(firstRow[selectedName] ?? 'Cliente sem nome');
  }, [firstRow, selectedName]);

  const previewHasCoords = useMemo(() => {
    if (!selectedLat || !selectedLng) return false;
    const lat = parseFloat(String(firstRow[selectedLat] ?? '').replace(',', '.'));
    const lng = parseFloat(String(firstRow[selectedLng] ?? '').replace(',', '.'));
    return !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0);
  }, [firstRow, selectedLat, selectedLng]);

  const handleConfirm = () => {
    const cleanCols = selectedAddressCols.filter((col) => col !== selectedName);
    onConfirm({
      nameCol: selectedName,
      addressCols: cleanCols,
      latitudeCol: selectedLat,
      longitudeCol: selectedLng,
      phoneCol: selectedPhone,
    });
  };

  const isFormValid = selectedAddressCols.length > 0 || (!!selectedLat && !!selectedLng);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          {/* Top Drag Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Mapeamento de Colunas</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{totalRows} linhas</Text>
              </View>
            </View>
            <Text style={styles.headerSub} numberOfLines={1}>
              Arquivo: {fileName ?? 'Planilha importada'}
            </Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Nome / Título da Parada */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>1. Nome / Título da Parada</Text>
                <Text style={styles.sectionSubtitle}>
                  Identificador principal de cada entrega
                </Text>
              </View>
              <View style={styles.chipsWrap}>
                {headers.map((h) => {
                  const isSelected = selectedName === h;
                  return (
                    <Pressable
                      key={`name-${h}`}
                      style={[styles.chip, isSelected && styles.chipActivePrimary]}
                      onPress={() => handleSelectName(h)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          isSelected && styles.chipTextActive,
                        ]}
                      >
                        {isSelected ? '✓ ' : ''}{h}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 2. Colunas de Endereço (Multi-seleção) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>2. Colunas do Endereço</Text>
                <Text style={styles.sectionSubtitle}>
                  Selecione as colunas que formam o endereço para busca no Google Maps
                </Text>
              </View>
              <View style={styles.chipsWrap}>
                {headers.map((h) => {
                  const isSelected = selectedAddressCols.includes(h);
                  return (
                    <Pressable
                      key={`addr-${h}`}
                      style={[styles.chip, isSelected && styles.chipActiveSuccess]}
                      onPress={() => toggleAddressCol(h)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          isSelected && styles.chipTextActive,
                        ]}
                      >
                        {isSelected ? '✓ ' : '+ '}{h}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {selectedAddressCols.length === 0 && (
                <Text style={styles.warningText}>
                  ⚠️ Selecione ao menos 1 coluna de endereço ou coordenadas diretas.
                </Text>
              )}
            </View>

            {/* 3. Pré-visualização em Tempo Real */}
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewIcon}>👁️</Text>
                <Text style={styles.previewTitle}>PRÉ-VISUALIZAÇÃO (1ª LINHA)</Text>
              </View>

              <View style={styles.previewField}>
                <Text style={styles.previewLabel}>Nome:</Text>
                <Text style={styles.previewValueBold}>{previewName}</Text>
              </View>

              <View style={styles.previewField}>
                <Text style={styles.previewLabel}>Busca no Google:</Text>
                <Text style={styles.previewValueQuery}>
                  {previewAddress || '(Nenhuma coluna de endereço selecionada)'}
                </Text>
              </View>

              <View style={styles.previewStatusRow}>
                <Text style={styles.previewStatusBadge}>
                  {previewHasCoords
                    ? '📍 Coordenadas prontas encontradas na linha'
                    : '⚡ Será geocodificado com Google Geocoding API'}
                </Text>
              </View>
            </View>

            {/* 4. Opções Avançadas (Coordenadas e Telefone) */}
            <View style={styles.section}>
              <Pressable
                style={styles.toggleRow}
                onPress={() => setShowAdvanced((v) => !v)}
              >
                <Text style={styles.toggleText}>
                  {showAdvanced ? '▼ Ocultar Campos Extras' : '▶ Opções Extras (Latitude, Longitude, Telefone)'}
                </Text>
              </Pressable>

              {showAdvanced && (
                <View style={styles.advancedBox}>
                  {/* Latitude */}
                  <Text style={styles.advancedLabel}>Coluna de Latitude (Opcional):</Text>
                  <View style={styles.chipsWrap}>
                    <Pressable
                      style={[styles.chipSmall, !selectedLat && styles.chipSmallActive]}
                      onPress={() => setSelectedLat(undefined)}
                    >
                      <Text style={[styles.chipSmallText, !selectedLat && styles.chipSmallTextActive]}>
                        Nenhuma
                      </Text>
                    </Pressable>
                    {headers.map((h) => (
                      <Pressable
                        key={`lat-${h}`}
                        style={[styles.chipSmall, selectedLat === h && styles.chipSmallActive]}
                        onPress={() => setSelectedLat(h)}
                      >
                        <Text style={[styles.chipSmallText, selectedLat === h && styles.chipSmallTextActive]}>
                          {h}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Longitude */}
                  <Text style={[styles.advancedLabel, { marginTop: spacing.sm }]}>
                    Coluna de Longitude (Opcional):
                  </Text>
                  <View style={styles.chipsWrap}>
                    <Pressable
                      style={[styles.chipSmall, !selectedLng && styles.chipSmallActive]}
                      onPress={() => setSelectedLng(undefined)}
                    >
                      <Text style={[styles.chipSmallText, !selectedLng && styles.chipSmallTextActive]}>
                        Nenhuma
                      </Text>
                    </Pressable>
                    {headers.map((h) => (
                      <Pressable
                        key={`lng-${h}`}
                        style={[styles.chipSmall, selectedLng === h && styles.chipSmallActive]}
                        onPress={() => setSelectedLng(h)}
                      >
                        <Text style={[styles.chipSmallText, selectedLng === h && styles.chipSmallTextActive]}>
                          {h}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Telefone */}
                  <Text style={[styles.advancedLabel, { marginTop: spacing.sm }]}>
                    Coluna de Telefone/Celular (Opcional):
                  </Text>
                  <View style={styles.chipsWrap}>
                    <Pressable
                      style={[styles.chipSmall, !selectedPhone && styles.chipSmallActive]}
                      onPress={() => setSelectedPhone(undefined)}
                    >
                      <Text style={[styles.chipSmallText, !selectedPhone && styles.chipSmallTextActive]}>
                        Nenhum
                      </Text>
                    </Pressable>
                    {headers.map((h) => (
                      <Pressable
                        key={`phone-${h}`}
                        style={[styles.chipSmall, selectedPhone === h && styles.chipSmallActive]}
                        onPress={() => setSelectedPhone(h)}
                      >
                        <Text style={[styles.chipSmallText, selectedPhone === h && styles.chipSmallTextActive]}>
                          {h}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer Action Buttons */}
          <View style={styles.footer}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onClose}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={[styles.confirmBtn, !isFormValid && styles.confirmBtnDisabled]}
              disabled={!isFormValid}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmBtnText}>🚀 Confirmar e Localizar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (themeColors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.7)',
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
    },
    sheet: {
      backgroundColor: themeColors.surface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      maxHeight: SCREEN_HEIGHT * 0.88,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
      borderWidth: 1,
      borderColor: themeColors.border,
      borderBottomWidth: 0,
      ...shadows.xl,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      backgroundColor: themeColors.borderStrong,
      borderRadius: radius.full,
      marginVertical: spacing.xs,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    headerTitle: {
      ...typography.title,
      fontWeight: '800',
      color: themeColors.text,
    },
    countBadge: {
      backgroundColor: themeColors.primaryGhost,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    countBadgeText: {
      ...typography.caption,
      color: themeColors.primary,
      fontWeight: '700',
    },
    headerSub: {
      ...typography.caption,
      color: themeColors.textMuted,
      marginTop: 2,
    },
    scroll: {
      maxHeight: SCREEN_HEIGHT * 0.62,
    },
    scrollContent: {
      padding: spacing.lg,
      gap: spacing.lg,
    },
    section: {
      gap: spacing.xs + 2,
    },
    sectionHeader: {
      gap: 2,
    },
    sectionTitle: {
      ...typography.bodyMedium,
      fontWeight: '700',
      color: themeColors.text,
    },
    sectionSubtitle: {
      ...typography.caption,
      color: themeColors.textMuted,
    },
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + 2,
      marginTop: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm - 1,
      borderRadius: radius.full,
      backgroundColor: themeColors.surfaceElevated,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    chipActivePrimary: {
      backgroundColor: themeColors.primary,
      borderColor: themeColors.primary,
    },
    chipActiveSuccess: {
      backgroundColor: themeColors.success,
      borderColor: themeColors.success,
    },
    chipText: {
      ...typography.caption,
      fontWeight: '600',
      color: themeColors.textSecondary,
    },
    chipTextActive: {
      color: '#fff',
      fontWeight: '700',
    },
    warningText: {
      ...typography.caption,
      color: themeColors.danger,
      marginTop: spacing.xs,
    },
    previewCard: {
      backgroundColor: themeColors.surfaceElevated,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: themeColors.primary + '33',
      gap: spacing.xs + 2,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    previewIcon: {
      fontSize: 14,
    },
    previewTitle: {
      ...typography.label,
      fontSize: 10,
      letterSpacing: 1.1,
      color: themeColors.primary,
      fontWeight: '800',
    },
    previewField: {
      gap: 2,
    },
    previewLabel: {
      ...typography.caption,
      color: themeColors.textMuted,
      fontSize: 11,
    },
    previewValueBold: {
      ...typography.bodySmall,
      fontWeight: '700',
      color: themeColors.text,
    },
    previewValueQuery: {
      ...typography.bodySmall,
      color: themeColors.primary,
      fontWeight: '600',
      lineHeight: 18,
    },
    previewStatusRow: {
      marginTop: spacing.xs,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: themeColors.border,
    },
    previewStatusBadge: {
      ...typography.caption,
      color: themeColors.textMuted,
      fontSize: 11,
      fontStyle: 'italic',
    },
    toggleRow: {
      paddingVertical: spacing.xs,
    },
    toggleText: {
      ...typography.caption,
      color: themeColors.primary,
      fontWeight: '700',
    },
    advancedBox: {
      backgroundColor: themeColors.surfaceElevated,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: themeColors.border,
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    advancedLabel: {
      ...typography.caption,
      fontWeight: '600',
      color: themeColors.textSecondary,
    },
    chipSmall: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.sm,
      backgroundColor: themeColors.surface,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    chipSmallActive: {
      backgroundColor: themeColors.primaryGhost,
      borderColor: themeColors.primary,
    },
    chipSmallText: {
      ...typography.caption,
      fontSize: 11,
      color: themeColors.textMuted,
    },
    chipSmallTextActive: {
      color: themeColors.primary,
      fontWeight: '700',
    },
    footer: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: themeColors.border,
    },
    cancelBtn: {
      flex: 1,
      backgroundColor: themeColors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    cancelBtnText: {
      ...typography.bodyMedium,
      fontWeight: '600',
      color: themeColors.textSecondary,
    },
    confirmBtn: {
      flex: 1.5,
      backgroundColor: themeColors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.colored(themeColors.primary),
    },
    confirmBtnDisabled: {
      opacity: 0.45,
    },
    confirmBtnText: {
      ...typography.bodyMedium,
      fontWeight: '700',
      color: '#fff',
    },
  });
