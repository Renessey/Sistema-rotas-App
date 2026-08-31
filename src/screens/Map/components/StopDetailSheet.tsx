import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { X, Navigation, MapPin, MessageSquare, Check, Search, UserCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationLauncher } from '../../../services/navigation/NavigationLauncher';
import { useTheme } from '../../../theme/ThemeContext';
import { createScreenStyles } from '../MapScreenStyles';
import type { RouteStop, FailReason } from '../../../types/geo';

const RECEIVER_CHIPS = ['Próprio', 'Portaria', 'Vizinho', 'Familiar'];

interface StopDetailSheetProps {
  activeStop: RouteStop;
  onClose: () => void;
  onComplete: (stop: RouteStop, receiver?: string) => void;
  onSkip: (stop: RouteStop, reason?: FailReason) => void;
  onOpenAdjustPin?: (stop: RouteStop) => void;
}

export function StopDetailSheet({
  activeStop,
  onClose,
  onComplete,
  onSkip,
  onOpenAdjustPin,
}: StopDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createScreenStyles(colors), [colors]);
  const [selectedReceiver, setSelectedReceiver] = useState('');

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

        {/* Receiver Quick Selector (Optional) */}
        <View style={{ gap: 6, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <UserCheck size={13} color={colors.textMuted} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }}>
              Quem recebeu? (Opcional):
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {RECEIVER_CHIPS.map((chip) => {
              const isSel = selectedReceiver === chip;
              return (
                <Pressable
                  key={chip}
                  style={{
                    backgroundColor: isSel ? colors.primary : colors.surfaceElevated,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: isSel ? colors.primary : colors.border,
                  }}
                  onPress={() => setSelectedReceiver(isSel ? '' : chip)}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: isSel ? '#FFFFFF' : colors.textSecondary,
                    }}
                  >
                    {chip}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
          {onOpenAdjustPin && (
            <Pressable
              style={[styles.modalActionBtn, { borderColor: colors.primary }]}
              onPress={() => onOpenAdjustPin(activeStop)}
            >
              <Search size={15} color={colors.primary} />
              <Text style={[styles.modalActionBtnText, { color: colors.primary }]}>Ajustar Pino</Text>
            </Pressable>
          )}
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
            onPress={() => onComplete(activeStop, selectedReceiver || undefined)}
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
