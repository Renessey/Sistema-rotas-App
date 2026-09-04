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
import { useTheme } from '../../theme/ThemeContext';
import { radius, shadows, spacing, typography } from '../../theme';
import {
  Share2,
  X,
} from 'lucide-react-native';

export interface QuickActionsMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onReoptimize: () => void;
  onShareRoute?: () => void;
}

export function QuickActionsMenuModal({
  visible,
  onClose,
  onReoptimize,
  onShareRoute,
}: QuickActionsMenuModalProps) {
  const { colors } = useTheme();
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

  if (!visible) return null;

  const menuItems = [
    {
      id: 'share',
      title: 'COMPARTILHAR ROTA',
      icon: Share2,
      iconColor: '#818CF8',
      onPress: () => {
        onClose();
        onShareRoute?.();
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
              marginBottom: insets.bottom + 80,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardHeaderTitle}>Opções da Rota</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <X size={16} color="#94A3B8" />
            </Pressable>
          </View>

          <View style={styles.menuItemsList}>
            {menuItems.map((item, index) => {
              const IconComp = item.icon;
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.menuRow,
                    index < menuItems.length - 1 && styles.menuRowDivider,
                    pressed && styles.menuRowPressed,
                  ]}
                  onPress={item.onPress}
                >
                  <View style={styles.iconWrap}>
                    <IconComp size={20} color={item.iconColor} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.menuText}>{item.title}</Text>
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
  },
  cardHeaderTitle: {
    ...typography.caption,
    color: '#94A3B8',
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
    paddingVertical: 14,
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
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
});
