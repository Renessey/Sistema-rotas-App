import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows, typography } from '../../theme';
import { BottomNavBar } from '../../components/Navigation/BottomNavBar';
import { MapStyleService } from '../../services/map/MapStyleService';
import { DatabaseService } from '../../storage/DatabaseService';
import { ValhallaService } from '../../services/routing/ValhallaService';
import { MAP_TYPES, MAP_THEMES, MapType, MapTheme } from '../../config/mapStyles';
import type { Costing } from '../../types/geo';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const VEHICLES: { id: Costing; label: string; icon: string }[] = [
  { id: 'auto', label: 'Carro / Van', icon: '🚗' },
  { id: 'truck', label: 'Caminhão', icon: '🚛' },
  { id: 'motorcycle', label: 'Motocicleta', icon: '🏍️' },
  { id: 'bicycle', label: 'Bicicleta', icon: '🚲' },
];

export default function SettingsScreen({ navigation }: Props) {
  const { colors, theme, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [mapType, setMapType] = useState<MapType>('standard');
  const [mapTheme, setMapTheme] = useState<MapTheme>('classic');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [costingMode, setCostingMode] = useState<Costing>('auto');
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, failed: 0, located: 0 });
  const [offlineTiles, setOfflineTiles] = useState(false);

  const loadSettings = useCallback(async () => {
    const prefs = await MapStyleService.loadPreferences();
    setMapType(prefs.mapType);
    setMapTheme(prefs.mapTheme);
    setHideCompleted(prefs.hideCompleted);
    setCostingMode(prefs.costingMode);
    setStats(DatabaseService.getStats());

    const tiles = await ValhallaService.tilesReady();
    setOfflineTiles(tiles.installed);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleUpdateType = async (type: MapType) => {
    setMapType(type);
    await MapStyleService.setMapType(type);
  };

  const handleUpdateTheme = async (t: MapTheme) => {
    setMapTheme(t);
    await MapStyleService.setMapTheme(t);
  };

  const handleToggleHide = async (value: boolean) => {
    setHideCompleted(value);
    await MapStyleService.setHideCompleted(value);
  };

  const handleUpdateCosting = async (mode: Costing) => {
    setCostingMode(mode);
    await MapStyleService.setCostingMode(mode);
  };

  const handleClearDatabase = () => {
    Alert.alert(
      'Limpar Todas as Entregas?',
      'Esta ação apagará todas as entregas salvas e o histórico do banco de dados local.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Apagar',
          style: 'destructive',
          onPress: () => {
            DatabaseService.clearDeliveries();
            setStats(DatabaseService.getStats());
            Alert.alert('Sucesso', 'Base de entregas limpa com sucesso.');
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, spacing.md),
            paddingBottom: spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Configurações</Text>
            <Text style={styles.headerSubtitle}>Preferências gerais e do mapa</Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeIcon}>⚙️</Text>
          </View>
        </View>

        {/* 1. Tema do Aplicativo (Claro / Escuro) */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>APARÊNCIA DO APLICATIVO</Text>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>{theme === 'dark' ? '🌙' : '☀️'}</Text>
              <View>
                <Text style={styles.rowTitle}>Modo Escuro (Dark Mode)</Text>
                <Text style={styles.rowSub}>Interface com tema noturno</Text>
              </View>
            </View>
            <Switch
              value={theme === 'dark'}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* 2. Tipo e Estilo do Mapa */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>ESTILO PADRÃO DO MAPA</Text>

          <Text style={styles.subHeader}>Tipo de Camada</Text>
          <View style={styles.chipRow}>
            {MAP_TYPES.map((t) => (
              <Pressable
                key={t.id}
                style={[styles.chip, mapType === t.id && styles.chipActive]}
                onPress={() => handleUpdateType(t.id)}
              >
                <Text style={styles.chipIcon}>{t.icon}</Text>
                <Text style={[styles.chipText, mapType === t.id && styles.chipTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.subHeader, { marginTop: spacing.md }]}>Tema Visual do Mapa</Text>
          <View style={styles.themeGrid}>
            {MAP_THEMES.map((th) => (
              <Pressable
                key={th.id}
                style={[styles.themeBox, mapTheme === th.id && styles.themeBoxActive]}
                onPress={() => handleUpdateTheme(th.id)}
              >
                <Text style={styles.themeBoxIcon}>{th.icon}</Text>
                <Text style={[styles.themeBoxLabel, mapTheme === th.id && styles.themeBoxLabelActive]}>
                  {th.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 3. Modo de Roteamento / Veículo */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>ROTEAMENTO & VEÍCULO</Text>

          <Text style={styles.subHeader}>Veículo Principal</Text>
          <View style={styles.vehicleRow}>
            {VEHICLES.map((v) => (
              <Pressable
                key={v.id}
                style={[styles.vehicleBtn, costingMode === v.id && styles.vehicleBtnActive]}
                onPress={() => handleUpdateCosting(v.id)}
              >
                <Text style={styles.vehicleBtnIcon}>{v.icon}</Text>
                <Text
                  style={[
                    styles.vehicleBtnLabel,
                    costingMode === v.id && styles.vehicleBtnLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {v.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.rowBetween, { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🎯</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Ocultar paradas concluídas</Text>
                <Text style={styles.rowSub}>Não exibir markers de entregas finalizadas</Text>
              </View>
            </View>
            <Switch
              value={hideCompleted}
              onValueChange={handleToggleHide}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* 4. Diagnóstico de Conectividade */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>MOTOR DE ROTAS & MOTOR NATIVO</Text>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Motor Valhalla:</Text>
            <Text style={[styles.diagValue, { color: colors.success }]}>Online (OSM / Valhalla)</Text>
          </View>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Mapas Vetoriais:</Text>
            <Text style={[styles.diagValue, { color: colors.primary }]}>MapLibre Native 11.3</Text>
          </View>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Tiles Offline no Dispositivo:</Text>
            <Text style={[styles.diagValue, { color: offlineTiles ? colors.success : colors.textMuted }]}>
              {offlineTiles ? 'Instalado' : 'Não instalado (modo online)'}
            </Text>
          </View>
        </View>

        {/* 5. Gestão de Dados */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>DADOS & ARMAZENAMENTO</Text>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Total de entregas salvas:</Text>
            <Text style={styles.diagValueBold}>{stats.total}</Text>
          </View>

          <Pressable style={styles.dangerBtn} onPress={handleClearDatabase}>
            <Text style={styles.dangerBtnText}>🗑️ Limpar Banco de Entregas</Text>
          </Pressable>
        </View>

        {/* Informações da Versão */}
        <View style={styles.footerInfo}>
          <Text style={styles.footerText}>RotaSimples v0.0.1 (Build 1)</Text>
          <Text style={styles.footerSubText}>Módulo de Rotas, Mapas e Otimização</Text>
        </View>
      </ScrollView>

      {/* Barra de Navegação Inferior */}
      <BottomNavBar
        activeTab="Settings"
        onSelectTab={(tab) => {
          if (tab === 'Map') navigation.navigate('Map');
          else if (tab === 'Home') navigation.navigate('Home');
          else if (tab === 'Deliveries') navigation.navigate('Deliveries');
        }}
        pendingCount={stats.pending}
      />
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
    },
    headerTitle: {
      ...typography.displayMedium,
      color: colors.primary,
    },
    headerSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
    },
    headerBadge: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerBadgeIcon: {
      fontSize: 24,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
      ...shadows.sm,
    },
    sectionHeader: {
      ...typography.overline,
      color: colors.textMuted,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    subHeader: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
      marginTop: spacing.xs,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    rowIcon: {
      fontSize: 20,
    },
    rowTitle: {
      ...typography.bodyMedium,
      color: colors.text,
      fontWeight: '600',
    },
    rowSub: {
      ...typography.caption,
      color: colors.textMuted,
    },
    chipRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    chip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: 4,
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    chipIcon: {
      fontSize: 14,
    },
    chipText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    chipTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    themeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    themeBox: {
      flexBasis: '48%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.sm,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    themeBoxActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    themeBoxIcon: {
      fontSize: 16,
    },
    themeBoxLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    themeBoxLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    vehicleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    vehicleBtn: {
      flexBasis: '48%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.sm,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    vehicleBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
    },
    vehicleBtnIcon: {
      fontSize: 16,
    },
    vehicleBtnLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    vehicleBtnLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    diagRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 2,
    },
    diagLabel: {
      ...typography.caption,
      color: colors.textMuted,
    },
    diagValue: {
      ...typography.caption,
      fontWeight: '600',
    },
    diagValueBold: {
      ...typography.bodyMedium,
      fontWeight: '700',
      color: colors.text,
    },
    dangerBtn: {
      backgroundColor: colors.dangerGhost,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.danger + '33',
      marginTop: spacing.xs,
    },
    dangerBtnText: {
      ...typography.caption,
      color: colors.danger,
      fontWeight: '700',
    },
    footerInfo: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: 2,
    },
    footerText: {
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: '600',
    },
    footerSubText: {
      ...typography.overline,
      color: colors.textDisabled,
    },
  });
