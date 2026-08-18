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
import { GeocodingService } from '../services/geocoding/GeocodingService';
import { DatabaseService } from '../storage/DatabaseService';
import { colors, spacing, radius, shadows, typography } from '../theme';
import type { DeliveryEntity } from '../types/geo';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  phone: string;
  orderCode: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  name: '', address: '', number: '', complement: '',
  neighborhood: '', city: '', state: 'RJ', cep: '',
  phone: '', orderCode: '', notes: '',
});

export function AddDeliveryModal({ visible, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<
    'idle' | 'searching' | 'found' | 'not_found'
  >('idle');
  const [coords, setCoords] = useState<{ lat: number; lon: number; provider: string } | null>(null);

  const update = (field: keyof FormState) => (val: string) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  /** Auto-preenche endereço pelo CEP usando ViaCEP */
  const handleCepBlur = useCallback(async () => {
    const cep = form.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json() as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          address:      data.logradouro ?? prev.address,
          neighborhood: data.bairro     ?? prev.neighborhood,
          city:         data.localidade ?? prev.city,
          state:        data.uf         ?? prev.state,
        }));
      }
    } catch {
      // ignore
    } finally {
      setCepLoading(false);
    }
  }, [form.cep]);

  /** Testa geocodificação do endereço preenchido */
  const handleTestGeocode = useCallback(async () => {
    setGeocodeStatus('searching');
    setCoords(null);
    const result = await GeocodingService.geocodeDelivery({
      address: form.address,
      number: form.number,
      neighborhood: form.neighborhood,
      city: form.city,
      state: form.state,
      cep: form.cep,
    });
    if (result) {
      setGeocodeStatus('found');
      setCoords({ lat: result.latitude, lon: result.longitude, provider: result.provider });
    } else {
      setGeocodeStatus('not_found');
    }
  }, [form]);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      Alert.alert('Atenção', 'Informe o nome do cliente.');
      return;
    }
    if (!form.address.trim()) {
      Alert.alert('Atenção', 'Informe o endereço.');
      return;
    }

    setLoading(true);
    try {
      let lat: number | null = coords?.lat ?? null;
      let lon: number | null = coords?.lon ?? null;
      let geoSource = coords?.provider ?? null;

      if (lat === null || lon === null) {
        const result = await GeocodingService.geocodeDelivery({
          address: form.address, number: form.number, neighborhood: form.neighborhood,
          city: form.city, state: form.state, cep: form.cep,
        });
        if (result) {
          lat = result.latitude;
          lon = result.longitude;
          geoSource = result.provider;
        }
      }

      const delivery: Omit<DeliveryEntity, 'id'> = {
        name: form.name.trim(),
        address: form.address.trim(),
        number: form.number.trim(),
        complement: form.complement.trim(),
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        cep: form.cep.trim(),
        phone: form.phone.trim(),
        orderCode: form.orderCode.trim(),
        latitude: lat,
        longitude: lon,
        snappedLatitude: lat,
        snappedLongitude: lon,
        geocodingStatus: lat !== null ? 'success' : 'failed',
        geocodingSource: geoSource,
        routingStatus: 'pending',
        sequence: null,
        distance: null,
        duration: null,
        status: 'pending',
        failReason: null,
        notes: form.notes.trim() || null,
        deliveredAt: null,
        createdAt: Date.now(),
      };

      DatabaseService.insertDelivery(delivery);
      setForm(emptyForm());
      setCoords(null);
      setGeocodeStatus('idle');
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }, [form, coords, onSaved, onClose]);

  const handleClose = () => {
    setForm(emptyForm());
    setCoords(null);
    setGeocodeStatus('idle');
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
            <Text style={styles.title}>➕ Nova Entrega</Text>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
            <Field label="Nome do Cliente *" value={form.name} onChangeText={update('name')} placeholder="Ex: João da Silva" />
            <Field label="Código do Pedido" value={form.orderCode} onChangeText={update('orderCode')} placeholder="Ex: PED-1234" />

            <View style={styles.cepRow}>
              <View style={{ flex: 1 }}>
                <Field
                  label="CEP *"
                  value={form.cep}
                  onChangeText={update('cep')}
                  placeholder="00000-000"
                  keyboardType="numeric"
                  onBlur={handleCepBlur}
                />
              </View>
              {cepLoading && <ActivityIndicator color={colors.primary} style={styles.cepSpinner} />}
            </View>

            <Field label="Endereço (Rua/Avenida) *" value={form.address} onChangeText={update('address')} placeholder="Ex: Rua das Flores" />

            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Field label="Número" value={form.number} onChangeText={update('number')} placeholder="Ex: 123" keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Complemento" value={form.complement} onChangeText={update('complement')} placeholder="Apto, Sala…" />
              </View>
            </View>

            <Field label="Bairro" value={form.neighborhood} onChangeText={update('neighborhood')} placeholder="Ex: Centro" />

            <View style={styles.twoCol}>
              <View style={{ flex: 2 }}>
                <Field label="Cidade" value={form.city} onChangeText={update('city')} placeholder="Ex: Maricá" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="UF" value={form.state} onChangeText={update('state')} placeholder="RJ" maxLength={2} autoCapitalize="characters" />
              </View>
            </View>

            <Field label="Telefone / WhatsApp" value={form.phone} onChangeText={update('phone')} placeholder="Ex: (21) 99999-9999" keyboardType="phone-pad" />
            <Field label="Observações" value={form.notes} onChangeText={update('notes')} placeholder="Instruções especiais de entrega…" multiline />

            {/* Geocode test */}
            <Pressable
              style={[styles.geocodeBtn, geocodeStatus === 'searching' && { opacity: 0.7 }]}
              onPress={handleTestGeocode}
              disabled={geocodeStatus === 'searching'}
            >
              {geocodeStatus === 'searching' ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={styles.geocodeBtnText}>🔍 Verificar Localização</Text>
              )}
            </Pressable>

            {geocodeStatus === 'found' && coords && (
              <View style={styles.geoSuccess}>
                <Text style={styles.geoSuccessText}>
                  ✅ Localizado via <Text style={{ fontWeight: '700' }}>{coords.provider}</Text>
                  {'\n'}
                  📍 {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
                </Text>
              </View>
            )}
            {geocodeStatus === 'not_found' && (
              <View style={styles.geoFail}>
                <Text style={styles.geoFailText}>
                  ⚠️ Endereço não localizado automaticamente.{'\n'}
                  Você pode ajustar o pino manualmente no mapa após salvar.
                </Text>
              </View>
            )}

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
  label, value, onChangeText, placeholder, keyboardType, onBlur, multiline, maxLength, autoCapitalize,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; onBlur?: () => void;
  multiline?: boolean; maxLength?: number; autoCapitalize?: any;
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
        onBlur={onBlur}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize ?? 'sentences'}
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
    alignSelf: 'center', width: 40, height: 4,
    backgroundColor: colors.border, borderRadius: radius.full, marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { ...typography.title, color: colors.text },
  closeBtn: { padding: spacing.xs },
  closeBtnText: { fontSize: 18, color: colors.textMuted },

  form: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  cepRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  cepSpinner: { marginBottom: spacing.md },
  twoCol: { flexDirection: 'row', gap: spacing.sm },

  geocodeBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  geocodeBtnText: { ...typography.bodyMedium, color: colors.primary, fontWeight: '600' },

  geoSuccess: {
    backgroundColor: colors.successGhost,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.success + '44',
  },
  geoSuccessText: { ...typography.bodySmall, color: colors.success, lineHeight: 20 },

  geoFail: {
    backgroundColor: colors.warningGhost,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning + '44',
  },
  geoFailText: { ...typography.bodySmall, color: colors.warning, lineHeight: 20 },

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
  inputMulti: { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.sm },
});
