import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Clock, Check, X, ChevronRight, Package } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { createTimelineStyles } from './MapScreenStyles';
import type { RouteStop } from '../../types/geo';

export interface StopTimelineRowProps {
  stop: RouteStop;
  index: number;
  isNext: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  timeStr: string;
  isLastItem: boolean;
  onSelect: (stop: RouteStop) => void;
  onLongPress?: (stop: RouteStop) => void;
}

const StopTimelineRow = React.memo(
  ({
    stop,
    index,
    isNext,
    isCompleted,
    isFailed,
    timeStr,
    isLastItem,
    onSelect,
    onLongPress,
  }: StopTimelineRowProps) => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => createTimelineStyles(colors), [colors]);
    const seqStr = String(stop.stopNumber || index + 1).padStart(2, '0');
    const primaryDelivery = stop.deliveries[0];

    return (
      <View style={styles.stopTimelineRow}>
        {/* Left Column: Timeline Line + Badge Node */}
        <View style={styles.nodeColumn}>
          <View
            style={[
              styles.timelineBadge,
              isNext && styles.timelineBadgeNext,
              isCompleted && styles.timelineBadgeCompleted,
              isFailed && styles.timelineBadgeFailed,
            ]}
          >
            {isCompleted ? (
              <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
            ) : isFailed ? (
              <X size={14} color="#FFFFFF" strokeWidth={2.5} />
            ) : (
              <Text
                style={[
                  styles.timelineBadgeText,
                  isNext && styles.timelineBadgeTextNext,
                ]}
              >
                {seqStr}
              </Text>
            )}
          </View>
          {!isLastItem && <View style={styles.timelineVerticalLine} />}
        </View>

        {/* Right Column: Stop Card */}
        <Pressable
          style={({ pressed }) => [
            styles.stopCard,
            isNext && styles.stopCardNext,
            pressed && styles.stopCardPressed,
          ]}
          onPress={() => onSelect(stop)}
          onLongPress={() => onLongPress?.(stop)}
        >
          {/* Top row: Time + Status Badge + Count Tag */}
          <View style={styles.stopCardHeader}>
            <View style={styles.timeTagRow}>
              <Clock size={12} color={colors.textMuted} />
              <Text style={styles.stopTimeText}>{timeStr}</Text>
            </View>

            <View style={styles.headerBadgesRow}>
              {stop.totalCount > 1 && (
                <View style={styles.multiPackageBadge}>
                  <Package size={11} color={colors.primary} />
                  <Text style={styles.multiPackageText}>
                    {stop.totalCount} entregas
                  </Text>
                </View>
              )}

              <View
                style={[
                  styles.statusPill,
                  isNext && styles.statusPillNext,
                  isCompleted && styles.statusPillCompleted,
                  isFailed && styles.statusPillFailed,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    isNext && styles.statusPillTextNext,
                    isCompleted && styles.statusPillTextCompleted,
                    isFailed && styles.statusPillTextFailed,
                  ]}
                >
                  {isCompleted
                    ? 'Concluída'
                    : isFailed
                    ? 'Insucesso'
                    : isNext
                    ? 'Próxima Parada'
                    : 'Pendente'}
                </Text>
              </View>
            </View>
          </View>

          {/* Main Address line + Chevron */}
          <View style={styles.stopCardBody}>
            <View style={styles.addressWrap}>
              <Text
                style={styles.stopAddressText}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {stop.address || primaryDelivery?.destination || primaryDelivery?.name}
              </Text>
              {stop.bairro ? (
                <Text style={styles.stopBairroText}>
                  {stop.bairro}{stop.city ? ` · ${stop.city}` : ''}
                </Text>
              ) : null}
            </View>
            <ChevronRight size={18} color={colors.textDisabled} />
          </View>
        </Pressable>
      </View>
    );
  },
  (prev, next) =>
    prev.stop.key === next.stop.key &&
    prev.stop.status === next.stop.status &&
    prev.stop.totalCount === next.stop.totalCount &&
    prev.isNext === next.isNext &&
    prev.isCompleted === next.isCompleted &&
    prev.isFailed === next.isFailed &&
    prev.timeStr === next.timeStr &&
    prev.index === next.index &&
    prev.isLastItem === next.isLastItem,
);

export default StopTimelineRow;
