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

interface SideMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onImportPress: () => void;
  onAddStopPress: () => void;
  onFitRoutePress: () => void;
  onLayersPress: () => void;
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
  const insets = useSafeAreaInsets();
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
                <Text style={styles.logoIcon}>⚡</Text>
              </View>
              <View style={styles.brandTextWrap}>
                <Text style={styles.brandTitle}>RotaSimples</Text>
                <Text style={styles.brandSub}>100% Offline · Valhalla Local</Text>
              </View>
            </View>

            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
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
              <View style={[styles.itemIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Text style={styles.itemIcon}>📄</Text>
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Importar Planilha</Text>
                <Text style={styles.itemSub}>Excel (.xlsx) ou CSV offline</Text>
              </View>
              <Text style={styles.itemChevron}>›</Text>
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
                <View style={[styles.itemIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Text style={styles.itemIcon}>📋</Text>
                </View>
                <View style={styles.itemTextWrap}>
                  <Text style={styles.itemTitle}>Minhas Listas de Entregas</Text>
                  <Text style={styles.itemSub}>Lista 1, Lista 2, trocar ou apagar</Text>
                </View>
                <Text style={styles.itemChevron}>›</Text>
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
              <View style={[styles.itemIconWrap, { backgroundColor: '#F0FDF4' }]}>
                <Text style={styles.itemIcon}>➕</Text>
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Adicionar Parada</Text>
                <Text style={styles.itemSub}>Cadastrar com coordenadas</Text>
              </View>
              <Text style={styles.itemChevron}>›</Text>
            </Pressable>

            {/* Enquadrar Rota */}
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                onClose();
                onFitRoutePress();
              }}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: '#FEF3C7' }]}>
                <Text style={styles.itemIcon}>🎯</Text>
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Enquadrar Rota</Text>
                <Text style={styles.itemSub}>Ver todas as paradas no mapa</Text>
              </View>
              <Text style={styles.itemChevron}>›</Text>
            </Pressable>

            {/* Camadas do Mapa */}
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                onClose();
                onLayersPress();
              }}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: '#F3E8FF' }]}>
                <Text style={styles.itemIcon}>🗺️</Text>
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Camadas do Mapa</Text>
                <Text style={styles.itemSub}>Estilos, satélite e veículo</Text>
              </View>
              <Text style={styles.itemChevron}>›</Text>
            </Pressable>

            {/* Diagnóstico do Sistema */}
            {onDiagnosticPress && (
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => {
                  onClose();
                  onDiagnosticPress();
                }}
              >
                <View style={[styles.itemIconWrap, { backgroundColor: '#ECFDF5' }]}>
                  <Text style={styles.itemIcon}>🩺</Text>
                </View>
                <View style={styles.itemTextWrap}>
                  <Text style={styles.itemTitle}>Diagnóstico do Sistema</Text>
                  <Text style={styles.itemSub}>GPS, SQLite, Valhalla e Mapa</Text>
                </View>
                <Text style={styles.itemChevron}>›</Text>
              </Pressable>
            )}

            {/* Ajustes */}
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                onClose();
                onSettingsPress();
              }}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: '#F1F5F9' }]}>
                <Text style={styles.itemIcon}>⚙️</Text>
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Configurações</Text>
                <Text style={styles.itemSub}>Preferências e dados</Text>
              </View>
              <Text style={styles.itemChevron}>›</Text>
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
              <View style={[styles.itemIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <Text style={styles.itemIcon}>🗑️</Text>
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={[styles.itemTitle, { color: '#DC2626' }]}>Limpar Rota Atual</Text>
                <Text style={styles.itemSub}>Apagar paradas carregadas</Text>
              </View>
              <Text style={[styles.itemChevron, { color: '#DC2626' }]}>›</Text>
            </Pressable>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerBrand}>RotaSimples 100% Offline</Text>
            <Text style={styles.footerSub}>Maricá · Niterói · São Gonçalo</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  drawer: {
    backgroundColor: '#FFFFFF',
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
    borderBottomColor: '#F1F5F9',
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
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  brandTextWrap: {
    gap: 1,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  brandSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    marginVertical: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  statsCountBadge: {
    backgroundColor: '#2563EB',
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
    backgroundColor: '#F8FAFC',
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
  itemIcon: {
    fontSize: 18,
  },
  itemTextWrap: {
    flex: 1,
    gap: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  itemSub: {
    fontSize: 11,
    color: '#64748B',
  },
  itemChevron: {
    fontSize: 20,
    fontWeight: '600',
    color: '#94A3B8',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: spacing.xs,
  },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
    gap: 2,
  },
  footerBrand: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  footerSub: {
    fontSize: 10,
    color: '#94A3B8',
  },
});
