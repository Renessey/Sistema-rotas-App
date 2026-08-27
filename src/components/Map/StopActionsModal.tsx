import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadows, spacing, typography } from '../../theme';
import {
  Tag,
  FileText,
  Plus,
  Edit2,
  Trash2,
  X,
} from 'lucide-react-native';
import type { RouteStop } from '../../types/geo';

export interface StopActionsModalProps {
  visible: boolean;
  stop: RouteStop | null;
  onClose: () => void;
  onMarkPackages?: () => void;
  onGenerateDoc?: () => void;
  onAddStop?: () => void;
  onEditStop?: () => void;
  onRemoveStop?: () => void;
}

export function StopActionsModal({
  visible,
  stop,
  onClose,
  onMarkPackages,
  onGenerateDoc,
  onAddStop,
  onEditStop,
  onRemoveStop,
}: StopActionsModalProps) {
  const insets = useSafeAreaInsets();
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 65, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 120, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  if (!visible || !stop) return null;

  const items = [
    {
      id: 'mark_packages',
      title: 'MARCAR PACOTES',
      icon: Tag,
      iconColor: '#818CF8',
      textColor: '#FFFFFF',
      onPress: () => {
        onClose();
        onMarkPackages?.();
      },
    },
    {
      id: 'generate_doc',
      title: 'GERAR DOCUMENTO (RG/CPF)',
      icon: FileText,
      iconColor: '#60A5FA',
      textColor: '#FFFFFF',
      onPress: () => {
        onClose();
        onGenerateDoc?.();
      },
    },
    {
      id: 'add_stop',
      title: 'ADICIONAR PARADA',
      icon: Plus,
      iconColor: '#10B981',
      textColor: '#FFFFFF',
      onPress: () => {
        onClose();
        onAddStop?.();
      },
    },
    {
      id: 'edit_stop',
      title: 'EDITAR PARADA',
      icon: Edit2,
      iconColor: '#818CF8',
      textColor: '#FFFFFF',
      onPress: () => {
        onClose();
        onEditStop?.();
      },
    },
    {
      id: 'remove_stop',
      title: 'REMOVER PARADA',
      icon: Trash2,
      iconColor: '#EF4444',
      textColor: '#EF4444',
      onPress: () => {
        onClose();
        onRemoveStop?.();
      },
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          style={[
            styles.menuCard,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
              marginBottom: insets.bottom + 120,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardHeaderTitle} numberOfLines={1}>
              {stop.address}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <X size={16} color="#94A3B8" />
            </Pressable>
          </View>

          <View style={styles.menuItemsList}>
            {items.map((item, index) => {
              const IconComp = item.icon;
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.menuRow,
                    index < items.length - 1 && styles.menuRowDivider,
                    pressed && styles.menuRowPressed,
                  ]}
                  onPress={item.onPress}
                >
                  <View style={styles.iconWrap}>
                    <IconComp size={19} color={item.iconColor} strokeWidth={2.2} />
                  </View>
                  <Text style={[styles.menuText, { color: item.textColor }]}>{item.title}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.65)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  menuCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#0F172A',
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    ...shadows.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeaderTitle: {
    ...typography.caption,
    color: '#94A3B8',
    fontWeight: '800',
    flex: 1,
    marginRight: spacing.sm,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemsList: {
    paddingVertical: spacing.xs,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  menuRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  menuRowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
