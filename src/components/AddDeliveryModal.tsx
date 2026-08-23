import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ValhallaService } from '../services/routing/ValhallaService';
import { DatabaseService } from '../storage/DatabaseService';
import { parseCoordinatePair } from '../utils/coordinateParser';
import { colors, spacing, radius, shadows, typography } from '../theme';
import type { DeliveryEntity } from '../types/geo';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  destination: string;
  bairro: string;
  city: string;
  zipCode: string;
  latitude: string;
  longitude: string;
  pedido: string;
  telefone: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  destination: '',
  bairro: '',
  city: 'Maricá',
  zipCode: '',
  latitude: '',
  longitude: '',
  pedido: '',
  telefone: '',
  notes: '',
});

export function AddDeliveryModal({ visible, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(false);

  const update = (field: keyof FormState) => (val: string) => {
    setForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSave = useCallback(async () => {
    if (!form.destination.trim()) {
      Alert.alert('Atenção', 'Informe o destino ou cliente da entrega.');
      return;
    }

    // Se informou coordenadas, valida matematicamente
    let lat: number | null = null;
    let lon: number | null = null;
    let rawLat: string | null = null;
    let rawLon: string | null = null;

    if (form.latitude.trim() || form.longitude.trim()) {
      const coordResult = parseCoordinatePair(form.latitude, form.longitude);
      if (!coordResult.isValid) {
        Alert.alert(
          'Coordenadas Inválidas',
          coordResult.errorReason ||
            'Por favor, informe Latitude válida entre [-90, 90] e Longitude entre [-180, 180].',
        );
        return;
      }
      lat = coordResult.latitude;
      lon = coordResult.longitude;
      rawLat = coordResult.rawLatitude;
      rawLon = coordResult.rawLongitude;
    }

    setLoading(true);
    try {
      const delivery: Omit<DeliveryEntity, 'id'> = {
        destination: form.destination.trim(),
        bairro: form.bairro.trim(),
        city: form.city.trim(),
        zipCode: form.zipCode.trim(),
        latitude: lat,
        longitude: lon,
        rawLatitude: rawLat,
        rawLongitude: rawLon,
        pedido: form.pedido.trim() || null,
        telefone: form.telefone.trim() || null,
        status: lat !== null && lon !== null ? 'pending' : 'invalid_coords',
        ordem: null,
        distancia: null,
        tempoEstimado: null,
        failReason: null,
        notes: form.notes.trim() || null,
        deliveredAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: form.destination.trim(),
        address: [form.destination.trim(), form.bairro.trim(), form.city.trim()]
          .filter(Boolean)
          .join(' - '),
        phone: form.telefone.trim(),
        orderCode: form.pedido.trim(),
      };

      DatabaseService.insertDelivery(delivery);
      setForm(emptyForm());
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }, [form, onSaved, onClose]);

  const handleClose = () => {
    setForm(emptyForm());
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>➕ Nova Entrega Offline</Text>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <Field
              label="Destino / Cliente / Endereço *"
              value={form.destination}
              onChangeText={update('destination')}
              placeholder="Ex: Rua das Flores, 123 ou Mercado Central"
            />

            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Latitude *"
                  value={form.latitude}
                  onChangeText={update('latitude')}
                  placeholder="Ex: -22.9358472"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Longitude *"
                  value={form.longitude}
                  onChangeText={update('longitude')}
                  placeholder="Ex: -42.8181234"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Bairro"
                  value={form.bairro}
                  onChangeText={update('bairro')}
                  placeholder="Ex: Inoã, Itaipuaçu"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Cidade"
                  value={form.city}
                  onChangeText={update('city')}
                  placeholder="Ex: Maricá"
                />
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Field
                  label="CEP / Postal Code"
                  value={form.zipCode}
                  onChangeText={update('zipCode')}
                  placeholder="24900-000"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Código do Pedido"
                  value={form.pedido}
                  onChangeText={update('pedido')}
                  placeholder="PED-1234"
                />
              </View>
            </View>

            <Field
              label="Telefone / WhatsApp"
              value={form.telefone}
              onChangeText={update('telefone')}
              placeholder="(21) 99999-9999"
              keyboardType="phone-pad"
            />

            <Field
              label="Observações"
              value={form.notes}
              onChangeText={update('notes')}
              placeholder="Instruções de entrega…"
              multiline
            />

            <Pressable
              style={[styles.saveBtn, loading && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>💾 Salvar Entrega</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <View style={fieldStyles.container}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, multiline && fieldStyles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    maxHeight: '92%',
    ...shadows.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { ...typography.title, color: colors.text },
  closeBtn: { padding: spacing.xs },
  closeBtnText: { fontSize: 18, color: colors.textMuted },

  form: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  twoCol: { flexDirection: 'row', gap: spacing.sm },

  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.colored(colors.primary),
  },
  saveBtnText: { color: '#fff', ...typography.titleSmall, fontWeight: '700' },
});

const fieldStyles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { ...typography.label, color: colors.textMuted },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMulti: { minHeight: 70, textAlignVertical: 'top', paddingTop: spacing.sm },
});
