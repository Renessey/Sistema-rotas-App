import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { LocationService } from '../../services/gps/LocationService';
import { DatabaseService } from '../../storage/DatabaseService';
import { ValhallaService } from '../../services/routing/ValhallaService';
import { colors, spacing, radius } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [deliveryCount, setDeliveryCount] = useState(0);
  const [locatedCount, setLocatedCount] = useState(0);
  const [locationText, setLocationText] = useState('Verificando localização…');
  const [offlineStatus, setOfflineStatus] = useState('');

  const refreshCounts = useCallback(() => {
    const deliveries = DatabaseService.getAllDeliveries();
    setDeliveryCount(deliveries.length);
    setLocatedCount(
      deliveries.filter(
        (d) => d.latitude !== null && d.longitude !== null,
      ).length,
    );
  }, []);

  const checkLocation = useCallback(async () => {
    const permission = await LocationService.requestPermission();
    if (permission === 'denied' || permission === 'blocked') {
      setLocationText('Permissão de localização negada');
      return;
    }
    try {
      const pos = await LocationService.getCurrentPosition();
      setLocationText(
        `📍 ${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)} (±${Math.round(
          pos.accuracy ?? 0,
        )}m)`,
      );
    } catch (error) {
      setLocationText('GPS indisponível — verifique se está ligado');
    }
  }, []);

  const checkOffline = useCallback(async () => {
    const ready = await ValhallaService.tilesReady();
    setOfflineStatus(
      ready.installed
        ? 'Valhalla offline: pronto'
        : 'Valhalla offline: dados ainda não instalados',
    );
  }, []);

  React.useEffect(() => {
    refreshCounts();
    checkLocation();
    checkOffline();
  }, [refreshCounts, checkLocation, checkOffline]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>ROTASIMPLES</Text>

      <Pressable style={styles.locationCard} onPress={checkLocation}>
        <Text style={styles.locationText}>{locationText}</Text>
      </Pressable>

      <Text style={styles.offlineText}>{offlineStatus}</Text>

      <Pressable
        style={styles.primaryButton}
        onPress={() => navigation.navigate('Import')}
      >
        <Text style={styles.primaryButtonText}>📄 IMPORTAR PLANILHA</Text>
      </Pressable>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{deliveryCount}</Text>
          <Text style={styles.statLabel}>Entregas</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{locatedCount}</Text>
          <Text style={styles.statLabel}>Localizadas</Text>
        </View>
      </View>

      <Pressable
        style={[styles.secondaryButton, deliveryCount === 0 && styles.disabled]}
        disabled={deliveryCount === 0}
        onPress={() => navigation.navigate('Deliveries')}
      >
        <Text style={styles.secondaryButtonText}>📋 VER LISTA</Text>
      </Pressable>

      <Pressable
        style={[styles.primaryButton, deliveryCount === 0 && styles.disabled]}
        disabled={deliveryCount === 0}
        onPress={() => navigation.navigate('Map')}
      >
        <Text style={styles.primaryButtonText}>🗺️ VER NO MAPA</Text>
      </Pressable>

      <Pressable
        style={[styles.primaryButton, { backgroundColor: colors.success }, deliveryCount === 0 && styles.disabled]}
        disabled={deliveryCount === 0}
        onPress={() => navigation.navigate('Map')}
      >
        <Text style={styles.primaryButtonText}>⚡ OTIMIZAR ROTA</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  locationCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationText: { fontSize: 15, color: colors.text },
  offlineText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 13, color: colors.textMuted },
});
