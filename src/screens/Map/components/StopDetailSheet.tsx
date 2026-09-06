import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  X,
  Navigation,
  MapPin,
  MessageSquare,
  Search,
  UserCheck,
  RotateCcw,
  Camera,
  CheckCircle2,
  Eye,
  RefreshCw,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationLauncher } from '../../../services/navigation/NavigationLauncher';
import { useTheme } from '../../../theme/ThemeContext';
import { createScreenStyles } from '../MapScreenStyles';
import { radius, shadows, spacing } from '../../../theme';
import { DatabaseService } from '../../../storage/DatabaseService';
import { CameraService } from '../../../services/camera/CameraService';
import { DeliveryProofModal } from './DeliveryProofModal';
import type { RouteStop, FailReason, DeliveredProofEntity } from '../../../types/geo';

const RECEIVER_CHIPS = ['Próprio', 'Portaria', 'Vizinho', 'Familiar'];

interface StopDetailSheetProps {
  activeStop: RouteStop;
  onClose: () => void;
  onComplete: (
    stop: RouteStop,
    receiver?: string,
    photo?: { uri: string; base64?: string },
  ) => void;
  onSkip: (stop: RouteStop, reason?: FailReason) => void;
  onRevert?: (stop: RouteStop) => void;
  onOpenAdjustPin?: (stop: RouteStop) => void;
}

