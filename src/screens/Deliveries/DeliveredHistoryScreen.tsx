import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation';
import { useTheme } from '../../theme/ThemeContext';
import { radius, shadows, spacing, typography } from '../../theme';
import { DatabaseService } from '../../storage/DatabaseService';
import { DeliveryProofModal } from '../Map/components/DeliveryProofModal';
import type { DeliveredProofEntity } from '../../types/geo';
import {
  ArrowLeft,
  Search,
  X,
  Camera,
  MapPin,
  Calendar,
  PackageCheck,
  User,
  Trash2,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Eye,
  Database,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveredHistory'>;

export default function DeliveredHistoryScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [searchQuery, setSearchQuery] = useState('');
  const [proofs, setProofs] = useState<DeliveredProofEntity[]>([]);
  const [selectedProof, setSelectedProof] = useState<DeliveredProofEntity | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [dbSizeMb, setDbSizeMb] = useState<string>('0');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback((query = searchQuery) => {
    setLoading(true);
    try {
      const results = DatabaseService.searchDeliveredHistory(query);
      setProofs(results);

      const sizeBytes = DatabaseService.getDatabaseSizeBytes();
      setDbSizeMb((sizeBytes / (1024 * 1024)).toFixed(1));
    } catch (e) {
      console.warn('[DeliveredHistoryScreen] Erro ao carregar dados:', e);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadData(searchQuery);
  }, [searchQuery, loadData]);

  const handleDeleteProof = (id: number) => {
    Alert.alert(
      'Excluir Comprovante?',
      'Esta entrega será removida do histórico de entregas concluídas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            DatabaseService.deleteDeliveredProof(id);
            loadData(searchQuery);
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: DeliveredProofEntity }) => {
    const isExpanded = expandedRowId === item.id;
    const imageUri = item.photoUri || (item.photoBase64 ? `data:image/jpeg;base64,${item.photoBase64}` : null);

    let originalDataObj: Record<string, any> | null = null;
    if (item.originalData) {
      try {
        originalDataObj = JSON.parse(item.originalData);
      } catch {
        originalDataObj = null;
      }
    }

    const formattedDate = item.deliveredAt
      ? new Date(item.deliveredAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    return (
      <View style={styles.card}>
        <View style={styles.cardMainRow}>
          {/* Miniatura da Foto com Badge */}
          <Pressable
            style={styles.thumbnailWrap}
            onPress={() => setSelectedProof(item)}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.thumbnail} />
            ) : (
              <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.surfaceElevated }]}>
                <Camera size={20} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.thumbBadge}>
              <Eye size={10} color="#FFFFFF" />
            </View>
          </Pressable>

          {/* Dados Principais */}
          <View style={styles.cardInfo}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.recipientName} numberOfLines={1}>
                {item.recipientName}
              </Text>
              <Pressable
                onPress={() => handleDeleteProof(item.id)}
                hitSlop={8}
                style={styles.deleteBtn}
              >
                <Trash2 size={15} color={colors.danger} />
              </Pressable>
            </View>

            <View style={styles.addressRow}>
              <MapPin size={13} color={colors.primary} />
              <Text style={styles.addressText} numberOfLines={2}>
                {item.address}
              </Text>
            </View>

            {item.bairro || item.city ? (
              <Text style={styles.bairroText} numberOfLines={1}>
                {[item.bairro, item.city].filter(Boolean).join(' · ')}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              <View style={styles.dateWrap}>
                <Calendar size={12} color="#10B981" />
                <Text style={styles.dateText}>{formattedDate}</Text>
              </View>
              {item.orderCode ? (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Ped: {item.orderCode}</Text>
                </View>
              ) : null}
            </View>

            {item.receiverPerson || item.rgDocument ? (
              <View style={styles.tagsRow}>
                {item.receiverPerson ? (
                  <View style={[styles.subPill, { backgroundColor: '#8B5CF620' }]}>
                    <User size={11} color="#8B5CF6" />
                    <Text style={[styles.subPillText, { color: '#8B5CF6' }]}>
                      {item.receiverPerson}
                    </Text>
                  </View>
                ) : null}
                {item.rgDocument ? (
                  <View style={[styles.subPill, { backgroundColor: '#6366F120' }]}>
                    <Text style={[styles.subPillText, { color: '#6366F1' }]}>
                      RG: {item.rgDocument}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Botão de Ver Todas as Colunas da Planilha Original */}
        {originalDataObj && Object.keys(originalDataObj).length > 0 && (
          <View style={styles.expandableSection}>
            <Pressable
              style={styles.expandToggleBtn}
              onPress={() => setExpandedRowId(isExpanded ? null : item.id)}
            >
              <FileSpreadsheet size={13} color={colors.primary} />
              <Text style={styles.expandToggleText}>
                {isExpanded ? 'Ocultar dados da planilha' : 'Ver todos os dados da planilha'}
              </Text>
              {isExpanded ? (
                <ChevronUp size={14} color={colors.textMuted} />
              ) : (
                <ChevronDown size={14} color={colors.textMuted} />
              )}
            </Pressable>

            {isExpanded && (
              <View style={styles.spreadSheetTable}>
                {Object.entries(originalDataObj).map(([key, val]) => {
                  if (val === null || val === undefined || val === '') return null;
                  return (
                    <View key={key} style={styles.tableRow}>
                      <Text style={styles.tableKey}>{key}:</Text>
                      <Text style={styles.tableVal}>{String(val)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Entregas Concluídas</Text>
          <Text style={styles.headerSub}>
            Histórico permanente com fotos e comprovantes
          </Text>
        </View>

        <View style={styles.countBadge}>
          <PackageCheck size={16} color="#10B981" />
          <Text style={styles.countBadgeText}>{proofs.length}</Text>
        </View>
      </View>

      {/* Barra de Pesquisa Superior */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBar}>
          <Search size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cliente, endereço, pedido ou RG..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Info Bar (Armazenamento SQLite & Shards) */}
      <View style={styles.storageBar}>
        <View style={styles.storageLeft}>
          <Database size={13} color={colors.primary} />
          <Text style={styles.storageText}>
            Armazenamento: {dbSizeMb} MB no banco local SQLite (limite 1 GB/arquivo)
          </Text>
        </View>
      </View>

      {/* Lista de Entregas */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando entregas...</Text>
        </View>
      ) : proofs.length === 0 ? (
        <View style={styles.centerBox}>
          <PackageCheck size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'Nenhuma entrega encontrada' : 'Nenhum comprovante salvo'}
          </Text>
          <Text style={styles.emptySub}>
            {searchQuery
              ? `Nenhum registro corresponde a "${searchQuery}".`
              : 'Ao concluir entregas com foto no mapa, elas aparecerão salvas aqui.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={proofs}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal de Detalhes e Foto em Tela Cheia */}
      <DeliveryProofModal
        visible={!!selectedProof}
        proof={selectedProof}
        onClose={() => setSelectedProof(null)}
      />
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
    },
    headerTitle: {
      ...typography.title,
      fontWeight: '800',
      color: colors.text,
    },
    headerSub: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    countBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: '#10B98118',
      borderWidth: 1,
      borderColor: '#10B98140',
    },
    countBadgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#10B981',
    },
    searchBarContainer: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      backgroundColor: colors.surface,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      height: 44,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      paddingVertical: 0,
    },
    storageBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    storageLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    storageText: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
    },
    listContent: {
      padding: spacing.md,
      gap: 12,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      ...shadows.sm,
    },
    cardMainRow: {
      flexDirection: 'row',
      gap: 12,
    },
    thumbnailWrap: {
      width: 72,
      height: 72,
      borderRadius: radius.md,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: '#000',
    },
    thumbnail: {
      width: '100%',
      height: '100%',
    },
    thumbnailPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbBadge: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderRadius: 4,
      padding: 3,
    },
    cardInfo: {
      flex: 1,
      justifyContent: 'space-between',
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    recipientName: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
      flex: 1,
      marginRight: 6,
    },
    deleteBtn: {
      padding: 4,
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 4,
      marginTop: 2,
    },
    addressText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
      flex: 1,
    },
    bairroText: {
      fontSize: 11,
      color: colors.textMuted,
      marginLeft: 17,
      marginTop: 1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    dateWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    dateText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#10B981',
    },
    pill: {
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    subPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    subPillText: {
      fontSize: 10,
      fontWeight: '800',
    },
    expandableSection: {
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
    },
    expandToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    expandToggleText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      flex: 1,
    },
    spreadSheetTable: {
      marginTop: 8,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: 8,
      gap: 4,
    },
    tableRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    tableKey: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
      flex: 1,
    },
    tableVal: {
      fontSize: 11,
      color: colors.text,
      fontWeight: '700',
      flex: 1,
      textAlign: 'right',
    },
    centerBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: 8,
    },
    loadingText: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 8,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
      marginTop: 8,
    },
    emptySub: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
}
