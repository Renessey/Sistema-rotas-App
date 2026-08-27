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
import { detectStandardColumns } from '../utils/coordinateParser';
import { spacing, radius, shadows } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import {
  Package,
  Globe,
  Building2,
  Mail,
  Phone,
  ArrowLeft,
  ArrowRight,
  Rocket,
  FastForward,
} from 'lucide-react-native';

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

type StepType = 'destination' | 'coordinates' | 'bairroCity' | 'zipCode' | 'extra';

interface StepConfig {
  key: StepType;
  title: string;
  isOptional: boolean;
  question: string;
  Icon: React.ComponentType<{ size: number; color: string }>;
  badgeLabel: string;
}

const STEPS: StepConfig[] = [
  {
    key: 'destination',
    title: 'Destino / Cliente',
    isOptional: false,
    question: 'Qual coluna contém o destino/nome da entrega?',
    Icon: Package,
    badgeLabel: 'Obrigatório',
  },
  {
    key: 'coordinates',
    title: 'Latitude e Longitude',
    isOptional: false,
    question: 'Selecione as colunas com Latitude e Longitude exatas:',
    Icon: Globe,
    badgeLabel: 'Crítico / GPS',
  },
  {
    key: 'bairroCity',
    title: 'Bairro e Cidade',
    isOptional: true,
    question: 'Quais colunas representam Bairro e Cidade?',
    Icon: Building2,
    badgeLabel: 'Opcional',
  },
  {
    key: 'zipCode',
    title: 'CEP / Código Postal',
    isOptional: true,
    question: 'Qual coluna contém o CEP ou Postal Code?',
    Icon: Mail,
    badgeLabel: 'Informativo',
  },
  {
    key: 'extra',
    title: 'Pedido e Telefone',
    isOptional: true,
    question: 'Selecione as colunas de Pedido e Telefone/WhatsApp:',
    Icon: Phone,
    badgeLabel: 'Opcional',
  },
];