export function StopDetailSheet({
  activeStop,
  onClose,
  onComplete,
  onSkip,
  onRevert,
  onOpenAdjustPin,
}: StopDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createScreenStyles(colors), [colors]);
  const statusStyles = React.useMemo(() => createStatusStyles(colors), [colors]);

  const [selectedReceiver, setSelectedReceiver] = useState('');
  const [previousProof, setPreviousProof] = useState<DeliveredProofEntity | null>(null);
  const [showProofModal, setShowProofModal] = useState(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);

  const isCompleted = activeStop.status === 'completed';
  const isFailed = activeStop.status === 'failed';
  const isDoneOrFailed = isCompleted || isFailed;

  useEffect(() => {
    try {
      const proof = DatabaseService.findLatestDeliveredProof(
        activeStop.address,
        activeStop.latitude,
        activeStop.longitude,
      );
      setPreviousProof(proof);
    } catch {
      setPreviousProof(null);
    }
  }, [activeStop]);

  /**
   * Atualiza a foto anterior no banco SQLite e exclui o arquivo da foto antiga do disco.
   */
  const handleUpdatePreviousProofPhoto = async (
    proof: DeliveredProofEntity,
    newPhoto: { uri: string; base64?: string },
  ) => {
    try {
      // 1. Remove arquivo antigo do armazenamento se houver
      if (proof.photoUri && proof.photoUri !== newPhoto.uri) {
        await CameraService.deletePhoto(proof.photoUri);
      }
      // 2. Atualiza no banco SQLite por ID
      DatabaseService.updateDeliveredProofPhoto(proof.id, newPhoto.uri, newPhoto.base64 ?? null);
      // 3. Atualiza no banco por endereço para sincronizar todo histórico daquele local
      DatabaseService.updatePhotoForAddress(
        activeStop.address,
        newPhoto.uri,
        newPhoto.base64 ?? null,
        activeStop.latitude,
        activeStop.longitude,
      );
      // 4. Atualiza estado local para refletir na interface
      setPreviousProof((prev) =>
        prev
          ? {
              ...prev,
              photoUri: newPhoto.uri,
              photoBase64: newPhoto.base64 ?? null,
            }
          : null,
      );
    } catch (e) {
      console.warn('[StopDetailSheet] Erro ao substituir foto anterior:', e);
    }
  };

  const handleCompletePress = async () => {
    const hasPreviousPhoto = Boolean(
      previousProof && (previousProof.photoUri || previousProof.photoBase64),
    );

    // Se já foi entregue anteriormente e possui foto, pergunta se quer atualizar a foto
    if (hasPreviousPhoto && previousProof) {
      Alert.alert(
        'Foto Anterior Encontrada',
        'Este local já possui uma foto registrada de uma entrega anterior. Deseja atualizar tirando uma nova foto ou manter a foto existente?',
        [
          {
            text: 'Manter Foto Anterior',
            onPress: () => {
              const existingPhoto = {
                uri: previousProof.photoUri || '',
                base64: previousProof.photoBase64 || undefined,
              };
              onComplete(activeStop, selectedReceiver || undefined, existingPhoto);
            },
          },
          {
            text: 'Atualizar Foto',
            onPress: async () => {
              try {
                setIsCapturingPhoto(true);
                const newPhoto = await CameraService.captureDeliveryPhoto();
                setIsCapturingPhoto(false);
                if (newPhoto) {
                  // Atualiza a foto anterior pela nova e remove a antiga do banco e do disco
                  await handleUpdatePreviousProofPhoto(previousProof, newPhoto);
                  onComplete(activeStop, selectedReceiver || undefined, newPhoto);
                } else {
                  // Se o usuário cancelou a câmera
                  Alert.alert(
                    'Foto não capturada',
                    'Deseja concluir a entrega mantendo a foto anterior?',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Sim, Manter Anterior',
                        onPress: () => {
                          const existingPhoto = {
                            uri: previousProof.photoUri || '',
                            base64: previousProof.photoBase64 || undefined,
                          };
                          onComplete(activeStop, selectedReceiver || undefined, existingPhoto);
                        },
                      },
                    ],
                  );
                }
              } catch (err) {
                console.warn('[StopDetailSheet] Erro ao atualizar foto:', err);
                setIsCapturingPhoto(false);
                onComplete(activeStop, selectedReceiver || undefined);
              }
            },
          },
          {
            text: 'Cancelar',
            style: 'cancel',
          },
        ],
      );
      return;
    }

    try {
      setIsCapturingPhoto(true);
      // Abre a câmera para tirar foto do local/residência/pacote
      const photo = await CameraService.captureDeliveryPhoto();
      setIsCapturingPhoto(false);
      // Avança para conclusão e abertura do card de RG
      onComplete(activeStop, selectedReceiver || undefined, photo || undefined);
    } catch (err) {
      console.warn('[StopDetailSheet] Erro ao capturar foto:', err);
      setIsCapturingPhoto(false);
      onComplete(activeStop, selectedReceiver || undefined);
    }
  };

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
              {isCompleted ? ' · CONCLUÍDA' : ''}
              {isFailed ? ' · NÃO ENTREGUE' : ''}
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

        {/* ── Banner: Encomenda já entregue nesse local com botão "Ver" e "Atualizar" ── */}
        {previousProof && (
          <View
            style={{
              backgroundColor: '#10B98116',
              borderWidth: 1,
              borderColor: '#10B98150',
              borderRadius: 12,
              padding: 10,
              marginTop: 8,
              marginBottom: 4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <CheckCircle2 size={18} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#10B981' }}>
                  Encomenda já entregue nesse local
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                  {previousProof.deliveredAt
                    ? `Foto e dados de ${new Date(previousProof.deliveredAt).toLocaleDateString('pt-BR')}`
                    : 'Foto da residência disponível'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Pressable
                style={{
                  backgroundColor: '#10B981',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
                onPress={() => setShowProofModal(true)}
              >
                <Eye size={13} color="#FFFFFF" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>Ver</Text>
              </Pressable>

              <Pressable
                style={{
                  backgroundColor: '#059669',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
                onPress={async () => {
                  const newPhoto = await CameraService.captureDeliveryPhoto();
                  if (newPhoto) {
                    await handleUpdatePreviousProofPhoto(previousProof, newPhoto);
                    Alert.alert('Sucesso', 'Foto do local atualizada no banco com sucesso!');
                  }
                }}
              >
                <Camera size={13} color="#FFFFFF" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>Atualizar</Text>
              </Pressable>
            </View>
          </View>
        )}

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

        {/* Quick action navigation buttons */}
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

        {/* ── Status Actions: Marcar Entregue / Não Entregue / Recolocar na Rota ── */}
        {isDoneOrFailed ? (
          /* Cenário 1: Parada Já Concluída ou Insucesso (Foco em Recolocar na Rota) */
          <View style={statusStyles.container}>
            {/* Aviso de Status Atual */}
            <View
              style={[
                statusStyles.noticeBanner,
                {
                  backgroundColor: isCompleted ? '#10B98118' : '#EF444418',
                  borderColor: isCompleted ? '#10B98144' : '#EF444444',
                },
              ]}
            >
              {isCompleted ? (
                <CheckCircle2 size={16} color="#10B981" />
              ) : (
                <X size={16} color="#EF4444" />
              )}
              <Text
                style={[
                  statusStyles.noticeText,
                  { color: isCompleted ? '#10B981' : '#EF4444' },
                ]}
              >
                {isCompleted
                  ? 'Esta parada está marcada como CONCLUÍDA'
                  : 'Esta parada está marcada como NÃO ENTREGUE'}
              </Text>
            </View>

            {/* Botão Heroico Principal: Recolocar na Rota de Volta */}
            {onRevert && (
              <Pressable
                style={({ pressed }) => [
                  statusStyles.heroRevertBtn,
                  { backgroundColor: colors.primary },
                  pressed && statusStyles.btnPressed,
                ]}
                onPress={() => onRevert(activeStop)}
              >
                <View style={statusStyles.heroRevertIconWrap}>
                  <RotateCcw size={18} color="#FFFFFF" strokeWidth={2.6} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={statusStyles.heroRevertTitle}>
                    Recolocar Entrega na Rota de Volta
                  </Text>
                  <Text style={statusStyles.heroRevertSub}>
                    Restaura status para pendente e reotimiza o trajeto
                  </Text>
                </View>
              </Pressable>
            )}

            {/* Ações Secundárias (Tirar Nova Foto / Alterar Baixa) */}
            <View style={statusStyles.secondaryRow}>
              <Pressable
                style={({ pressed }) => [
                  statusStyles.secondaryBtn,
                  {
                    borderColor: isCompleted ? colors.border : colors.success,
                  },
                  pressed && statusStyles.btnPressed,
                ]}
                onPress={handleCompletePress}
                disabled={isCapturingPhoto}
              >
                {isCapturingPhoto ? (
                  <ActivityIndicator size="small" color={colors.success} />
                ) : (
                  <Camera size={15} color={isCompleted ? colors.primary : colors.success} />
                )}
                <Text
                  style={[
                    statusStyles.secondaryBtnText,
                    { color: isCompleted ? colors.primary : colors.success },
                  ]}
                >
                  {isCompleted ? 'Tirar Nova Foto' : 'Marcar Entregue'}
                </Text>
              </Pressable>

              {!isFailed && (
                <Pressable
                  style={({ pressed }) => [
                    statusStyles.secondaryBtn,
                    { borderColor: colors.danger },
                    pressed && statusStyles.btnPressed,
                  ]}
                  onPress={() => onSkip(activeStop, 'absent')}
                >
                  <X size={15} color={colors.danger} strokeWidth={2.4} />
                  <Text style={[statusStyles.secondaryBtnText, { color: colors.danger }]}>
                    Marcar Não Entregue
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          /* Cenário 2: Parada Pendente na Rota Ativa (Layout Equilibrado e Harmônico) */
          <View style={statusStyles.container}>
            {/* Linha 1: 2 Botões de Decisão (Entregue com Câmera vs Não Entregue) */}
            <View style={statusStyles.primaryRow}>
              {/* Botão Marcar como Entregue (com Câmera) */}
              <Pressable
                style={({ pressed }) => [
                  statusStyles.completeBtn,
                  {
                    backgroundColor: colors.success,
                    opacity: isCapturingPhoto ? 0.75 : 1,
                  },
                  pressed && statusStyles.btnPressed,
                ]}
                onPress={handleCompletePress}
                disabled={isCapturingPhoto}
              >
                <View style={statusStyles.completeIconBadge}>
                  {isCapturingPhoto ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Camera size={18} color="#FFFFFF" strokeWidth={2.2} />
                  )}
                </View>
                <View style={statusStyles.completeTextWrap}>
                  <Text style={statusStyles.completeTitle} numberOfLines={1}>
                    {activeStop.totalCount > 1
                      ? `Concluir (${activeStop.totalCount})`
                      : 'Marcar Entregue'}
                  </Text>
                  <Text style={statusStyles.completeSub} numberOfLines={1}>
                    Foto + Baixa rápida
                  </Text>
                </View>
              </Pressable>

              {/* Botão Não Entregue */}
              <Pressable
                style={({ pressed }) => [
                  statusStyles.failBtn,
                  { backgroundColor: colors.danger },
                  pressed && statusStyles.btnPressed,
                ]}
                onPress={() => onSkip(activeStop, 'absent')}
              >
                <View style={statusStyles.failIconBadge}>
                  <X size={18} color="#FFFFFF" strokeWidth={2.6} />
                </View>
                <View style={statusStyles.failTextWrap}>
                  <Text style={statusStyles.failTitle} numberOfLines={1}>
                    Não Entregue
                  </Text>
                  <Text style={statusStyles.failSub} numberOfLines={1}>
                    Ausente / Insucesso
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* Linha 2: Botão Elegante para Recolocar Parada na Rota */}
            {onRevert && (
              <Pressable
                style={({ pressed }) => [
                  statusStyles.revertRowBtn,
                  pressed && statusStyles.btnPressed,
                ]}
                onPress={() => onRevert(activeStop)}
              >
                <View style={statusStyles.revertRowIconWrap}>
                  <RotateCcw size={15} color={colors.primary} strokeWidth={2.4} />
                </View>
                <Text style={statusStyles.revertRowText}>
                  Recolocar Parada na Rota de Volta
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Modal para ver a foto e detalhes da entrega anterior */}
      <DeliveryProofModal
        visible={showProofModal}
        proof={previousProof}
        onClose={() => setShowProofModal(false)}
        onUpdatePhoto={(newPhoto) => {
          setPreviousProof((prev) =>
            prev
              ? {
                  ...prev,
                  photoUri: newPhoto.uri,
                  photoBase64: newPhoto.base64 ?? null,
                }
              : null,
          );
        }}
      />
    </View>
  );
}

function createStatusStyles(colors: any) {
  return StyleSheet.create({
    container: {
      marginTop: 8,
      gap: 8,
    },
    // Linha 1 para paradas ativas: 2 colunas equilibradas lado a lado
    primaryRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    completeBtn: {
      flex: 1.18,
      height: 54,
      borderRadius: radius.lg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      gap: 10,
      ...shadows.md,
    },
    completeIconBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    completeTextWrap: {
      flex: 1,
      justifyContent: 'center',
    },
    completeTitle: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    completeSub: {
      color: 'rgba(255, 255, 255, 0.88)',
      fontSize: 10,
      fontWeight: '600',
      marginTop: 2,
    },
    failBtn: {
      flex: 0.92,
      height: 54,
      borderRadius: radius.lg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      gap: 10,
      ...shadows.md,
    },
    failIconBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    failTextWrap: {
      flex: 1,
      justifyContent: 'center',
    },
    failTitle: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    failSub: {
      color: 'rgba(255, 255, 255, 0.88)',
      fontSize: 10,
      fontWeight: '600',
      marginTop: 2,
    },
    // Linha 2 para paradas ativas: barra horizontal de recuperação da rota
    revertRowBtn: {
      width: '100%',
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1.2,
      borderColor: 'rgba(59, 130, 246, 0.35)',
      backgroundColor: colors.surfaceElevated,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    revertRowIconWrap: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },
    revertRowText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.3,
    },
    // Estilos para quando a entrega já foi concluída ou falhou
    noticeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    noticeText: {
      fontSize: 12,
      fontWeight: '800',
      flex: 1,
    },
    heroRevertBtn: {
      width: '100%',
      height: 54,
      borderRadius: radius.lg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      gap: 12,
      ...shadows.md,
    },
    heroRevertIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroRevertTitle: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    heroRevertSub: {
      color: 'rgba(255, 255, 255, 0.9)',
      fontSize: 11,
      fontWeight: '500',
      marginTop: 2,
    },
    secondaryRow: {
      flexDirection: 'row',
      gap: 8,
    },
    secondaryBtn: {
      flex: 1,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 8,
      backgroundColor: colors.surfaceElevated,
    },
    secondaryBtnText: {
      fontSize: 12,
      fontWeight: '700',
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.985 }],
    },
  });
}
