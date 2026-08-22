import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  Alert,
  Animated,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { DatabaseService } from '../../storage/DatabaseService';
import type { DeliveryEntity, DeliveryStatus, FailReason } from '../../types/geo';
import { colors, spacing, radius, shadows, typography, statusConfig } from '../../theme';
import { NavigationLauncher } from '../../services/navigation/NavigationLauncher';
import { AddDeliveryModal } from '../../components/AddDeliveryModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Deliveries'>;

type FilterTab = 'all' | DeliveryStatus | 'no_location';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',         label: '📦 Todas'      },
  { key: 'pending',     label: '⏳ Pendentes'   },
  { key: 'in_progress', label: '🚚 Em Rota'     },
  { key: 'completed',   label: '✅ Entregues'   },
  { key: 'failed',      label: '❌ Insucesso'   },
  { key: 'no_location', label: '📍 Sem Local'   },
];

export default function DeliveriesScreen({ navigation }: Props) {
  const [all, setAll] = useState<DeliveryEntity[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [failModalId, setFailModalId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;

  const reload = useCallback(() => {
    setAll(DatabaseService.getAllDeliveries());
  }, []);

  useFocusEffect(reload);

  // Animate search bar in
  useEffect(() => {
    Animated.timing(searchAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [searchAnim]);

  const filtered = all.filter((d) => {
    // Filter by tab
    if (activeFilter === 'no_location') {
      if (d.latitude !== null && d.longitude !== null) return false;
    } else if (activeFilter !== 'all') {
      if (d.status !== activeFilter) return false;
    }
    // Search
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.name?.toLowerCase().includes(q) ||
      d.address?.toLowerCase().includes(q) ||
      d.orderCode?.toLowerCase().includes(q) ||
      d.neighborhood?.toLowerCase().includes(q) ||
      d.phone?.includes(q)
    );
  });

  const handleCompleteDelivery = (d: DeliveryEntity) => {
    DatabaseService.updateDeliveryStatus(d.id, 'completed', { deliveredAt: Date.now() });
    setAll((prev) =>
      prev.map((item) =>
        item.id === d.id
          ? { ...item, status: 'completed', deliveredAt: Date.now(), failReason: null }
          : item,
      ),
    );
  };

  const handleFailDelivery = (d: DeliveryEntity, reason: FailReason) => {
    DatabaseService.updateDeliveryStatus(d.id, 'failed', { failReason: reason });
    setFailModalId(null);
    setAll((prev) =>
      prev.map((item) =>
        item.id === d.id
          ? { ...item, status: 'failed', failReason: reason, deliveredAt: null }
          : item,
      ),
    );
  };

  const renderItem = ({ item }: { item: DeliveryEntity }) => (
    <DeliveryCard
      item={item}
      onMapPress={() => navigation.navigate('Map')}
      onComplete={() => handleCompleteDelivery(item)}
      onFail={() => setFailModalId(item.id)}
      onWhatsApp={() => {
        if (item.phone) {
          const addr = `${item.address}${item.number ? ', ' + item.number : ''}`;
          NavigationLauncher.openWhatsApp(item.phone, item.name, addr);
        } else {
          Alert.alert('Sem telefone', 'Esta entrega não possui número de telefone cadastrado.');
        }
      }}
      onWaze={() => {
        if (item.latitude !== null && item.longitude !== null) {
          NavigationLauncher.openNavigation([item.longitude, item.latitude], item.address, 'waze');
        }
      }}
      onCall={() => {
        if (item.phone) {
          NavigationLauncher.callPhone(item.phone);
        } else {
          Alert.alert('Sem telefone', 'Esta entrega não possui número de telefone cadastrado.');
        }
      }}
    />
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <Animated.View style={[styles.searchBar, { opacity: searchAnim }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nome, endereço, pedido…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </Pressable>
        )}
      </Animated.View>

      {/* Filter Tabs */}
      <FlatList
        horizontal
        data={FILTER_TABS}
        keyExtractor={(t) => t.key}
        contentContainerStyle={styles.tabBar}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item: tab }) => {
          const count = tab.key === 'all'
            ? all.length
            : tab.key === 'no_location'
            ? all.filter(d => d.latitude === null).length
            : all.filter(d => d.status === tab.key).length;
          const isActive = activeFilter === tab.key;
          return (
            <Pressable
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveFilter(tab.key)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>
              {all.length === 0 ? '📂' : '🔍'}
            </Text>
            <Text style={styles.emptyText}>
              {all.length === 0
                ? 'Nenhuma entrega importada.\nVá em "Importar Planilha".'
                : 'Nenhuma entrega encontrada com os filtros atuais.'}
            </Text>
          </View>
        }
      />

      {/* Fail reason modal */}
      {failModalId !== null && (
        <FailModal
          delivery={all.find(d => d.id === failModalId)!}
          onSelect={(r) => handleFailDelivery(all.find(d => d.id === failModalId)!, r)}
          onClose={() => setFailModalId(null)}
        />
      )}

      {/* FAB — Add Delivery */}
      <Pressable style={styles.fab} onPress={() => setShowAddModal(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* Add Delivery Modal */}
      <AddDeliveryModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={reload}
      />
    </View>
  );
}

/* ─── Delivery Card ─── */
function DeliveryCard({
  item, onMapPress, onComplete, onFail, onWhatsApp, onWaze, onCall,
}: {
  item: DeliveryEntity;
  onMapPress: () => void;
  onComplete: () => void;
  onFail: () => void;
  onWhatsApp: () => void;
  onWaze: () => void;
  onCall: () => void;
}) {
  const cfg = statusConfig[item.status];
  const located = item.latitude !== null && item.longitude !== null;
  const fullAddress = [
    item.address,
    item.number,
    item.complement,
    item.neighborhood,
    `${item.city}/${item.state}`,
  ].filter(Boolean).join(', ');

  return (
    <View style={[cardStyles.card, { borderLeftColor: cfg.color, borderLeftWidth: 4 }]}>
      {/* Header */}
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          {item.sequence !== null && (
            <View style={[cardStyles.seqBadge, { backgroundColor: cfg.color }]}>
              <Text style={cardStyles.seqText}>{item.sequence + 1}</Text>
            </View>
          )}
          <Text style={cardStyles.name} numberOfLines={1}>{item.name}</Text>
        </View>
        <View style={[cardStyles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={cardStyles.statusIcon}>{cfg.icon}</Text>
          <Text style={[cardStyles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Address */}
      <Text style={cardStyles.address} numberOfLines={2}>{fullAddress}</Text>

      {/* Meta Row */}
      <View style={cardStyles.metaRow}>
        {item.orderCode ? (
          <View style={cardStyles.metaChip}>
            <Text style={cardStyles.metaChipText}>📋 {item.orderCode}</Text>
          </View>
        ) : null}
        {item.cep ? (
          <View style={cardStyles.metaChip}>
            <Text style={cardStyles.metaChipText}>📮 {item.cep}</Text>
          </View>
        ) : null}
        <View style={[cardStyles.metaChip, { backgroundColor: located ? colors.successGhost : colors.dangerGhost }]}>
          <Text style={[cardStyles.metaChipText, { color: located ? colors.success : colors.danger }]}>
            {located ? '📍 Localizada' : '⚠️ Sem coord.'}
          </Text>
        </View>
      </View>

      {/* Notes */}
      {item.notes ? <Text style={cardStyles.notes}>💬 {item.notes}</Text> : null}

      {/* Action Buttons */}
      <View style={cardStyles.actions}>
        {item.phone ? (
          <>
            <QuickBtn icon="💬" label="WhatsApp" color={colors.success} onPress={onWhatsApp} />
            <QuickBtn icon="📞" label="Ligar" color={colors.primary} onPress={onCall} />
          </>
        ) : null}
        {located && <QuickBtn icon="🗺️" label="Waze" color={colors.warning} onPress={onWaze} />}
        <QuickBtn icon="📍" label="Mapa" color={colors.info} onPress={onMapPress} />
        {item.status !== 'completed' && item.status !== 'failed' && (
          <>
            <QuickBtn icon="✅" label="Concluir" color={colors.success} onPress={onComplete} />
            <QuickBtn icon="❌" label="Insucesso" color={colors.danger} onPress={onFail} />
          </>
        )}
      </View>
    </View>
  );
}

function QuickBtn({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [quickBtnStyles.btn, { backgroundColor: color + '18', borderColor: color + '44' }, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Text style={quickBtnStyles.icon}>{icon}</Text>
      <Text style={[quickBtnStyles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

/* ─── Fail Reason Modal ─── */
const FAIL_REASONS: { key: FailReason; label: string; icon: string }[] = [
  { key: 'absent',        label: 'Ausente / Não atendeu', icon: '🚪' },
  { key: 'refused',       label: 'Recusou a entrega',     icon: '🙅' },
  { key: 'wrong_address', label: 'Endereço errado',       icon: '📍' },
  { key: 'no_access',     label: 'Sem acesso ao local',   icon: '🔒' },
  { key: 'other',         label: 'Outro motivo',          icon: '💬' },
];

function FailModal({ delivery, onSelect, onClose }: {
  delivery: DeliveryEntity; onSelect: (r: FailReason) => void; onClose: () => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <View style={modalStyles.box}>
          <Text style={modalStyles.title}>Motivo do Insucesso</Text>
          <Text style={modalStyles.sub}>{delivery?.name}</Text>
          {FAIL_REASONS.map((r) => (
            <Pressable key={r.key} style={modalStyles.option} onPress={() => onSelect(r.key)}>
              <Text style={modalStyles.optionIcon}>{r.icon}</Text>
              <Text style={modalStyles.optionLabel}>{r.label}</Text>
            </Pressable>
          ))}
          <Pressable style={modalStyles.cancel} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancelar</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    margin: spacing.md,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  searchIcon: { fontSize: 16, marginRight: spacing.sm },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
  },
  clearBtn: { fontSize: 16, color: colors.textMuted, padding: spacing.xs },
  tabBar: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.bodySmall, color: colors.textMuted, fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  tabCount: { backgroundColor: colors.border, borderRadius: radius.full, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabCountText: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  tabCountTextActive: { color: '#fff' },
  listContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: 100 },
  emptyBox: { alignItems: 'center', paddingTop: spacing.xxxl, gap: spacing.md },
  emptyIcon: { fontSize: 48 },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.colored(colors.primary),
  },
  fabText: { fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 32 },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  seqBadge: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  seqText: { color: '#fff', ...typography.caption, fontWeight: '700' },
  name: { ...typography.titleSmall, color: colors.text, flex: 1 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  statusIcon: { fontSize: 11 },
  statusLabel: { ...typography.caption, fontWeight: '700' },
  address: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 18 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metaChip: {
    backgroundColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  metaChipText: { ...typography.caption, color: colors.textMuted, fontWeight: '500' },
  notes: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});

const quickBtnStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.sm, borderWidth: 1,
  },
  icon: { fontSize: 13 },
  label: { ...typography.caption, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  box: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadows.xl,
  },
  title: { ...typography.title, color: colors.text },
  sub: { ...typography.bodySmall, color: colors.textMuted, marginBottom: spacing.sm },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.border,
  },
  optionIcon: { fontSize: 20 },
  optionLabel: { ...typography.body, color: colors.text },
  cancel: {
    alignItems: 'center', padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    marginTop: spacing.xs,
  },
  cancelText: { ...typography.bodyMedium, color: colors.textMuted },
});