export default function ColumnMappingModal({
  visible,
  headers,
  firstRow = {},
  totalRows: _totalRows,
  fileName: _fileName,
  onClose,
  onConfirm,
}: ColumnMappingModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Seleções do usuário
  const [selectedDestination, setSelectedDestination] = useState<string | undefined>();
  const [selectedLat, setSelectedLat] = useState<string | undefined>();
  const [selectedLng, setSelectedLng] = useState<string | undefined>();
  const [selectedBairro, setSelectedBairro] = useState<string | undefined>();
  const [selectedCity, setSelectedCity] = useState<string | undefined>();
  const [selectedZipCode, setSelectedZipCode] = useState<string | undefined>();
  const [selectedPedido, setSelectedPedido] = useState<string | undefined>();
  const [selectedPhone, setSelectedPhone] = useState<string | undefined>();
  const [selectedNotes, setSelectedNotes] = useState<string | undefined>();

  // Detecta automaticamente ao abrir
  useEffect(() => {
    if (headers && headers.length > 0) {
      const detected = detectStandardColumns(headers);
      setSelectedDestination(detected.destinationCol);
      setSelectedLat(detected.latitudeCol);
      setSelectedLng(detected.longitudeCol);
      setSelectedBairro(detected.bairroCol);
      setSelectedCity(detected.cityCol);
      setSelectedZipCode(detected.zipCodeCol);
      setSelectedPedido(detected.pedidoCol);
      setSelectedPhone(detected.phoneCol);
      setSelectedNotes(detected.notesCol);
    }
    setCurrentStepIndex(0);
  }, [headers, firstRow, visible]);

  const currentStep = STEPS[currentStepIndex] || STEPS[0];
  const StepIcon = currentStep.Icon;
  const progressPct = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleSelectColumnForStep = (header: string) => {
    switch (currentStep.key) {
      case 'destination':
        setSelectedDestination((prev) => (prev === header ? undefined : header));
        break;
      case 'coordinates':
        if (!selectedLat) {
          setSelectedLat(header);
        } else if (!selectedLng && header !== selectedLat) {
          setSelectedLng(header);
        } else if (selectedLat === header) {
          setSelectedLat(undefined);
        } else if (selectedLng === header) {
          setSelectedLng(undefined);
        } else {
          setSelectedLat(header);
        }
        break;
      case 'bairroCity':
        if (!selectedBairro) {
          setSelectedBairro(header);
        } else if (!selectedCity && header !== selectedBairro) {
          setSelectedCity(header);
        } else if (selectedBairro === header) {
          setSelectedBairro(undefined);
        } else if (selectedCity === header) {
          setSelectedCity(undefined);
        } else {
          setSelectedBairro(header);
        }
        break;
      case 'zipCode':
        setSelectedZipCode((prev) => (prev === header ? undefined : header));
        break;
      case 'extra':
        if (!selectedPedido) {
          setSelectedPedido(header);
        } else if (!selectedPhone && header !== selectedPedido) {
          setSelectedPhone(header);
        } else if (!selectedNotes && header !== selectedPedido && header !== selectedPhone) {
          setSelectedNotes(header);
        } else if (selectedPedido === header) {
          setSelectedPedido(undefined);
        } else if (selectedPhone === header) {
          setSelectedPhone(undefined);
        } else if (selectedNotes === header) {
          setSelectedNotes(undefined);
        } else {
          setSelectedPedido(header);
        }
        break;
    }
  };

  const isColumnSelectedInCurrentStep = (header: string): boolean => {
    switch (currentStep.key) {
      case 'destination':
        return selectedDestination === header;
      case 'coordinates':
        return selectedLat === header || selectedLng === header;
      case 'bairroCity':
        return selectedBairro === header || selectedCity === header;
      case 'zipCode':
        return selectedZipCode === header;
      case 'extra':
        return selectedPedido === header || selectedPhone === header || selectedNotes === header;
    }
  };

  const hasSelectionInCurrentStep = useMemo(() => {
    switch (currentStep.key) {
      case 'destination':
        return !!selectedDestination;
      case 'coordinates':
        return !!selectedLat && !!selectedLng;
      case 'bairroCity':
        return !!selectedBairro || !!selectedCity;
      case 'zipCode':
        return !!selectedZipCode;
      case 'extra':
        return !!selectedPedido || !!selectedPhone;
    }
  }, [
    currentStep.key,
    selectedDestination,
    selectedLat,
    selectedLng,
    selectedBairro,
    selectedCity,
    selectedZipCode,
    selectedPedido,
    selectedPhone,
  ]);

  const handleNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleFinalConfirm();
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    } else {
      onClose();
    }
  };

  const handleFinalConfirm = () => {
    onConfirm({
      destinationCol: selectedDestination,
      latitudeCol: selectedLat,
      longitudeCol: selectedLng,
      bairroCol: selectedBairro,
      cityCol: selectedCity,
      zipCodeCol: selectedZipCode,
      pedidoCol: selectedPedido,
      phoneCol: selectedPhone,
      notesCol: selectedNotes,
    });
  };

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
          <View style={styles.handle} />

          {/* Modal Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.titleText}>{currentStep.title}</Text>
              <Text style={styles.badgeText}>{currentStep.badgeLabel}</Text>
            </View>

            <Text style={styles.questionText}>{currentStep.question}</Text>

            {/* Progress Bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
          </View>

          {/* Section: Colunas Disponíveis */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>COLUNAS DA PLANILHA</Text>
          </View>

          {/* Columns List */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {headers.map((h) => {
              const isSelected = isColumnSelectedInCurrentStep(h);
              const sampleValue =
                firstRow[h] !== undefined && firstRow[h] !== null
                  ? String(firstRow[h]).trim()
                  : '—';

              let colBadge = '';
              if (selectedLat === h) colBadge = 'Latitude';
              else if (selectedLng === h) colBadge = 'Longitude';
              else if (selectedDestination === h) colBadge = 'Destino';
              else if (selectedBairro === h) colBadge = 'Bairro';
              else if (selectedCity === h) colBadge = 'Cidade';
              else if (selectedZipCode === h) colBadge = 'CEP';
              else if (selectedPedido === h) colBadge = 'Pedido';
              else if (selectedPhone === h) colBadge = 'Telefone';

              return (
                <Pressable
                  key={h}
                  style={({ pressed }) => [
                    styles.columnCard,
                    isSelected && styles.columnCardSelected,
                    pressed && styles.columnCardPressed,
                  ]}
                  onPress={() => handleSelectColumnForStep(h)}
                >
                  <View
                    style={[
                      styles.iconCircle,
                      isSelected && styles.iconCircleSelected,
                    ]}
                  >
                    <StepIcon size={18} color={isSelected ? colors.primary : colors.textMuted} />
                  </View>

                  <View style={styles.cardInfo}>
                    <View style={styles.cardTitleRow}>
                      <Text
                        style={[
                          styles.colNameText,
                          isSelected && styles.colNameTextSelected,
                        ]}
                      >
                        {h}
                      </Text>
                      {colBadge ? (
                        <View style={styles.tagBadge}>
                          <Text style={styles.tagBadgeText}>{colBadge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={styles.sampleValueText}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      Exemplo: {sampleValue || '—'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Bottom Action Buttons */}
          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={handleBack}
            >
              <ArrowLeft size={16} color={colors.textSecondary} />
              <Text style={styles.backBtnText}>Voltar</Text>
            </Pressable>

            {currentStep.isOptional && !hasSelectionInCurrentStep ? (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.skipBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleSkip}
              >
                <FastForward size={16} color="#FFFFFF" />
                <Text style={styles.skipBtnText}>Pular</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  !hasSelectionInCurrentStep &&
                    !currentStep.isOptional &&
                    styles.primaryBtnDisabled,
                  pressed && styles.btnPressed,
                ]}
                disabled={!hasSelectionInCurrentStep && !currentStep.isOptional}
                onPress={handleNext}
              >
                {currentStepIndex === STEPS.length - 1 ? (
                  <>
                    <Rocket size={16} color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>Validar e Importar</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>Avançar</Text>
                    <ArrowRight size={16} color="#FFFFFF" />
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      maxHeight: SCREEN_HEIGHT * 0.9,
      minHeight: SCREEN_HEIGHT * 0.72,
      paddingTop: spacing.xs + 2,
      paddingBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
      ...shadows.xl,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      backgroundColor: colors.borderStrong,
      borderRadius: radius.full,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    titleText: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.3,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
      backgroundColor: colors.primaryGhost,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    questionText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: spacing.md,
      lineHeight: 21,
    },
    progressTrack: {
      height: 4,
      backgroundColor: colors.border,
      borderRadius: radius.full,
      overflow: 'hidden',
      marginTop: 2,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: radius.full,
    },
    sectionHeader: {
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs + 3,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.8,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm + 2,
    },
    columnCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md - 1,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.md,
      ...shadows.sm,
    },
    columnCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceElevated,
      ...shadows.md,
    },
    columnCardPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.99 }],
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircleSelected: {
      backgroundColor: colors.primaryGhost,
    },
    cardInfo: {
      flex: 1,
      gap: 2,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    colNameText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    colNameTextSelected: {
      color: colors.primary,
    },
    tagBadge: {
      backgroundColor: colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    tagBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
    },
    sampleValueText: {
      fontSize: 13,
      fontWeight: '400',
      color: colors.textMuted,
    },
    footer: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    backBtn: {
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    backBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    primaryBtn: {
      flex: 1.6,
      flexDirection: 'row',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.colored(colors.primary),
    },
    primaryBtnDisabled: {
      opacity: 0.45,
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    skipBtn: {
      backgroundColor: colors.primary,
    },
    skipBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
  });
