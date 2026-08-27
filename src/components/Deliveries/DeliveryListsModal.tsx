import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import type { DeliveryListEntity } from '../../types/geo';
import { DatabaseService } from '../../storage/DatabaseService';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, shadows, typography } from '../../theme';
import {
  X,
  FolderOpen,
  ListOrdered,
  Check,
  Map,
  Pencil,
  Trash2,
  Calendar,
} from 'lucide-react-native';

interface DeliveryListsModalProps {
  visible: boolean;
  onClose: () => void;
  onListChanged: (activeList: DeliveryListEntity | null) => void;
}

export function DeliveryListsModal({
  visible,
  onClose,
  onListChanged,
}: DeliveryListsModalProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [lists, setLists] = useState<DeliveryListEntity[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const reloadLists = React.useCallback(() => {
    const all = DatabaseService.getAllLists();
    setLists(all);
  }, []);

  React.useEffect(() => {
    if (visible) {
      reloadLists();
      setEditingId(null);
    }
  }, [visible, reloadLists]);

  const handleSelectList = (list: DeliveryListEntity) => {
    DatabaseService.setActiveList(list.id);
    reloadLists();
    onListChanged(list);
    onClose();
  };

  const handleDeleteList = (list: DeliveryListEntity) => {
    Alert.alert(
      `Apagar ${list.name}?`,
      `Deseja realmente excluir "${list.name}" (${list.totalDeliveries} entregas) do banco de dados SQLite local? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Apagar do SQLite',
          style: 'destructive',
          onPress: () => {
            DatabaseService.deleteList(list.id);
            reloadLists();
            const active = DatabaseService.getActiveList();
            onListChanged(active);
          },
        },
      ],
    );
  };

  const handleStartRename = (list: DeliveryListEntity) => {
    setEditingId(list.id);
    setEditName(list.name);
  };

  const handleSaveRename = (listId: number) => {
    if (editName.trim()) {
      DatabaseService.renameList(listId, editName.trim());
      reloadLists();
      const active = DatabaseService.getActiveList();
      onListChanged(active);
    }
    setEditingId(null);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Minhas Listas de Entregas</Text>
              <Text style={styles.headerSubtitle}>
                {lists.length} {lists.length === 1 ? 'lista salva' : 'listas salvas'} no banco
              </Text>
            </View>

            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <X size={16} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Lists Scroll */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {lists.length === 0 ? (
              <View style={styles.emptyBox}>
                <FolderOpen size={48} color={colors.textDisabled} />
                <Text style={styles.emptyTitle}>Nenhuma lista salva</Text>
                <Text style={styles.emptySub}>
                  Importe uma planilha (.xlsx ou .csv) para criar a sua primeira lista de entregas.
                </Text>
              </View>
            ) : (
              lists.map((list) => {
                const isActive = list.isActive;
                const isEditing = editingId === list.id;
                const formattedDate = new Date(list.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <View
                    key={list.id}
                    style={[
                      styles.listCard,
                      isActive && styles.listCardActive,
                    ]}
                  >
                    {/* Top Row: Name + Badges */}
                    <View style={styles.cardTopRow}>
                      <Pressable
                        style={styles.cardHeaderArea}
                        onPress={() => handleSelectList(list)}
                      >
                        {isEditing ? (
                          <View style={styles.editRow}>
                            <TextInput
                              style={styles.editInput}
                              value={editName}
                              onChangeText={setEditName}
                              autoFocus
                              onSubmitEditing={() => handleSaveRename(list.id)}
                            />
                            <Pressable
                              style={styles.saveRenameBtn}
                              onPress={() => handleSaveRename(list.id)}
                            >
                              <Check size={14} color="#FFFFFF" />
                            </Pressable>
                          </View>
                        ) : (
                          <View style={styles.titleWithIcon}>
                            <ListOrdered size={18} color={colors.primary} />
                            <Text
                              style={[
                                styles.listName,
                                isActive && styles.listNameActive,
                              ]}
                              numberOfLines={1}
                            >
                              {list.name}
                            </Text>
                          </View>
                        )}
                      </Pressable>

                      {isActive && (
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>ATIVA NO MAPA</Text>
                        </View>
                      )}
                    </View>

                    {/* Meta info: Date & file */}
                    <View style={styles.dateRow}>
                      <Calendar size={12} color={colors.textMuted} />
                      <Text style={styles.dateText}>
                        Criada em {formattedDate}
                        {list.fileName ? ` · ${list.fileName}` : ''}
                      </Text>
                    </View>

                    {/* Stats pills */}
                    <View style={styles.statsRow}>
                      <View style={styles.statPill}>
                        <Text style={styles.statPillLabel}>Total:</Text>
                        <Text style={styles.statPillValue}>{list.totalDeliveries}</Text>
                      </View>

                      <View style={[styles.statPill, { backgroundColor: colors.successGhost }]}>
                        <Text style={[styles.statPillLabel, { color: colors.success }]}>Entregues:</Text>
                        <Text style={[styles.statPillValue, { color: colors.success }]}>
                          {list.completedDeliveries}
                        </Text>
                      </View>

                      <View style={[styles.statPill, { backgroundColor: colors.warningGhost }]}>
                        <Text style={[styles.statPillLabel, { color: colors.warning }]}>Pendentes:</Text>
                        <Text style={[styles.statPillValue, { color: colors.warning }]}>
                          {list.pendingDeliveries}
                        </Text>
                      </View>
                    </View>

                    {/* Actions Row */}
                    <View style={styles.actionsRow}>
                      {!isActive ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.selectBtn,
                            pressed && styles.btnPressed,
                          ]}
                          onPress={() => handleSelectList(list)}
                        >
                          <Map size={14} color={colors.primary} />
                          <Text style={styles.selectBtnText}>Carregar no Mapa</Text>
                        </Pressable>
                      ) : (
                        <View style={styles.loadedNotice}>
                          <Check size={14} color={colors.success} />
                          <Text style={styles.loadedNoticeText}>Em exibição</Text>
                        </View>
                      )}

                      <Pressable
                        style={({ pressed }) => [
                          styles.actionIconBtn,
                          pressed && styles.btnPressed,
                        ]}
                        onPress={() => handleStartRename(list)}
                        hitSlop={6}
                      >
                        <Pencil size={15} color={colors.textSecondary} />
                      </Pressable>

                      <Pressable
                        style={({ pressed }) => [
                          styles.actionIconBtn,
                          styles.deleteIconBtn,
                          pressed && styles.btnPressed,
                        ]}
                        onPress={() => handleDeleteList(list)}
                        hitSlop={6}
                      >
                        <Trash2 size={15} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}


const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      maxHeight: '88%',
      minHeight: '50%',
      paddingTop: spacing.xs + 2,
      paddingBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
      ...shadows.xl,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      backgroundColor: '#CBD5E1',
      borderRadius: radius.full,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      gap: 2,
      flex: 1,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      fontSize: 13,
      color: colors.textMuted,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    closeBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    emptyBox: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      gap: spacing.sm,
    },
    emptyIcon: {
      fontSize: 44,
    },
    emptyTitle: {
      ...typography.title,
      color: colors.text,
    },
    emptySub: {
      ...typography.bodySmall,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: spacing.xl,
      lineHeight: 20,
    },

    /* List Card */
    listCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: spacing.xs + 2,
      ...shadows.sm,
    },
    listCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceElevated,
      ...shadows.md,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    cardHeaderArea: {
      flex: 1,
    },
    titleWithIcon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
    },
    listIcon: {
      fontSize: 18,
    },
    listName: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
      flex: 1,
    },
    listNameActive: {
      color: colors.primary,
    },
    activeBadge: {
      backgroundColor: colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    activeBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    dateText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    statsRow: {
      flexDirection: 'row',
      gap: spacing.xs + 2,
      marginTop: 2,

    },
    statPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statPillLabel: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
    },
    statPillValue: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.text,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
      paddingTop: spacing.xs + 2,
      borderTopWidth: 1,
      borderTopColor: colors.border + '55',
    },
    selectBtn: {
      flex: 1,
      backgroundColor: colors.primaryGhost,
      borderRadius: radius.md,
      paddingVertical: spacing.xs + 4,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.primary + '44',
    },
    selectBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    loadedNotice: {
      flex: 1,
      paddingVertical: spacing.xs + 4,
      alignItems: 'center',
    },
    loadedNoticeText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.success,
    },
    actionIconBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    deleteIconBtn: {
      backgroundColor: colors.dangerGhost,
      borderColor: colors.danger + '33',
    },
    actionIcon: {
      fontSize: 15,
    },
    deleteIcon: {
      fontSize: 15,
    },
    btnPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.96 }],
    },

    editRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    editInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    saveRenameBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    saveRenameBtnText: {
      color: '#FFFFFF',
      fontWeight: '800',
    },
  });
