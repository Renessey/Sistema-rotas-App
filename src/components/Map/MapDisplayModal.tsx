import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  ScrollView,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows, typography } from '../../theme';
import {
  MAP_TYPES,
  MAP_THEMES,
  MapType,
  MapTheme,
} from '../../config/mapStyles';
import type { Costing } from '../../types/geo';

export interface MapDisplayModalProps {
  visible: boolean;
  selectedType: MapType;
  selectedTheme: MapTheme;
  hideCompleted: boolean;
  costingMode: Costing;
  onClose: () => void;
  onSelectType: (type: MapType) => void;
  onSelectTheme: (theme: MapTheme) => void;
  onToggleHideCompleted: (value: boolean) => void;
  onSelectCostingMode?: (mode: Costing) => void;
}

const VEHICLE_MODES: { id: Costing; label: string; icon: string; desc: string }[] = [
  { id: 'auto', label: 'Carro / Van', icon: '🚗', desc: 'Vias urbanas e rodovias' },
  { id: 'truck', label: 'Caminhão', icon: '🚛', desc: 'Restrições de carga/peso' },
  { id: 'motorcycle', label: 'Moto', icon: '🏍️', desc: 'Rotas rápidas e corredores' },
  { id: 'bicycle', label: 'Bicicleta', icon: '🚲', desc: 'Ciclovias e vias lentas' },
];

export function MapDisplayModal({
  visible,
  selectedType,
  selectedTheme,
  hideCompleted,
  costingMode,
  onClose,
  onSelectType,
  onSelectTheme,
  onToggleHideCompleted,
  onSelectCostingMode,
}: MapDisplayModalProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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
          {/* Drag Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.title}>Exibição do Mapa</Text>
              <Text style={styles.subtitle}>
                Personalize estilos, visualização e filtros de rota
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* 1. Tipo de Mapa */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>TIPO DE MAPA</Text>
              <View style={styles.gridTypes}>
                {MAP_TYPES.map((t) => {
                  const isSelected = selectedType === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      style={[
                        styles.typeCard,
                        isSelected && styles.typeCardSelected,
                      ]}
                      onPress={() => onSelectType(t.id)}
                    >
                      <View
                        style={[
                          styles.typeIconBox,
                          isSelected && styles.typeIconBoxSelected,
                        ]}
                      >
                        <Text style={styles.typeIcon}>{t.icon}</Text>
                      </View>
                      <Text
                        style={[
                          styles.typeLabel,
                          isSelected && styles.typeLabelSelected,
                        ]}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 2. Tema Visual do Mapa */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>TEMA & ESTILO VISUAL</Text>
              <View style={styles.themeList}>
                {MAP_THEMES.map((theme) => {
                  const isSelected = selectedTheme === theme.id;
                  return (
                    <Pressable
                      key={theme.id}
                      style={[
                        styles.themeItem,
                        isSelected && styles.themeItemSelected,
                      ]}
                      onPress={() => onSelectTheme(theme.id)}
                    >
                      <View style={styles.themeItemLeft}>
                        <View style={styles.themeIconBox}>
                          <Text style={styles.themeIcon}>{theme.icon}</Text>
                        </View>
                        <View style={styles.themeTextCol}>
                          <Text
                            style={[
                              styles.themeLabel,
                              isSelected && styles.themeLabelSelected,
                            ]}
                          >
                            {theme.label}
                          </Text>
                          <Text style={styles.themeDesc}>{theme.description}</Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.radioOuter,
                          isSelected && styles.radioOuterSelected,
                        ]}
                      >
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 3. Filtros & Preferências de Rota */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FILTROS DE NAVEGAÇÃO</Text>
              <View style={styles.toggleCard}>
                <View style={styles.toggleTextCol}>
                  <View style={styles.toggleLabelRow}>
                    <Text style={styles.toggleIcon}>🎯</Text>
                    <Text style={styles.toggleTitle}>
                      Ocultar paradas e rotas concluídas
                    </Text>
                  </View>
                  <Text style={styles.toggleSubtitle}>
                    Exibe no mapa apenas os pontos pendentes e traçado restante
                  </Text>
                </View>
                <Switch
                  value={hideCompleted}
                  onValueChange={onToggleHideCompleted}
                  trackColor={{ false: colors.borderStrong, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* 4. Modo de Transporte / Veículo */}
            {onSelectCostingMode && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>MODO DE TRANSPORTE</Text>
                <View style={styles.vehicleGrid}>
                  {VEHICLE_MODES.map((vm) => {
                    const isSelected = costingMode === vm.id;
                    return (
                      <Pressable
                        key={vm.id}
                        style={[
                          styles.vehicleCard,
                          isSelected && styles.vehicleCardSelected,
                        ]}
                        onPress={() => onSelectCostingMode(vm.id)}
                      >
                        <Text style={styles.vehicleIcon}>{vm.icon}</Text>
                        <Text
                          style={[
                            styles.vehicleLabel,
                            isSelected && styles.vehicleLabelSelected,
                          ]}
                        >
                          {vm.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Botão de Fechar / Aplicar */}
          <Pressable style={styles.applyBtn} onPress={onClose}>
            <Text style={styles.applyBtnText}>Concluir</Text>
          </Pressable>
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
      ...StyleSheet.absoluteFillObject,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      maxHeight: '85%',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
      ...shadows.xl,
    },
    handle: {
      width: 44,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: colors.borderStrong,
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      paddingBottom: spacing.xs,
    },
    headerTitleBlock: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...typography.titleMedium,
      color: colors.text,
      fontWeight: '700',
    },
    subtitle: {
      ...typography.caption,
      color: colors.textMuted,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    closeBtnText: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: '600',
    },
    scrollContent: {
      gap: spacing.lg,
      paddingBottom: spacing.md,
    },
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.overline,
      color: colors.textMuted,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    gridTypes: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    typeCard: {
      flex: 1,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.xs,
      ...shadows.sm,
    },
    typeCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    typeIconBox: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    typeIconBoxSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    typeIcon: {
      fontSize: 20,
    },
    typeLabel: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    typeLabelSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    themeList: {
      gap: spacing.xs,
    },
    themeItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      ...shadows.sm,
    },
    themeItemSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    themeItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      flex: 1,
      minWidth: 0,
    },
    themeIconBox: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    themeIcon: {
      fontSize: 18,
    },
    themeTextCol: {
      flex: 1,
      gap: 2,
    },
    themeLabel: {
      ...typography.bodyMedium,
      color: colors.text,
      fontWeight: '600',
    },
    themeLabelSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    themeDesc: {
      ...typography.caption,
      color: colors.textMuted,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: spacing.sm,
    },
    radioOuterSelected: {
      borderColor: colors.primary,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    toggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.md,
      ...shadows.sm,
    },
    toggleTextCol: {
      flex: 1,
      gap: 3,
    },
    toggleLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    toggleIcon: {
      fontSize: 16,
    },
    toggleTitle: {
      ...typography.bodySmall,
      color: colors.text,
      fontWeight: '600',
    },
    toggleSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
    },
    vehicleGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    vehicleCard: {
      flexBasis: '48%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      ...shadows.sm,
    },
    vehicleCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    vehicleIcon: {
      fontSize: 20,
    },
    vehicleLabel: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    vehicleLabelSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    applyBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
      ...shadows.md,
    },
    applyBtnText: {
      ...typography.label,
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
  });
