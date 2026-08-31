import React from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Navigation, MapPin, MessageSquare, Check, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { spacing, radius, shadows, typography } from '../../../theme';
import { NavigationLauncher } from '../../../services/navigation/NavigationLauncher';
import type { RouteStop } from '../../../types/geo';

interface NextStopHUDProps {
  nextStop: RouteStop | null;
  sheetTranslateY: Animated.Value;
  transExpanded: number;
  transHalf: number;
  transCollapsed: number;
  onSelectStop: (stop: RouteStop) => void;
  onCompleteStop: (stop: RouteStop) => void;
}

export function NextStopHUD({
  nextStop,
  sheetTranslateY,
  transExpanded,
  transHalf,
  transCollapsed,
  onSelectStop,
  onCompleteStop,
}: NextStopHUDProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  if (!nextStop) return null;

  const phone = nextStop.deliveries[0]?.phone || nextStop.deliveries[0]?.telefone;
  const isMulti = nextStop.totalCount > 1;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: Math.max(insets.top, 12) + 8,
          opacity: sheetTranslateY.interpolate({
            inputRange: [transExpanded, transHalf, transCollapsed],
            outputRange: [0, 0.4, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            {
              translateY: sheetTranslateY.interpolate({
                inputRange: [transExpanded, transHalf, transCollapsed],
                outputRange: [-60, -20, 0],
                extrapolate: 'clamp',
              }),
            },
          ],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        {/* Top bar: Stop label & address */}
        <Pressable
          style={styles.headerPressable}
          onPress={() => onSelectStop(nextStop)}
          hitSlop={4}
        >
          <View style={styles.badgeCol}>
            <View style={styles.stopNumberBadge}>
              <Text style={styles.stopNumberText}>
                {String(nextStop.stopNumber).padStart(2, '0')}
              </Text>
            </View>
          </View>

          <View style={styles.textWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.nextLabel}>PRÓXIMA PARADA</Text>
              {isMulti && (
                <View style={styles.multiBadge}>
                  <Text style={styles.multiBadgeText}>{nextStop.totalCount} entregas</Text>
                </View>
              )}
            </View>
            <Text style={styles.addressText} numberOfLines={1}>
              {nextStop.address}
            </Text>
            {nextStop.bairro || nextStop.city ? (
              <Text style={styles.bairroText} numberOfLines={1}>
                {[nextStop.bairro, nextStop.city].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>

          <View style={styles.chevronWrap}>
            <ChevronRight size={18} color={colors.textMuted} />
          </View>
        </Pressable>

        {/* Quick action buttons row */}
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.wazeBtn, pressed && styles.btnPressed]}
            onPress={() =>
              NavigationLauncher.openNavigation(
                [nextStop.longitude, nextStop.latitude],
                nextStop.address,
                'waze',
              )
            }
          >
            <Navigation size={13} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Waze</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.mapsBtn, pressed && styles.btnPressed]}
            onPress={() =>
              NavigationLauncher.openNavigation(
                [nextStop.longitude, nextStop.latitude],
                nextStop.address,
                'google_maps',
              )
            }
          >
            <MapPin size={13} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Maps</Text>
          </Pressable>

          {phone ? (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.whatsappBtn, pressed && styles.btnPressed]}
              onPress={() => {
                const firstD = nextStop.deliveries[0];
                NavigationLauncher.openWhatsApp(
                  phone,
                  firstD.destination || firstD.name,
                  firstD.address,
                );
              }}
            >
              <MessageSquare size={13} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>WhatsApp</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.completeBtn, pressed && styles.btnPressed]}
            onPress={() => onCompleteStop(nextStop)}
          >
            <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.actionBtnText}>Entregar</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      zIndex: 40,
      elevation: 8,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.sm + 2,
      borderWidth: 1.5,
      borderColor: colors.primary,
      gap: spacing.xs + 2,
      ...shadows.lg,
      elevation: 8,
    },
    headerPressable: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    badgeCol: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopNumberBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.sm,
    },
    stopNumberText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
    },
    textWrap: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    nextLabel: {
      fontSize: 9.5,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.6,
    },
    multiBadge: {
      backgroundColor: colors.primaryGhost,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: radius.full,
    },
    multiBadgeText: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.primary,
    },
    addressText: {
      fontSize: 13.5,
      fontWeight: '800',
      color: colors.text,
    },
    bairroText: {
      fontSize: 11,
      color: colors.textMuted,
    },
    chevronWrap: {
      paddingLeft: 4,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 7,
      borderRadius: radius.md,
      gap: 4,
      ...shadows.sm,
    },
    wazeBtn: {
      backgroundColor: '#0284C7',
    },
    mapsBtn: {
      backgroundColor: '#475569',
    },
    whatsappBtn: {
      backgroundColor: '#16A34A',
    },
    completeBtn: {
      backgroundColor: '#059669',
      flex: 1.2,
    },
    actionBtnText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
    },
    btnPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.97 }],
    },
  });
