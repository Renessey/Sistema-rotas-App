import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  Animated,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { radius, shadows, spacing, typography } from '../../theme';
import {
  X,
  FileText,
  Zap,
  Fuel,
  ChevronRight,
  Check,
  RotateCw,
  Copy,
} from 'lucide-react-native';

const FUEL_STORAGE_KEY = '@rotasimples:fuel_config';

interface FuelConfig {
  kmPerLiter: string;
  pricePerLiter: string;
}

interface ConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onReoptimize: () => void;
  onFuelConfirmed: (config: FuelConfig) => void;
  routeDistanceKm?: number;
  routeDurationMin?: number;
}

type SubModal = null | 'docs' | 'fuel';

function generateRandomRg(): { raw: string; formatted: string } {
  const num = Math.floor(10000000 + Math.random() * 90000000).toString();
  const digit = Math.floor(Math.random() * 10).toString();
  const raw = `${num}${digit}`;
  const formatted = `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}-${raw.slice(8)}`;
  return { raw, formatted };
}

export function ConfigModal({
  visible,
  onClose,
  onReoptimize,
  onFuelConfirmed,
  routeDistanceKm = 0,
  routeDurationMin = 0,
}: ConfigModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [subModal, setSubModal] = useState<SubModal>(null);
  const [currentRg, setCurrentRg] = useState(generateRandomRg());
  const [useFormattedRg, setUseFormattedRg] = useState(true);
  const [rgCopied, setRgCopied] = useState(false);
  const [fuelConfig, setFuelConfig] = useState<FuelConfig>({ kmPerLiter: '10.0', pricePerLiter: '5.89' });
  const scaleAnim = React.useRef(new Animated.Value(0.88)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setSubModal(null);
      setCurrentRg(generateRandomRg());
      setRgCopied(false);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      // Load saved fuel config
      AsyncStorage.getItem(FUEL_STORAGE_KEY).then((val) => {
        if (val) {
          try {
            const parsed = JSON.parse(val);
            setFuelConfig({
              kmPerLiter: parsed.kmPerLiter ? String(parsed.kmPerLiter) : '10.0',
              pricePerLiter: parsed.pricePerLiter ? String(parsed.pricePerLiter) : '5.89',
            });
          } catch {}
        }
      });
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.88, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  const handleGenerateNewRg = () => {
    setCurrentRg(generateRandomRg());
    setRgCopied(false);
  };

  const handleCopyRg = () => {
    setRgCopied(true);
    setTimeout(() => setRgCopied(false), 2000);
  };

  const handleFuelConfirm = async () => {
    try {
      await AsyncStorage.setItem(FUEL_STORAGE_KEY, JSON.stringify(fuelConfig));
    } catch {}
    onFuelConfirmed(fuelConfig);
    setSubModal(null);
    onClose();
  };

  if (!visible) return null;

  // ─── Sub-modal: Gerar Documentos (RG Aleatório) ──────────────────────────
  if (subModal === 'docs') {
    const displayValue = useFormattedRg ? currentRg.formatted : currentRg.raw;

    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setSubModal(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSubModal(null)} />
          <View style={[styles.subCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            {/* Header */}
            <View style={styles.subHeader}>
              <View style={[styles.iconWrap, { backgroundColor: colors.primaryGhost }]}>
                <FileText size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.subTitle}>Gerador de Documentos</Text>
                <Text style={styles.subSubtitle}>Número de RG aleatório na tela</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setSubModal(null)} hitSlop={8}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* RG Display Card */}
            <View style={styles.rgDisplayCard}>
              <View style={styles.rgCardHeader}>
                <Text style={styles.rgCardLabel}>REGISTRO GERAL (RG)</Text>
                <Pressable
                  style={styles.formatTogglePill}
                  onPress={() => setUseFormattedRg((prev) => !prev)}
                >
                  <Text style={styles.formatToggleText}>
                    {useFormattedRg ? 'FORMATADO' : 'SEM PONTUAÇÃO'}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.rgNumberText}>{displayValue}</Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.twoButtonRow}>
              <Pressable
                style={({ pressed }) => [styles.secondaryRgBtn, pressed && styles.btnPressed]}
                onPress={handleGenerateNewRg}
              >
                <RotateCw size={16} color={colors.primary} />
                <Text style={styles.secondaryRgBtnText}>Gerar Outro</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryRgBtn,
                  rgCopied && styles.primaryRgBtnCopied,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleCopyRg}
              >
                {rgCopied ? (
                  <>
                    <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.primaryBtnText}>Copiado!</Text>
                  </>
                ) : (
                  <>
                    <Copy size={16} color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>Copiar RG</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ─── Sub-modal: Consumo de Combustível ──────────────────────────────────
  if (subModal === 'fuel') {
    const kmL = parseFloat(fuelConfig.kmPerLiter.replace(',', '.')) || 0;
    const priceL = parseFloat(fuelConfig.pricePerLiter.replace(',', '.')) || 0;
    const litersNeeded = kmL > 0 ? routeDistanceKm / kmL : 0;
    const estimatedCost = litersNeeded * priceL;

    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setSubModal(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSubModal(null)} />
          <View style={[styles.subCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.subHeader}>
              <View style={[styles.iconWrap, { backgroundColor: colors.warningGhost }]}>
                <Fuel size={20} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.subTitle}>Consumo de Combustível</Text>
                <Text style={styles.subSubtitle}>Configure para calcular o custo estimado</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setSubModal(null)} hitSlop={8}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Consumo do veículo (km/L)</Text>
              <TextInput
                style={styles.textInput}
                value={fuelConfig.kmPerLiter}
                onChangeText={(v) => setFuelConfig((c) => ({ ...c, kmPerLiter: v }))}
                keyboardType="decimal-pad"
                placeholder="Ex: 10.5"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Preço do combustível por litro (R$)</Text>
              <TextInput
                style={styles.textInput}
                value={fuelConfig.pricePerLiter}
                onChangeText={(v) => setFuelConfig((c) => ({ ...c, pricePerLiter: v }))}
                keyboardType="decimal-pad"
                placeholder="Ex: 5.89"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Route summary preview */}
            {routeDistanceKm > 0 && kmL > 0 && (
              <View style={styles.fuelPreview}>
                <View style={styles.fuelPreviewRow}>
                  <Text style={styles.fuelPreviewLabel}>Distância total da rota</Text>
                  <Text style={styles.fuelPreviewValue}>{routeDistanceKm.toFixed(1)} km</Text>
                </View>
                <View style={styles.fuelPreviewRow}>
                  <Text style={styles.fuelPreviewLabel}>Combustível estimado</Text>
                  <Text style={[styles.fuelPreviewValue, { color: colors.warning }]}>
                    {litersNeeded.toFixed(2)} L
                  </Text>
                </View>
                {estimatedCost > 0 && (
                  <View style={styles.fuelPreviewRow}>
                    <Text style={styles.fuelPreviewLabel}>Custo estimado</Text>
                    <Text style={[styles.fuelPreviewValue, { color: colors.primary, fontWeight: '800' }]}>
                      R$ {estimatedCost.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.twoButtonRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setSubModal(null)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, kmL <= 0 && styles.btnDisabled]}
                onPress={handleFuelConfirm}
                disabled={kmL <= 0}
              >
                <Check size={16} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Salvar e Exibir no Mapa</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ─── Main Config Modal (Opções da Rota) ───────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[styles.mainCard, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
        >
          {/* Header */}
          <View style={styles.mainHeader}>
            <Text style={styles.mainTitle}>Opções da Rota</Text>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Menu Options */}
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Gerar Documentos */}
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                handleGenerateNewRg();
                setSubModal('docs');
              }}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: colors.primaryGhost }]}>
                <FileText size={20} color={colors.primary} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuItemTitle}>Gerar Documentos (RG)</Text>
                <Text style={styles.menuItemSub}>Gera número de RG aleatório na tela</Text>
              </View>
              <ChevronRight size={18} color={colors.textDisabled} />
            </Pressable>

            {/* Consumo de Combustível */}
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => setSubModal('fuel')}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: colors.warningGhost }]}>
                <Fuel size={20} color={colors.warning} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuItemTitle}>Consumo de Combustível</Text>
                <Text style={styles.menuItemSub}>Calcula gastos estimados da rota (km/L)</Text>
              </View>
              <ChevronRight size={18} color={colors.textDisabled} />
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    mainCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.xl,
    },
    subCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.xl,
    },
    mainHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    mainTitle: {
      ...typography.title,
      color: colors.text,
      fontWeight: '800',
    },
    subHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subTitle: {
      ...typography.bodyMedium,
      color: colors.text,
      fontWeight: '800',
    },
    subSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      gap: spacing.sm,
    },
    menuItemPressed: {
      backgroundColor: colors.surfaceElevated,
    },
    menuIconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuTextWrap: {
      flex: 1,
      gap: 2,
    },
    menuItemTitle: {
      ...typography.bodyMedium,
      color: colors.text,
      fontWeight: '700',
    },
    menuItemSub: {
      ...typography.caption,
      color: colors.textMuted,
    },
    // ─── RG Display Styles ───
    rgDisplayCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.sm,
      alignItems: 'center',
      ...shadows.sm,
    },
    rgCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
    },
    rgCardLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    formatTogglePill: {
      backgroundColor: colors.primaryGhost,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    formatToggleText: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.5,
    },
    rgNumberText: {
      fontSize: 26,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: 2,
      paddingVertical: spacing.xs,
    },
    secondaryRgBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryRgBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    primaryRgBtn: {
      flex: 1.2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      gap: 6,
      ...shadows.sm,
    },
    primaryRgBtnCopied: {
      backgroundColor: colors.success,
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    docsInfoBox: {
      flexDirection: 'row',
      gap: spacing.sm,
      backgroundColor: colors.warningGhost,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.warning + '44',
      alignItems: 'flex-start',
    },
    docsInfoText: {
      ...typography.bodySmall,
      color: colors.warning,
      flex: 1,
      lineHeight: 20,
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      gap: 8,
      ...shadows.sm,
    },
    primaryBtnText: {
      fontSize: 14,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    btnDisabled: {
      opacity: 0.5,
    },
    twoButtonRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelBtnText: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      fontWeight: '700',
    },
    inputGroup: {
      gap: spacing.xs,
    },
    inputLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    textInput: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontSize: 16,
      color: colors.text,
      fontWeight: '600',
    },
    fuelPreview: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fuelPreviewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    fuelPreviewLabel: {
      ...typography.bodySmall,
      color: colors.textSecondary,
    },
    fuelPreviewValue: {
      ...typography.bodySmall,
      color: colors.text,
      fontWeight: '700',
    },
  });
