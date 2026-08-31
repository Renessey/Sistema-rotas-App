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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { DatabaseService } from '../../storage/DatabaseService';
import type { DeliveryEntity, DeliveryStatus, FailReason } from '../../types/geo';
import { spacing, radius, shadows, typography, statusConfig } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { NavigationLauncher } from '../../services/navigation/NavigationLauncher';
import { AddDeliveryModal } from '../../components/AddDeliveryModal';
import { DeliveryListsModal } from '../../components/Deliveries/DeliveryListsModal';
import { shareDeliveryReport } from '../../utils/reportExport';
import type { DeliveryListEntity } from '../../types/geo';
import {
  Package,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Search,
  X,
  Plus,
  Phone,
  MessageSquare,
  Navigation,
  Check,
  ListOrdered,
  Layers,
  HelpCircle,
  ChevronDown,
  Share2,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'Deliveries'>;

type FilterTab = 'all' | DeliveryStatus | 'no_location';

const FILTER_TABS: { key: FilterTab; label: string; Icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { key: 'all', label: 'Todas', Icon: Package },
  { key: 'pending', label: 'Pendentes', Icon: Clock },
  { key: 'optimized', label: 'Na Rota', Icon: MapPin },
  { key: 'completed', label: 'Entregues', Icon: CheckCircle2 },
  { key: 'failed', label: 'Insucesso', Icon: AlertCircle },
  { key: 'no_location', label: 'Sem Coords', Icon: AlertTriangle },
];

export default function DeliveriesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState<DeliveryEntity[]>([]);
  const [activeList, setActiveList] = useState<DeliveryListEntity | null>(null);
  const [showListsModal, setShowListsModal] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [failModalId, setFailModalId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;

  const reload = useCallback(() => {
    const active = DatabaseService.getActiveList();
    setActiveList(active);
    setAll(DatabaseService.getAllDeliveries(active?.id));
  }, []);

  useFocusEffect(reload);

  useEffect(() => {
    Animated.timing(searchAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [searchAnim]);

  const filtered = all.filter((d) => {
    if (activeFilter === 'no_location') {
      if (d.latitude !== null && d.longitude !== null && d.status !== 'invalid_coords') return false;
    } else if (activeFilter !== 'all') {
      if (d.status !== activeFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.destination?.toLowerCase().includes(q) ||
      d.bairro?.toLowerCase().includes(q) ||
      d.city?.toLowerCase().includes(q) ||
      d.zipCode?.toLowerCase().includes(q) ||
      d.pedido?.toLowerCase().includes(q) ||
      d.telefone?.includes(q) ||
      d.name?.toLowerCase().includes(q)
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
        const phone = item.telefone || item.phone;
        if (phone) {
          NavigationLauncher.openWhatsApp(phone, item.destination, item.destination);
        } else {
          Alert.alert('Sem telefone', 'Esta entrega não possui número de telefone cadastrado.');
        }
      }}
      onWaze={() => {
        if (item.latitude !== null && item.longitude !== null) {
          NavigationLauncher.openNavigation([item.longitude, item.latitude], item.destination, 'waze');
        }
      }}
      onCall={() => {
        const phone = item.telefone || item.phone;
        if (phone) {
          NavigationLauncher.callPhone(phone);
        } else {
          Alert.alert('Sem telefone', 'Esta entrega não possui número de telefone cadastrado.');
        }
      }}
    />
  );

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={[styles.screenHeader, { paddingTop: Math.max(insets.top, spacing.xs) + spacing.xs }]}>
        <View style={styles.headerLeftCol}>
          <Text style={styles.screenHeaderTitle}>Lista de Entregas</Text>
          <Pressable
            style={styles.listSelectorPill}
            onPress={() => setShowListsModal(true)}
            hitSlop={6}
          >
            <ListOrdered size={13} color={colors.primary} />
            <Text style={styles.listSelectorPillText} numberOfLines={1}>
              {activeList ? activeList.name : 'Todas as Listas'}
            </Text>
            <ChevronDown size={13} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.headerRightRow}>
          <Pressable
            style={[styles.headerAddBtn, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => shareDeliveryReport(activeList?.name || 'Lista de Entregas', all)}
            hitSlop={6}
          >
            <Share2 size={14} color={colors.primary} />
            <Text style={[styles.headerAddBtnText, { color: colors.primary }]}>Relatório</Text>
          </Pressable>

          <Pressable style={styles.headerAddBtn} onPress={() => setShowAddModal(true)}>
            <Plus size={15} color="#FFFFFF" />
            <Text style={styles.headerAddBtnText}>Parada</Text>
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      <Animated.View style={[styles.searchBar, { opacity: searchAnim }]}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar destino, bairro, pedido…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <X size={16} color={colors.textMuted} />
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
          const count =
            tab.key === 'all'
              ? all.length
              : tab.key === 'no_location'
              ? all.filter((d) => d.latitude === null || d.status === 'invalid_coords').length
              : all.filter((d) => d.status === tab.key).length;
          const isActive = activeFilter === tab.key;
          const TabIcon = tab.Icon;
          const iconColor = isActive ? colors.primary : colors.textMuted;

          return (
            <Pressable
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveFilter(tab.key)}
            >
              <TabIcon size={14} color={iconColor} />
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
            <Package size={48} color={colors.textDisabled} />
            <Text style={styles.emptyText}>
              {all.length === 0
                ? 'Nenhuma entrega importada.\nToque em Importar Planilha no menu.'
                : 'Nenhuma entrega encontrada com os filtros atuais.'}
            </Text>
          </View>
        }
      />

      {/* Fail reason modal */}
      {failModalId !== null && (
        <FailModal
          delivery={all.find((d) => d.id === failModalId)!}
          onSelect={(r) => handleFailDelivery(all.find((d) => d.id === failModalId)!, r)}
          onClose={() => setFailModalId(null)}
        />
      )}

      {/* Add Delivery Modal */}
      <AddDeliveryModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={reload}
      />

      {/* Delivery Lists Modal */}
      <DeliveryListsModal
        visible={showListsModal}
        onClose={() => setShowListsModal(false)}
        onListChanged={(newList) => {
          setActiveList(newList);
          reload();
        }}
      />
    </View>
  );
}

function DeliveryCard({
  item,
  onMapPress,
  onComplete,
  onFail,
  onWhatsApp,
  onWaze,
  onCall,
}: {
  item: DeliveryEntity;
  onMapPress: () => void;
  onComplete: () => void;
  onFail: () => void;
  onWhatsApp: () => void;
  onWaze: () => void;
  onCall: () => void;
}) {
  const { colors } = useTheme();
  const cardStyles = React.useMemo(() => createCardStyles(colors), [colors]);
  const cfg = statusConfig[item.status] || statusConfig.pending;
  const located = item.latitude !== null && item.longitude !== null;
  const orderNum = item.ordem ?? item.sequence;

  return (
    <View style={[cardStyles.card, { borderLeftColor: cfg.color, borderLeftWidth: 4 }]}>
      {/* Header */}
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          {orderNum !== null && orderNum !== undefined && (
            <View style={[cardStyles.seqBadge, { backgroundColor: cfg.color }]}>
              <Text style={cardStyles.seqText}>{orderNum}</Text>
            </View>
          )}
          <Text style={cardStyles.name} numberOfLines={1}>
            {item.destination}
          </Text>
        </View>
        <View style={[cardStyles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[cardStyles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Location / Bairro / Cidade */}
      {(item.bairro || item.city) && (
        <Text style={cardStyles.bairroText}>
          {[item.bairro, item.city].filter(Boolean).join(' · ')}
        </Text>
      )}

      {/* Coordenadas */}
      {located ? (
        <Text style={cardStyles.coordsText}>
          Lat: {item.latitude} | Lon: {item.longitude}
        </Text>
      ) : (
        <Text style={[cardStyles.coordsText, { color: colors.danger }]}>
          Coordenadas não informadas ou inválidas
        </Text>
      )}

      {/* Meta Row */}
      <View style={cardStyles.metaRow}>
        {item.pedido ? (
          <View style={cardStyles.metaChip}>
            <Text style={cardStyles.metaChipText}>Pedido: {item.pedido}</Text>
          </View>
        ) : null}
        {item.zipCode ? (
          <View style={cardStyles.metaChip}>
            <Text style={cardStyles.metaChipText}>CEP: {item.zipCode}</Text>
          </View>
        ) : null}
        {item.telefone ? (
          <View style={cardStyles.metaChip}>
            <Text style={cardStyles.metaChipText}>Tel: {item.telefone}</Text>
          </View>
        ) : null}
      </View>

      {/* Notes */}
      {item.notes ? <Text style={cardStyles.notes}>Obs: {item.notes}</Text> : null}

      {/* Action Buttons */}
      <View style={cardStyles.actions}>
        {item.telefone ? (
          <>
            <QuickBtn Icon={MessageSquare} label="WhatsApp" color={colors.success} onPress={onWhatsApp} />
            <QuickBtn Icon={Phone} label="Ligar" color={colors.primary} onPress={onCall} />
          </>
        ) : null}
        {located && <QuickBtn Icon={Navigation} label="Waze" color={colors.warning} onPress={onWaze} />}
        <QuickBtn Icon={MapPin} label="Mapa" color={colors.info} onPress={onMapPress} />
        {item.status !== 'completed' && item.status !== 'failed' && (
          <>
            <QuickBtn Icon={Check} label="Concluir" color={colors.success} onPress={onComplete} />
            <QuickBtn Icon={X} label="Insucesso" color={colors.danger} onPress={onFail} />
          </>
        )}
      </View>
    </View>
  );
}

function QuickBtn({
  Icon,
  label,
  color,
  onPress,
}: {
  Icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  color: string;
  onPress: () => void;
}) {
  const quickBtnStyles = React.useMemo(() => createQuickBtnStyles(), []);
  return (
    <Pressable
      style={({ pressed }) => [
        quickBtnStyles.btn,
        { backgroundColor: color + '18', borderColor: color + '44' },
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
    >
      <Icon size={14} color={color} />
      <Text style={[quickBtnStyles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const FAIL_REASONS: { key: FailReason; label: string }[] = [
  { key: 'absent', label: 'Ausente / Não atendeu' },
  { key: 'refused', label: 'Recusou a entrega' },
  { key: 'wrong_address', label: 'Endereço errado' },
  { key: 'no_access', label: 'Sem acesso ao local' },
  { key: 'other', label: 'Outro motivo' },
];

function FailModal({
  delivery,
  onSelect,
  onClose,
}: {
  delivery: DeliveryEntity;
  onSelect: (r: FailReason) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const modalStyles = React.useMemo(() => createModalStyles(colors), [colors]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <View style={modalStyles.box}>
          <Text style={modalStyles.title}>Motivo do Insucesso</Text>
          <Text style={modalStyles.sub}>{delivery?.destination}</Text>
          {FAIL_REASONS.map((r) => (
            <Pressable key={r.key} style={modalStyles.option} onPress={() => onSelect(r.key)}>
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

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    screenHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs,
    },
    headerLeftCol: {
      flex: 1,
      gap: 2,
    },
    screenHeaderTitle: {
      ...typography.displayMedium,
      color: colors.primary,
      fontSize: 22,
    },
    listSelectorPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
      marginTop: 2,
    },
    listSelectorPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
      maxWidth: 180,
    },
    headerRightRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    headerAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 4,
      gap: 4,
      ...shadows.sm,
    },
    headerAddBtnText: {
      ...typography.caption,
      color: '#FFFFFF',
      fontWeight: '700',
    },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs + 2,
      height: 44,
    },
    searchInput: {
      flex: 1,
      ...typography.body,
      color: colors.text,
      paddingVertical: 0,
    },

    tabBar: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.xs,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 5,
    },
    tabActive: {
      backgroundColor: colors.primaryGhost,
      borderColor: colors.primary,
    },
    tabText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
    tabTextActive: { color: colors.primary, fontWeight: '700' },
    tabCount: {
      backgroundColor: colors.border,
      borderRadius: radius.full,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    tabCountActive: { backgroundColor: colors.primary },
    tabCountText: { ...typography.label, fontSize: 10, color: colors.textMuted },
    tabCountTextActive: { color: '#fff' },

    listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
    emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
    emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  });

const createCardStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
    seqBadge: {
      borderRadius: radius.full,
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    seqText: { ...typography.label, fontSize: 11, color: '#fff', fontWeight: '800' },
    name: { ...typography.bodyMedium, fontWeight: '700', color: colors.text, flex: 1 },
    statusBadge: {
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    statusLabel: { ...typography.label, fontSize: 11, fontWeight: '700' },
    bairroText: { ...typography.bodySmall, color: colors.textMuted },
    coordsText: { ...typography.caption, color: colors.textMuted, fontSize: 11 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
    metaChip: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metaChipText: { ...typography.caption, fontSize: 11, color: colors.textMuted },
    notes: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  });

const createQuickBtnStyles = () =>
  StyleSheet.create({
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      gap: 4,
    },
    label: { ...typography.label, fontSize: 11, fontWeight: '700' },
  });

const createModalStyles = (colors: any) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    box: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, width: '100%', gap: spacing.sm, ...shadows.xl },
    title: { ...typography.title, color: colors.text },
    sub: { ...typography.caption, color: colors.textMuted },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
    cancel: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
    cancelText: { ...typography.bodyMedium, color: colors.textMuted },
  });
