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
import { GeocodingService, SearchLocationResult } from '../services/geocoding/GeocodingService';
import { ValhallaService } from '../services/routing/ValhallaService';
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
  name: '',
  address: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: 'RJ',
  cep: '',
  phone: '',
  orderCode: '',
  notes: '',
});

export function AddDeliveryModal({ visible, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<
    'idle' | 'searching' | 'found' | 'not_found'
  >('idle');
  const [coords, setCoords] = useState<{ lat: number; lon: number; provider: string } | null>(null);
  const [searchResult, setSearchResult] = useState<SearchLocationResult | null>(null);

  const update = (field: keyof FormState) => (val: string) => {
    setForm((prev) => ({ ...prev, [field]: val }));
    if (geocodeStatus !== 'idle') {
      setGeocodeStatus('idle');
    }
  };

  /** Auto-preenche endereço pelo CEP usando ViaCEP */
  const handleCepBlur = useCallback(async () => {
    const cep = form.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          address: data.logradouro ?? prev.address,
          neighborhood: data.bairro ?? prev.neighborhood,
          city: data.localidade ?? prev.city,
          state: data.uf ?? prev.state,
        }));
      }
    } catch {
      // ignore
    } finally {
      setCepLoading(false);
    }
  }, [form.cep]);

  /** Testa busca inteligente por Nome e Endereço */
  const handleTestGeocode = useCallback(async () => {
    if (!form.name.trim() && !form.address.trim()) {
      Alert.alert('Atenção', 'Informe o Nome e o Endereço para pesquisar.');
      return;
    }

    setGeocodeStatus('searching');
    setCoords(null);
    setSearchResult(null);

    const result = await GeocodingService.searchByNameAndAddress({
      name: form.name,
      address: form.address,
      number: form.number,
      neighborhood: form.neighborhood,
      city: form.city,
      state: form.state,
      cep: form.cep,
    });

    setSearchResult(result);

    if (result.success && result.latitude !== undefined && result.longitude !== undefined) {
      setGeocodeStatus('found');
      setCoords({
        lat: result.latitude,
        lon: result.longitude,
        provider: result.provider || 'Google Maps',
      });
    } else {
      setGeocodeStatus('not_found');
      Alert.alert(
        'Localização Não Encontrada',
        result.warningMessage ||
          'Não foi possível encontrar o local com o nome e endereço informados. Verifique a ortografia ou informe o CEP.',
        [{ text: 'Entendido' }],
      );
    }
  }, [form]);

  /** Persiste no SQLite com ou sem coordenadas */
  const persistDelivery = useCallback(
    async (
      lat: number | null,
      lon: number | null,
      geoSource: string | null,
      verifiedAddress?: string,
    ) => {
      setLoading(true);
      try {
        let snappedLat = lat;
        let snappedLon = lon;
        if (lat !== null && lon !== null) {
          try {
            const snap = await ValhallaService.locate([lon, lat], { radius: 100 });
            if (snap.matched && snap.snapped) {
              snappedLon = snap.snapped[0];
              snappedLat = snap.snapped[1];
            }
          } catch {
            // ignore
          }
        }

        const delivery: Omit<DeliveryEntity, 'id'> = {
          name: form.name.trim() || form.address.trim(),
          address: verifiedAddress || form.address.trim(),
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
          snappedLatitude: snappedLat,
          snappedLongitude: snappedLon,
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
        setSearchResult(null);
        setGeocodeStatus('idle');
        onSaved();
        onClose();
      } finally {
        setLoading(false);
      }
    },
    [form, onSaved, onClose],
  );

  const handleSave = useCallback(async () => {
    if (!form.name.trim() && !form.address.trim()) {
      Alert.alert('Atenção', 'Informe o nome do cliente ou local da entrega.');
      return;
    }
    if (!form.address.trim()) {
      Alert.alert('Atenção', 'Informe o endereço da entrega.');
      return;
    }

    if (coords && geocodeStatus === 'found') {
      await persistDelivery(
        coords.lat,
        coords.lon,
        coords.provider,
        searchResult?.formattedAddress,
      );
      return;
    }

    // Se ainda não testou, executa a busca por Nome e Endereço
    setLoading(true);
    const result = await GeocodingService.searchByNameAndAddress({
      name: form.name,
      address: form.address,
      number: form.number,
      neighborhood: form.neighborhood,
      city: form.city,
      state: form.state,
      cep: form.cep,
    });
    setLoading(false);

    if (result.success && result.latitude !== undefined && result.longitude !== undefined) {
      await persistDelivery(
        result.latitude,
        result.longitude,
        result.provider || 'Google Maps',
        result.formattedAddress,
      );
    } else {
      Alert.alert(
        'Localização Não Encontrada',
        (result.warningMessage ||
          'Não foi possível encontrar a localização exata com o nome e endereço informados.') +
          '\n\nDeseja salvar mesmo assim para ajustar o pino no mapa mais tarde?',
        [
          { text: 'Corrigir', style: 'cancel' },
          {
            text: 'Salvar Mesmo Assim',
            style: 'destructive',
            onPress: () => persistDelivery(null, null, null),
          },
        ],
      );
    }
  }, [form, coords, geocodeStatus, searchResult, persistDelivery]);

  const handleClose = () => {
    setForm(emptyForm());
    setCoords(null);
    setSearchResult(null);
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

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <Field
              label="Nome do Cliente ou Estabelecimento *"
              value={form.name}
              onChangeText={update('name')}
              placeholder="Ex: Restaurante Skinão ou João Silva"
            />

            <Field
              label="Endereço (Rua, Av., Bairro ou Ponto de Referência) *"
              value={form.address}
              onChangeText={update('address')}
              placeholder="Ex: Inoã, Maricá ou Rua das Flores"
            />

            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Número"
                  value={form.number}
                  onChangeText={update('number')}
                  placeholder="Ex: 123"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Complemento"
                  value={form.complement}
                  onChangeText={update('complement')}
                  placeholder="Apto, Sala, Km…"
                />
              </View>
            </View>

            <View style={styles.cepRow}>
              <View style={{ flex: 1 }}>
                <Field
                  label="CEP"
                  value={form.cep}
                  onChangeText={update('cep')}
                  placeholder="00000-000"
                  keyboardType="numeric"
                  onBlur={handleCepBlur}
                />
              </View>
              {cepLoading && (
                <ActivityIndicator color={colors.primary} style={styles.cepSpinner} />
              )}
            </View>

            <Field
              label="Bairro"
              value={form.neighborhood}
              onChangeText={update('neighborhood')}
              placeholder="Ex: Inoã, Centro"
            />

            <View style={styles.twoCol}>
              <View style={{ flex: 2 }}>
                <Field
                  label="Cidade"
                  value={form.city}
                  onChangeText={update('city')}
                  placeholder="Ex: Maricá"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="UF"
                  value={form.state}
                  onChangeText={update('state')}
                  placeholder="RJ"
                  maxLength={2}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <Field
              label="Código do Pedido"
              value={form.orderCode}
              onChangeText={update('orderCode')}
              placeholder="Ex: PED-1234"
            />

            <Field
              label="Telefone / WhatsApp"
              value={form.phone}
              onChangeText={update('phone')}
              placeholder="Ex: (21) 99999-9999"
              keyboardType="phone-pad"
            />

            <Field
              label="Observações"
              value={form.notes}
              onChangeText={update('notes')}
              placeholder="Instruções especiais de entrega…"
              multiline
            />

            {/* Botão de Busca por Nome e Endereço */}
            <Pressable
              style={[
                styles.geocodeBtn,
                geocodeStatus === 'searching' && { opacity: 0.7 },
              ]}
              onPress={handleTestGeocode}
              disabled={geocodeStatus === 'searching'}
            >
              {geocodeStatus === 'searching' ? (
                <View style={styles.searchingRow}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={styles.geocodeBtnText}>Pesquisando Nome e Endereço…</Text>
                </View>
              ) : (
                <Text style={styles.geocodeBtnText}>🔍 Pesquisar por Nome e Endereço</Text>
              )}
            </Pressable>

            {/* Feedback: Sucesso */}
            {geocodeStatus === 'found' && coords && (
              <View style={styles.geoSuccess}>
                <Text style={styles.geoSuccessTitle}>
                  ✅ Localizado com Sucesso ({searchResult?.provider || coords.provider})
                </Text>
                {searchResult?.formattedAddress ? (
                  <Text style={styles.geoSuccessAddr}>
                    📍 {searchResult.formattedAddress}
                  </Text>
                ) : null}
                <Text style={styles.geoSuccessCoords}>
                  🌐 Coordenadas: {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
                </Text>
              </View>
            )}

            {/* Feedback: Falha / Aviso */}
            {geocodeStatus === 'not_found' && (
              <View style={styles.geoFail}>
                <Text style={styles.geoFailTitle}>⚠️ Local Não Encontrado</Text>
                <Text style={styles.geoFailText}>
                  {searchResult?.warningMessage ||
                    'Não foi possível localizar o ponto com o nome e endereço informados. Verifique se há erros de digitação ou informe o CEP.'}
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
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  onBlur,
  multiline,
  maxLength,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  onBlur?: () => void;
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: any;
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
  cepRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  cepSpinner: { marginBottom: spacing.md },
  twoCol: { flexDirection: 'row', gap: spacing.sm },

  geocodeBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryGhost,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  geocodeBtnText: { ...typography.bodyMedium, color: colors.primary, fontWeight: '700' },

  geoSuccess: {
    backgroundColor: colors.successGhost,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.success + '66',
    gap: spacing.xs,
  },
  geoSuccessTitle: {
    ...typography.bodyMedium,
    fontWeight: '800',
    color: colors.success,
  },
  geoSuccessAddr: {
    ...typography.bodySmall,
    color: colors.text,
    lineHeight: 18,
    fontWeight: '600',
  },
  geoSuccessCoords: {
    ...typography.caption,
    color: colors.textMuted,
  },

  geoFail: {
    backgroundColor: colors.dangerGhost,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.danger + '55',
    gap: spacing.xs,
  },
  geoFailTitle: {
    ...typography.bodyMedium,
    fontWeight: '800',
    color: colors.danger,
  },
  geoFailText: {
    ...typography.bodySmall,
    color: colors.danger,
    lineHeight: 18,
  },

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
