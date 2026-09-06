import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Camera,
  MapPin,
  Calendar,
  User,
  Package,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { radius, shadows, spacing, typography } from '../../../theme';
import { useTheme } from '../../../theme/ThemeContext';
import type { DeliveredProofEntity } from '../../../types/geo';

interface DeliveryProofModalProps {
  visible: boolean;
  proof: DeliveredProofEntity | null;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function DeliveryProofModal({ visible, proof, onClose }: DeliveryProofModalProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [showOriginalData, setShowOriginalData] = useState(false);

  if (!visible || !proof) return null;

  const imageUri = proof.photoUri || (proof.photoBase64 ? `data:image/jpeg;base64,${proof.photoBase64}` : null);

  let originalDataObj: Record<string, any> | null = null;
  if (proof.originalData) {
    try {
      originalDataObj = JSON.parse(proof.originalData);
    } catch {
      originalDataObj = null;
    }
  }

  const formattedDate = proof.deliveredAt
    ? new Date(proof.deliveredAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Data não informada';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.iconWrap, { backgroundColor: '#10B98120' }]}>
                <Camera size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                  Encomenda Já Entregue Aqui
                </Text>
                <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                  Comprovante com foto para identificar a residência
                </Text>
              </View>
            </View>
            <Pressable style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]} onPress={onClose}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Foto da Entrega */}
            {imageUri ? (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: imageUri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
                <View style={styles.photoBadge}>
                  <Text style={styles.photoBadgeText}>FOTO DO LOCAL / FACHADA</Text>
                </View>
              </View>
            ) : (
              <View style={[styles.noPhotoContainer, { backgroundColor: colors.surfaceElevated }]}>
                <Camera size={36} color={colors.textMuted} />
                <Text style={[styles.noPhotoText, { color: colors.textMuted }]}>
                  Nenhuma foto registrada para este comprovante
                </Text>
              </View>
            )}

            {/* Informações da Entrega */}
            <View style={[styles.infoSection, { backgroundColor: colors.surfaceElevated }]}>
              <View style={styles.infoRow}>
                <MapPin size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Endereço:</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{proof.address}</Text>
                  {proof.bairro || proof.city ? (
                    <Text style={[styles.infoSubValue, { color: colors.textSecondary }]}>
                      {[proof.bairro, proof.city].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.infoRow}>
                <User size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Destinatário / Cliente:</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{proof.recipientName}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Calendar size={16} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Entregue em:</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{formattedDate}</Text>
                </View>
              </View>

              {proof.orderCode ? (
                <View style={styles.infoRow}>
                  <Package size={16} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Código do Pedido:</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{proof.orderCode}</Text>
                  </View>
                </View>
              ) : null}

              {proof.receiverPerson ? (
                <View style={styles.infoRow}>
                  <User size={16} color="#8B5CF6" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Quem Recebeu:</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{proof.receiverPerson}</Text>
                  </View>
                </View>
              ) : null}

              {proof.rgDocument ? (
                <View style={styles.infoRow}>
                  <FileText size={16} color="#6366F1" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Documento / RG:</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{proof.rgDocument}</Text>
                  </View>
                </View>
              ) : null}

              {proof.notes ? (
                <View style={styles.infoRow}>
                  <FileText size={16} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Observações:</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{proof.notes}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Accordion: Dados Originais da Planilha */}
            {originalDataObj && Object.keys(originalDataObj).length > 0 && (
              <View style={[styles.originalDataSection, { borderColor: colors.border }]}>
                <Pressable
                  style={styles.originalDataHeader}
                  onPress={() => setShowOriginalData((prev) => !prev)}
                >
                  <FileText size={16} color={colors.primary} />
                  <Text style={[styles.originalDataTitle, { color: colors.text }]}>
                    Dados completos da planilha utilizada
                  </Text>
                  {showOriginalData ? (
                    <ChevronUp size={16} color={colors.textMuted} />
                  ) : (
                    <ChevronDown size={16} color={colors.textMuted} />
                  )}
                </Pressable>

                {showOriginalData && (
                  <View style={styles.originalDataList}>
                    {Object.entries(originalDataObj).map(([key, value]) => {
                      if (value === null || value === undefined || value === '') return null;
                      return (
                        <View key={key} style={[styles.originalDataRow, { borderColor: colors.border }]}>
                          <Text style={[styles.originalDataKey, { color: colors.textMuted }]}>
                            {key}:
                          </Text>
                          <Text style={[styles.originalDataVal, { color: colors.text }]}>
                            {String(value)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer Action */}
          <Pressable
            style={[styles.closeFooterBtn, { backgroundColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={styles.closeFooterBtnText}>Entendi, Fechar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 10, 20, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: Math.min(SCREEN_WIDTH - 24, 460),
    maxHeight: '90%',
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadows.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginTop: spacing.sm,
  },
  photoContainer: {
    width: '100%',
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spacing.md,
    backgroundColor: '#000',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  photoBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  noPhotoContainer: {
    width: '100%',
    height: 120,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  noPhotoText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoSection: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 12,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  infoSubValue: {
    fontSize: 12,
    marginTop: 2,
  },
  originalDataSection: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  originalDataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
  },
  originalDataTitle: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  originalDataList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: 6,
  },
  originalDataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  originalDataKey: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  originalDataVal: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  closeFooterBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  closeFooterBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
