import React, { useRef, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  ScrollView,
  Animated,
  PanResponder,
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
  const styles = useMemo(() => createStyles(colors), [colors]);

  const translateY = useRef(new Animated.Value(0)).current;

  // PanResponder to allow dragging down the modal to dismiss
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy > 0) {
            translateY.setValue(gestureState.dy);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 120 || gestureState.vy > 0.6) {
            Animated.timing(translateY, {
              toValue: 600,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              translateY.setValue(0);
              onClose();
            });
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              friction: 7,
            }).start();
          }
        },
      }),
    [onClose, translateY],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Drag Handle Area with PanResponder */}
          <View {...panResponder.panHandlers} style={styles.dragZone}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleBlock}>
                <Text style={styles.title}>Exibição & Ajustes</Text>
                <Text style={styles.subtitle}>
                  Personalize estilos, visualização e filtros de rota
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>
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
                          <Text style={styles.themeIconText}>{theme.icon}</Text>
                        </View>
                        <View style={styles.themeTextCol}>
                          <Text
                            style={[
                              styles.themeName,
                              isSelected && styles.themeNameSelected,
                            ]}
                          >
                            {theme.label}
                          </Text>
                          <Text style={styles.themeDesc}>
                            {theme.description}
                          </Text>
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

            {/* 3. Modo de Veículo / Roteamento */}
            {onSelectCostingMode && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>MODO DE TRANSPORTE</Text>
                <View style={styles.vehicleGrid}>
                  {VEHICLE_MODES.map((v) => {
                    const isSelected = costingMode === v.id;
                    return (
                      <Pressable
                        key={v.id}
                        style={[
                          styles.vehicleCard,
                          isSelected && styles.vehicleCardSelected,
                        ]}
                        onPress={() => onSelectCostingMode(v.id)}
                      >
                        <Text style={styles.vehicleIcon}>{v.icon}</Text>
                        <Text
                          style={[
                            styles.vehicleLabel,
                            isSelected && styles.vehicleLabelSelected,
                          ]}
                        >
                          {v.label}
                        </Text>
                        <Text style={styles.vehicleDesc}>{v.desc}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 4. Opções de Filtro */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FILTROS NO MAPA</Text>
              <View style={styles.filterCard}>
                <View style={styles.filterRow}>
                  <View style={styles.filterTextWrap}>
                    <Text style={styles.filterTitle}>
                      Ocultar Entregas Concluídas
                    </Text>
                    <Text style={styles.filterSub}>
                      Mantém o mapa limpo exibindo apenas paradas pendentes
                    </Text>
                  </View>
                  <Switch
                    value={hideCompleted}
                    onValueChange={onToggleHideCompleted}
                    trackColor={{
                      false: colors.borderStrong,
                      true: colors.primary,
                    }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </View>
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
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      maxHeight: '85%',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
      ...shadows.xl,
    },
    dragZone: {
      paddingBottom: spacing.xs,
    },
    handle: {
      width: 44,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: colors.borderStrong,
      alignSelf: 'center',
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      paddingBottom: spacing.xs,
    },
    headerTitleBlock: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...typography.title,
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
      ...typography.label,
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
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    typeCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    typeIconBox: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.sm,
    },
    typeIconBoxSelected: {
      backgroundColor: colors.primary,
    },
    typeIcon: {
      fontSize: 18,
    },
    typeLabel: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    typeLabelSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    themeList: {
      gap: spacing.xs + 2,
    },
    themeItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
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
    themeIconText: {
      fontSize: 18,
    },
    themeTextCol: {
      flex: 1,
      gap: 1,
    },
    themeName: {
      ...typography.bodyMedium,
      fontWeight: '600',
      color: colors.text,
    },
    themeNameSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    themeDesc: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
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
    vehicleGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    vehicleCard: {
      width: '48%',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 3,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    vehicleCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    vehicleIcon: {
      fontSize: 22,
    },
    vehicleLabel: {
      ...typography.bodyMedium,
      fontWeight: '700',
      color: colors.text,
      marginTop: 2,
    },
    vehicleLabelSelected: {
      color: colors.primary,
    },
    vehicleDesc: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
    },
    filterCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    filterTextWrap: {
      flex: 1,
      gap: 2,
    },
    filterTitle: {
      ...typography.bodyMedium,
      fontWeight: '600',
      color: colors.text,
    },
    filterSub: {
      ...typography.caption,
      color: colors.textMuted,
    },
  });
