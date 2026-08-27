import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Alert,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadows, spacing, typography } from '../../theme';
import {
  FileText,
  X,
  RotateCw,
  Copy,
  Sparkles,
  Smartphone,
  Check,
} from 'lucide-react-native';

export interface QuickRgModalProps {
  visible: boolean;
  onClose: () => void;
}

function generateRandomRg(): string {
  const num = Math.floor(10000000 + Math.random() * 90000000);
  const digit = Math.floor(Math.random() * 10);
  return `${num}${digit}`;
}

export function QuickRgModal({ visible, onClose }: QuickRgModalProps) {
  const insets = useSafeAreaInsets();
  const [rg, setRg] = useState(generateRandomRg());
  const [copied, setCopied] = useState(false);
  const [bubbleActive, setBubbleActive] = useState(false);

  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRg(generateRandomRg());
      setCopied(false);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 65, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNewRg = () => {
    setRg(generateRandomRg());
    setCopied(false);
  };

  const handleToggleBubble = () => {
    setBubbleActive((prev) => !prev);
    Alert.alert(
      bubbleActive ? 'Bolha Desativada' : 'Bolha Flutuante Ativada',
      bubbleActive
        ? 'A bolha de cópia rápida foi ocultada.'
        : 'A bolha de cópia rápida está pronta para ser usada sobre os apps de entrega!',
    );
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          style={[
            styles.modalCard,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
              marginBottom: insets.bottom + 20,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <FileText size={20} color="#818CF8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>GERADOR DE RG RÁPIDO</Text>
                <Text style={styles.headerSubtitle}>Gere e copie o RG em 1 clique para dar baixa rápida</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <X size={16} color="#94A3B8" />
            </Pressable>
          </View>

          {/* RG Card */}
          <View style={styles.cardBox}>
            <View style={styles.cardBoxHeader}>
              <Text style={styles.cardBoxLabel}>REGISTRO GERAL (RG)</Text>
              <View style={styles.badgePill}>
                <Text style={styles.badgePillText}>SEM PONTUAÇÃO</Text>
              </View>
            </View>

            <Text style={styles.rgDisplay}>{rg}</Text>

            <View style={styles.rgActionsRow}>
              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
                onPress={handleNewRg}
              >
                <RotateCw size={15} color="#FFFFFF" />
                <Text style={styles.secondaryBtnText}>OUTRO</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryPurpleBtn,
                  copied && styles.primarySuccessBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleCopy}
              >
                {copied ? <Check size={16} color="#FFFFFF" /> : <Copy size={15} color="#FFFFFF" />}
                <Text style={styles.primaryBtnText}>{copied ? 'COPIADO!' : 'COPIAR RG'}</Text>
              </Pressable>
            </View>
          </View>

          {/* Floating Bubble Card */}
          <View style={styles.cardBox}>
            <View style={styles.cardBoxHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.sparkleWrap}>
                  <Sparkles size={16} color="#818CF8" />
                </View>
                <View>
                  <Text style={styles.bubbleTitle}>BOTÃO FLUTUANTE</Text>
                  <Text style={styles.bubbleSubtitle}>Copie com 1 toque por cima de outros apps</Text>
                </View>
              </View>
              <View style={[styles.statusDot, bubbleActive && styles.statusDotActive]} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryPurpleBtn,
                styles.bubbleBtn,
                bubbleActive && styles.bubbleBtnActive,
                pressed && styles.btnPressed,
              ]}
              onPress={handleToggleBubble}
            >
              <Text style={styles.bubbleBtnText}>
                {bubbleActive ? 'DESATIVAR BOLHA' : 'ATIVAR BOLHA FLUTUANTE'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Alert.alert(
                  'Como Funciona',
                  'Permita a sobreposição sobre outros apps nas configurações do Android para ter a bolha de cópia rápida ativa.',
                );
              }}
              style={styles.helpLink}
            >
              <Text style={styles.helpLinkText}>Como ativar a bolha flutuante</Text>
            </Pressable>
          </View>

          {/* How It Works Card */}
          <View style={styles.infoCard}>
            <Smartphone size={18} color="#818CF8" style={{ marginTop: 2 }} />
            <Text style={styles.infoText}>
              <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Como funciona: </Text>
              Ao ativar a bolha flutuante, ela fica acessível sobre qualquer aplicativo de entrega. Toque na bolha para copiar o RG direto e colar no comprovante sem precisar trocar de app!
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0F172A',
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    ...typography.caption,
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBox: {
    backgroundColor: '#1E293B',
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBoxLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  badgePill: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 0.4,
  },
  rgDisplay: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  rgActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    borderRadius: radius.md,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  primaryPurpleBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 12,
    borderRadius: radius.md,
    gap: 6,
    ...shadows.md,
  },
  primarySuccessBtn: {
    backgroundColor: '#10B981',
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  sparkleWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  bubbleSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#64748B',
  },
  statusDotActive: {
    backgroundColor: '#10B981',
  },
  bubbleBtn: {
    flex: undefined,
    width: '100%',
    marginTop: 4,
  },
  bubbleBtnActive: {
    backgroundColor: '#EF4444',
  },
  bubbleBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  helpLink: {
    alignSelf: 'center',
    marginTop: 2,
  },
  helpLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#818CF8',
    textDecorationLine: 'underline',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
