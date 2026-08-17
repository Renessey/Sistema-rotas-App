import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { DatabaseService } from '../../storage/DatabaseService';
import type { DeliveryEntity } from '../../types/geo';
import { colors, spacing, radius } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Deliveries'>;

const STATUS_COLORS: Record<string, string> = {
  pending: colors.textMuted,
  optimized: colors.primary,
  in_progress: colors.warning,
  completed: colors.success,
  failed: colors.danger,
};

export default function DeliveriesScreen({ navigation }: Props) {
  const [deliveries, setDeliveries] = useState<DeliveryEntity[]>([]);

  useFocusEffect(
    useCallback(() => {
      setDeliveries(DatabaseService.getAllDeliveries());
    }, []),
  );

  const renderItem = ({ item }: { item: DeliveryEntity }) => {
    const located = item.latitude !== null && item.longitude !== null;
    return (
      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('Map')}
      >
        <View style={styles.cardHeader}>
          {item.sequence !== null && (
            <View style={styles.sequenceBadge}>
              <Text style={styles.sequenceText}>{item.sequence + 1}</Text>
            </View>
          )}
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: STATUS_COLORS[item.status] + '22' },
            ]}
          >
            <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.address} numberOfLines={2}>
          {item.address}
          {item.number ? `, ${item.number}` : ''}
          {item.neighborhood ? ` — ${item.neighborhood}` : ''}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.meta}>
            {item.city}/{item.state} • CEP {item.cep || '—'}
          </Text>
          <Text style={styles.meta}>
            {located ? '📍 localizada' : '⚠️ sem coordenadas'}
          </Text>
        </View>

        {item.orderCode ? <Text style={styles.meta}>Pedido: {item.orderCode}</Text> : null}
        {item.phone ? <Text style={styles.meta}>📞 {item.phone}</Text> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={deliveries}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nenhuma entrega importada ainda. Vá em "Importar planilha".
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sequenceBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sequenceText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  statusBadge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '700' },
  address: { fontSize: 14, color: colors.text },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { fontSize: 12, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
