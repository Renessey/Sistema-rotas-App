import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows, typography } from '../../theme';
import { Map, BarChart3, Package, Settings } from 'lucide-react-native';

export type NavTabKey = 'Map' | 'Home' | 'Deliveries' | 'Settings';

export interface NavTabItem {
  key: NavTabKey;
  label: string;
  badge?: number;
}

export interface BottomNavBarProps {
  activeTab: NavTabKey;
  onSelectTab: (tab: NavTabKey) => void;
  pendingCount?: number;
}

export function BottomNavBar({
  activeTab,
  onSelectTab,
  pendingCount = 0,
}: BottomNavBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const tabs: { key: NavTabKey; label: string; icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>; badge?: number }[] = [
    {
      key: 'Map',
      label: 'Entrega',
      icon: Map,
    },
    {
      key: 'Home',
      label: 'Rotas',
      icon: BarChart3,
    },
    {
      key: 'Deliveries',
      label: 'Endereços',
      icon: Package,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      key: 'Settings',
      label: 'Ajustes',
      icon: Settings,
    },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, spacing.xs) + 4,
        },
      ]}
    >
      <View style={styles.tabRow}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const IconComp = tab.icon;
          const iconColor = isActive ? colors.primary : colors.textMuted;

          return (
            <Pressable
              key={tab.key}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => onSelectTab(tab.key)}
              hitSlop={4}
            >
              <View style={styles.iconContainer}>
                <IconComp
                  size={21}
                  color={iconColor}
                  strokeWidth={isActive ? 2.4 : 1.8}
                />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  isActive && styles.tabLabelActive,
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {isActive && <View style={styles.activeIndicator} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}


const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.xs + 2,
      ...shadows.lg,
    },
    tabRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: spacing.sm,
    },
    tabBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xs,
      gap: 3,
      position: 'relative',
    },
    tabBtnActive: {},
    iconContainer: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
    },
    tabIcon: {
      fontSize: 20,
      opacity: 0.65,
    },
    tabIconActive: {
      opacity: 1,
      transform: [{ scale: 1.08 }],
    },
    tabLabel: {
      ...typography.caption,
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '500',
    },
    tabLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    activeIndicator: {
      position: 'absolute',
      bottom: -4,
      width: 20,
      height: 3,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -8,
      backgroundColor: colors.danger,
      borderRadius: 9,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.surface,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '800',
    },
  });
