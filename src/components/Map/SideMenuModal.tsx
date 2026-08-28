import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadows, spacing } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import {
  Zap,
  X,
  FileSpreadsheet,
  ListOrdered,
  Plus,
  Settings,
  Trash2,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react-native';

interface SideMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onImportPress: () => void;
  onAddStopPress: () => void;
  onFitRoutePress?: () => void;
  onLayersPress?: () => void;
  onSettingsPress: () => void;
  onDiagnosticPress?: () => void;
  onListsPress?: () => void;
  onClearRoutePress: () => void;
  totalDeliveriesCount: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 340);

export function SideMenuModal({
  visible,
  onClose,
  onImportPress,
  onAddStopPress,
  onFitRoutePress,
  onLayersPress,
  onSettingsPress,
  onDiagnosticPress,
  onListsPress,
  onClearRoutePress,
  totalDeliveriesCount,
}: SideMenuModalProps) {
  const { colors, theme, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              width: DRAWER_WIDTH,
              paddingTop: Math.max(insets.top, 16) + 12,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Zap size={20} color="#FFFFFF" />
              </View>
              <View style={styles.brandTextWrap}>
                <Text style={styles.brandTitle}>RotaSimples</Text>
                <Text style={styles.brandSub}>Mapbox Directions API v5</Text>
              </View>
            </View>

            <View style={styles.headerRightActions}>
              {/* Botão de Alternar Tema Direto (Claro / Escuro) */}
              <Pressable
                style={({ pressed }) => [styles.themeBtn, pressed && styles.btnPressed]}
                onPress={toggleTheme}
                hitSlop={8}
                accessibilityLabel="Alternar Modo Claro e Escuro"
              >
                {theme === 'dark' ? (
                  <Sun size={17} color="#FBBF24" strokeWidth={2.2} />
                ) : (
                  <Moon size={17} color="#6366F1" strokeWidth={2.2} />
                )}
              </Pressable>

              <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
                <X size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <Text style={styles.statsLabel}>Paradas carregadas:</Text>
            <View style={styles.statsCountBadge}>
              <Text style={styles.statsCountText}>{totalDeliveriesCount}</Text>
            </View>
          </View>

          {/* Menu Items */}
          <View style={styles.menuList}>
            {/* Importar Planilha */}
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                onClose();
                onImportPress();
              }}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: colors.primaryGhost }]}>
                <FileSpreadsheet size={18} color={colors.primary} />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Importar Planilha</Text>
                <Text style={styles.itemSub}>Excel (.xlsx) ou CSV offline</Text>
              </View>
              <ChevronRight size={18} color={colors.textDisabled} />
            </Pressable>

            {/* Minhas Listas */}
            {onListsPress && (
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => {
                  onClose();
                  onListsPress();
                }}
              >
                <View style={[styles.itemIconWrap, { backgroundColor: colors.primaryGhost }]}>
                  <ListOrdered size={18} color={colors.primary} />
                </View>
                <View style={styles.itemTextWrap}>
                  <Text style={styles.itemTitle}>Minhas Listas de Entregas</Text>
                  <Text style={styles.itemSub}>Lista 1, Lista 2, trocar ou apagar</Text>
                </View>
                <ChevronRight size={18} color={colors.textDisabled} />
              </Pressable>
            )}

            {/* Nova Parada */}
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                onClose();
                onAddStopPress();
              }}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: colors.successGhost }]}>
                <Plus size={18} color={colors.success} />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Adicionar Parada</Text>
                <Text style={styles.itemSub}>Cadastrar com coordenadas</Text>
              </View>
              <ChevronRight size={18} color={colors.textDisabled} />
            </Pressable>

            {/* Ajustes */}
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                onClose();
                onSettingsPress();
              }}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: colors.surfaceElevated }]}>
                <Settings size={18} color={colors.textSecondary} />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Configurações</Text>
                <Text style={styles.itemSub}>Preferências e dados</Text>
              </View>
              <ChevronRight size={18} color={colors.textDisabled} />
            </Pressable>

            <View style={styles.divider} />

            {/* Limpar Rota */}
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                styles.menuItemDanger,
                pressed && styles.menuItemPressed,
              ]}
              onPress={() => {
                onClose();
                onClearRoutePress();
              }}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: colors.dangerGhost }]}>
                <Trash2 size={18} color={colors.danger} />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={[styles.itemTitle, { color: colors.danger }]}>Limpar Rota Atual</Text>
                <Text style={styles.itemSub}>Apagar paradas carregadas</Text>
              </View>
              <ChevronRight size={18} color={colors.danger} />
            </Pressable>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerBrand}>RotaSimples</Text>
            <Text style={styles.footerSub}>Gestão e Roteamento Inteligente</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
    },
    drawer: {
      backgroundColor: colors.surface,
      height: '100%',
      paddingHorizontal: spacing.lg,
      borderTopRightRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      ...shadows.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
    },
    logoBadge: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandTextWrap: {
      gap: 1,
    },
    brandTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.3,
    },
    brandSub: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textMuted,
    },
    headerRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
    },
    themeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
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
    btnPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.95 }],
    },
    statsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 3,
      marginVertical: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statsLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    statsCountBadge: {
      backgroundColor: colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    statsCountText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    menuList: {
      flex: 1,
      gap: spacing.xs + 2,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      gap: spacing.sm + 2,
    },
    menuItemPressed: {
      backgroundColor: colors.surfaceElevated,
    },
    menuItemDanger: {
      marginTop: spacing.xs,
    },
    itemIconWrap: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemTextWrap: {
      flex: 1,
      gap: 1,
    },
    itemTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    itemSub: {
      fontSize: 11,
      color: colors.textMuted,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
    footer: {
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      alignItems: 'center',
      gap: 2,
    },
    footerBrand: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    footerSub: {
      fontSize: 10,
      color: colors.textDisabled,
    },
  });

