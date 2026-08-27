import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';
import { X, Navigation, MapPin, MessageSquare, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationLauncher } from '../../services/navigation/NavigationLauncher';
import { useTheme } from '../../theme/ThemeContext';
import { createScreenStyles } from './MapScreenStyles';
import type { RouteStop, FailReason } from '../../types/geo';

interface StopDetailSheetProps {
  activeStop: RouteStop;
  onClose: () => void;
  onComplete: (stop: RouteStop) => void;
  onSkip: (stop: RouteStop, reason?: FailReason) => void;
}

export function StopDetailSheet({
  activeStop,
  onClose,
  onComplete,
  onSkip,
}: StopDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createScreenStyles(colors), [colors]);

  return (
    <View style={styles.stopModalOverlay}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.stopModalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.modalHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalStopBadge}>
              PARADA {String(activeStop.stopNumber).padStart(2, '0')}
              {activeStop.totalCount > 1 ? ` · ${activeStop.totalCount} ENTREGAS NESTE ENDEREÇO` : ''}
            </Text>
            <Text style={styles.modalStopName}>{activeStop.address}</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <X size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {activeStop.bairro || activeStop.city ? (
          <Text style={styles.modalMetaText}>
            {[activeStop.bairro, activeStop.city].filter(Boolean).join(' · ')}
          </Text>
        ) : null}

        {/* Deliveries inside this stop */}
        <ScrollView style={styles.modalDeliveriesList} showsVerticalScrollIndicator={false}>
          {activeStop.deliveries.map((del, idx) => (
            <View key={del.id} style={styles.modalDeliveryItem}>
              <View style={styles.modalDeliveryHeader}>
                <Text style={styles.modalDeliveryTitle}>
                  {activeStop.totalCount > 1 ? `Entrega #${idx + 1}: ` : ''}
                  {del.destination || del.name}
                </Text>
                {del.pedido ? (
                  <View style={styles.orderPill}>
                    <Text style={styles.orderPillText}>Pedido: {del.pedido}</Text>
                  </View>
                ) : null}
              </View>
              {del.telefone ? (
                <Text style={styles.modalDeliverySub}>📞 {del.telefone}</Text>
              ) : null}
              {del.notes ? (
                <Text style={styles.modalDeliveryNotes}>📝 {del.notes}</Text>
              ) : null}
            </View>
          ))}
        </ScrollView>

        {/* Quick action buttons */}
        <View style={styles.modalActionsRow}>
          <Pressable
            style={styles.modalActionBtn}
            onPress={() =>
              NavigationLauncher.openNavigation(
                [activeStop.longitude, activeStop.latitude],
                activeStop.address,
                'waze',
              )
            }
          >
            <Navigation size={15} color={colors.primary} />
            <Text style={styles.modalActionBtnText}>Waze</Text>
          </Pressable>
          <Pressable
            style={styles.modalActionBtn}
            onPress={() =>
              NavigationLauncher.openNavigation(
                [activeStop.longitude, activeStop.latitude],
                activeStop.address,
                'google_maps',
              )
            }
          >
            <MapPin size={15} color={colors.primary} />
            <Text style={styles.modalActionBtnText}>Google Maps</Text>
          </Pressable>
          {activeStop.deliveries[0]?.phone || activeStop.deliveries[0]?.telefone ? (
            <Pressable
              style={styles.modalActionBtn}
              onPress={() => {
                const firstD = activeStop.deliveries[0];
                NavigationLauncher.openWhatsApp(
                  (firstD.phone || firstD.telefone)!,
                  firstD.name,
                  firstD.address,
                );
              }}
            >
              <MessageSquare size={15} color={colors.success} />
              <Text style={[styles.modalActionBtnText, { color: colors.success }]}>WhatsApp</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Delivery Status buttons */}
        <View style={styles.modalStatusRow}>
          <Pressable
            style={[styles.modalStatusBtn, { backgroundColor: colors.success }]}
            onPress={() => onComplete(activeStop)}
          >
            <Check size={16} color="#FFFFFF" />
            <Text style={styles.modalStatusBtnText}>
              {activeStop.totalCount > 1
                ? `Concluir (${activeStop.totalCount} Entregas)`
                : 'Marcar Entregue'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modalStatusBtn, { backgroundColor: colors.danger }]}
            onPress={() => onSkip(activeStop, 'absent')}
          >
            <X size={16} color="#FFFFFF" />
            <Text style={styles.modalStatusBtnText}>Não Entregue</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
