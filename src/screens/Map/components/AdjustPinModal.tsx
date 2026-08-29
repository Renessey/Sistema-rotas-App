import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import {
  Map as MapLibreMap,
  MapRef,
  Camera,
  CameraRef,
  Marker,
} from '@maplibre/maplibre-react-native';
import {
  X,
  Search,
  Check,
  RotateCcw,
  MapPin,
  ExternalLink,
  Navigation,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme/ThemeContext';
import { spacing, radius, shadows, typography } from '../../../theme';
import { GeocodingService } from '../../../services/geocoding/GeocodingService';
import { haversine } from '../../../utils/geo';
import type { RouteStop, LngLat } from '../../../types/geo';

interface AdjustPinModalProps {
  visible: boolean;
  stop: RouteStop | null;
  currentStyleUrl: string;
  onClose: () => void;
  onSave: (stop: RouteStop, newLat: number, newLng: number) => void;
  onRevert?: (stop: RouteStop) => void;
}

export function AdjustPinModal({
  visible,
  stop,
  currentStyleUrl,
  onClose,
  onSave,
  onRevert,
}: AdjustPinModalProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const cameraRef = useRef<CameraRef | null>(null);

  // Coordenada original importada da planilha (preservada de rawLatitude/rawLongitude)
  const spreadsheetCoords: LngLat = useMemo(() => {
    if (!stop || !stop.deliveries || stop.deliveries.length === 0) {
      return stop ? [stop.longitude, stop.latitude] : [0, 0];
    }
    const d = stop.deliveries[0];
    if (d.rawLatitude && d.rawLongitude) {
      const lat = parseFloat(String(d.rawLatitude).replace(',', '.'));
      const lon = parseFloat(String(d.rawLongitude).replace(',', '.'));
      if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
        return [lon, lat];
      }
    }
    return [stop.longitude, stop.latitude];
  }, [stop]);

  // Coordenada alvo atualmente selecionada (centro da mira)
  const [targetCoords, setTargetCoords] = useState<LngLat>([0, 0]);

  // Sugestão encontrada pela busca de endereço
  const [suggestionCoords, setSuggestionCoords] = useState<LngLat | null>(null);
  const [suggestionAddress, setSuggestionAddress] = useState<string | null>(null);

  // Busca de texto
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inicializa quando o modal abre ou a parada muda
  useEffect(() => {
    if (stop && visible) {
      const initial: LngLat = [stop.longitude, stop.latitude];
      setTargetCoords(initial);
      const queryText = [stop.address, stop.bairro, stop.city].filter(Boolean).join(', ');
      setSearchQuery(queryText);
      setSuggestionCoords(null);
      setSuggestionAddress(null);

      // Executa busca automática da sugestão inicial via Geocoding
      handleSearchAddress(queryText, false);

      // Centra a câmera na posição atual
      setTimeout(() => {
        cameraRef.current?.setStop({
          center: initial,
          zoom: 17,
          duration: 400,
        });
      }, 300);
    }
  }, [stop, visible]);

  // Extrai coordenadas de eventos do MapLibre
  const handleMapCenterUpdate = useCallback(async (e?: any) => {
    let coords: any = e?.geometry?.coordinates;
    if (!coords || !Array.isArray(coords) || coords.length < 2) {
      coords = e?.properties?.center;
    }
    if (!coords || !Array.isArray(coords) || coords.length < 2) {
      coords = e?.nativeEvent?.geometry?.coordinates;
    }
    if (!coords || !Array.isArray(coords) || coords.length < 2) {
      coords = e?.nativeEvent?.properties?.center;
    }
    if (!coords || !Array.isArray(coords) || coords.length < 2) {
      coords = e?.nativeEvent?.center || e?.nativeEvent?.coordinates || e?.center;
    }

    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number' && !isNaN(coords[0])) {
      setTargetCoords([coords[0], coords[1]]);
      return;
    }

    // Fallback: consulta diretamente a ponte nativa do mapa
    if (mapRef.current) {
      try {
        const center = await mapRef.current.getCenter();
        if (center && Array.isArray(center) && center.length >= 2 && !isNaN(center[0]) && !isNaN(center[1])) {
          setTargetCoords([center[0], center[1]]);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  // Executa busca por geocoding
  const handleSearchAddress = async (query: string, moveCamera = true) => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const result = await GeocodingService.geocodeQuery(query);
      if (result) {
        const foundCoords: LngLat = [result.longitude, result.latitude];
        setSuggestionCoords(foundCoords);
        setSuggestionAddress(result.formattedAddress || query);

        if (moveCamera) {
          setTargetCoords(foundCoords);
          cameraRef.current?.setStop({
            center: foundCoords,
            zoom: 17,
            duration: 500,
          });
        }
      } else {
        if (moveCamera) {
          Alert.alert('Busca de Endereço', 'Endereço não localizado pelo serviço de busca. Você pode ajustar o pino manualmente movendo o mapa.');
        }
      }
    } catch {
      if (moveCamera) {
        Alert.alert('Erro', 'Falha ao consultar serviço de endereço.');
      }
    } finally {
      setSearching(false);
    }
  };

  // Aplica a sugestão encontrada como o ponto alvo
  const handleApplySuggestion = () => {
    if (!suggestionCoords) return;
    setTargetCoords(suggestionCoords);
    cameraRef.current?.setStop({
      center: suggestionCoords,
      zoom: 17,
      duration: 400,
    });
  };

  // Move a mira e a câmera de volta para o ponto original da planilha
  const handleResetToOriginal = () => {
    setTargetCoords(spreadsheetCoords);
    cameraRef.current?.setStop({
      center: spreadsheetCoords,
      zoom: 17,
      duration: 400,
    });
  };

  // Retrocede/restaura a coordenada original da planilha gravando no SQLite
  const handleRevertToSpreadsheet = () => {
    if (!stop) return;
    Alert.alert(
      'Voltar ao Ponto da Planilha',
      'Deseja restaurar as coordenadas originais da planilha para esta parada e atualizar o mapa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar Original',
          style: 'destructive',
          onPress: () => {
            if (onRevert) {
              onRevert(stop);
            } else {
              const [origLng, origLat] = spreadsheetCoords;
              onSave(stop, origLat, origLng);
            }
            onClose();
          },
        },
      ],
    );
  };

  // Abre busca no aplicativo oficial do Google Maps / Navegador
  const handleOpenGoogleMaps = () => {
    if (!stop) return;
    const query = encodeURIComponent(searchQuery || stop.address || `${stop.latitude},${stop.longitude}`);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Erro', 'Não foi possível abrir o Google Maps.');
    });
  };

  // Salva a nova coordenada com confirmação e precisão
  const handleConfirmSave = async () => {
    if (!stop) return;
    setSaving(true);
    try {
      let finalLng = targetCoords[0];
      let finalLat = targetCoords[1];

      // Busca as coordenadas exatas do centro atual do mapa
      if (mapRef.current) {
        try {
          const center = await mapRef.current.getCenter();
          if (center && Array.isArray(center) && center.length >= 2 && !isNaN(center[0]) && !isNaN(center[1])) {
            finalLng = center[0];
            finalLat = center[1];
          }
        } catch {
          // fallback
        }
      }

      onSave(stop, finalLat, finalLng);
      onClose();
    } catch {
      Alert.alert('Erro', 'Falha ao salvar a nova posição do pino.');
    } finally {
      setSaving(false);
    }
  };

  // Calcula a divergência em metros da posição original da planilha
  const divergenceDistance = useMemo(() => {
    if (!spreadsheetCoords || !targetCoords) return 0;
    return Math.round(haversine(spreadsheetCoords, targetCoords));
  }, [spreadsheetCoords, targetCoords]);

  if (!stop) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* ── 1. Header do Modal ── */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerTag}>
              <MapPin size={13} color={colors.primary} />
              <Text style={[styles.headerTagText, { color: colors.primary }]}>
                PARADA {String(stop.stopNumber).padStart(2, '0')}
              </Text>
            </View>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              Comparar & Ajustar Pino
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {stop.address}
            </Text>
          </View>
          <Pressable
            style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={onClose}
          >
            <X size={18} color={colors.text} />
          </Pressable>
        </View>

        {/* ── 2. Barra de Busca de Endereço ── */}
        <View style={[styles.searchBarWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[styles.inputBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Digite o endereço ou CEP para buscar..."
              placeholderTextColor={colors.textDisabled}
              returnKeyType="search"
              onSubmitEditing={() => handleSearchAddress(searchQuery, true)}
            />
            {searching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Pressable
                style={[styles.searchBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleSearchAddress(searchQuery, true)}
              >
                <Text style={styles.searchBtnText}>Buscar</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* ── 3. Visualizador do Mapa com Pinos ── */}
        <View style={styles.mapContainer}>
          <MapLibreMap
            ref={mapRef}
            style={styles.map}
            mapStyle={currentStyleUrl}
            compass={false}
            scaleBar={false}
            onRegionIsChanging={handleMapCenterUpdate}
            onRegionDidChange={handleMapCenterUpdate}
            onPress={(e: any) => {
              const coords = e?.geometry?.coordinates || e?.nativeEvent?.geometry?.coordinates;
              if (coords && Array.isArray(coords) && coords.length >= 2) {
                const clicked: LngLat = [coords[0], coords[1]];
                setTargetCoords(clicked);
                cameraRef.current?.setStop({
                  center: clicked,
                  duration: 300,
                });
              }
            }}
          >
            <Camera
              ref={cameraRef}
              initialViewState={{ center: targetCoords[0] ? targetCoords : spreadsheetCoords, zoom: 17 }}
              minZoom={3}
              maxZoom={20}
            />

            {/* 🔴 Marcador Fixo: Posição Original da Planilha */}
            <Marker id="original-pin" lngLat={spreadsheetCoords} anchor="bottom">
              <View style={styles.markerContainer}>
                <View style={[styles.markerBadge, { backgroundColor: '#EF4444' }]}>
                  <Text style={styles.markerBadgeText}>🔴 Planilha</Text>
                </View>
                <View style={[styles.markerDot, { backgroundColor: '#EF4444', borderColor: '#FFFFFF' }]} />
              </View>
            </Marker>

            {/* 🔵 Marcador Fixo: Sugestão de Busca */}
            {suggestionCoords && (
              <Marker id="suggestion-pin" lngLat={suggestionCoords} anchor="bottom">
                <Pressable onPress={handleApplySuggestion} style={styles.markerContainer}>
                  <View style={[styles.markerBadge, { backgroundColor: '#3B82F6' }]}>
                    <Text style={styles.markerBadgeText}>🔵 Busca</Text>
                  </View>
                  <View style={[styles.markerDot, { backgroundColor: '#3B82F6', borderColor: '#FFFFFF' }]} />
                </Pressable>
              </Marker>
            )}
          </MapLibreMap>

          {/* 🎯 Mira Central: Pino Alvo Dinâmico */}
          <View style={styles.crosshairOverlay} pointerEvents="none">
            <View style={[styles.targetPinBadge, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
              <MapPin size={14} color={colors.primary} />
              <Text style={[styles.targetPinText, { color: colors.text }]}>Nova Posição</Text>
            </View>
            <View style={[styles.targetPinCenter, { borderColor: colors.primary }]}>
              <View style={[styles.targetPinDot, { backgroundColor: colors.primary }]} />
            </View>
          </View>

          {/* Legenda Flutuante */}
          <View style={[styles.legendBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.legendRow}>
              <View style={[styles.legendIndicator, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.legendText, { color: colors.text }]}>Original (Planilha)</Text>
            </View>
            {suggestionCoords && (
              <View style={styles.legendRow}>
                <View style={[styles.legendIndicator, { backgroundColor: '#3B82F6' }]} />
                <Text style={[styles.legendText, { color: colors.text }]}>Sugestão da Busca</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── 4. Painel Inferior de Ações e Informações ── */}
        <View style={[styles.bottomPanel, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Card de Divergência */}
          <View style={[styles.divergenceRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.divergenceTitle, { color: colors.textMuted }]}>
                Divergência da Planilha:
              </Text>
              <Text style={[styles.divergenceValue, { color: divergenceDistance > 100 ? colors.warning : colors.success }]}>
                {divergenceDistance === 0 ? 'Posição idêntica à planilha' : `${divergenceDistance} metros de distância`}
              </Text>
            </View>
            <View style={styles.coordCol}>
              <Text style={[styles.coordText, { color: colors.textMuted }]}>
                Lat: {targetCoords[1].toFixed(5)}
              </Text>
              <Text style={[styles.coordText, { color: colors.textMuted }]}>
                Lng: {targetCoords[0].toFixed(5)}
              </Text>
            </View>
          </View>

          {/* Botões Rápidos de Alinhamento */}
          <View style={styles.quickActionsRow}>
            {suggestionCoords && (
              <Pressable
                style={[styles.quickBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={handleApplySuggestion}
              >
                <Navigation size={14} color="#3B82F6" />
                <Text style={[styles.quickBtnText, { color: '#3B82F6' }]}>Usar Busca (Azul)</Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.quickBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              onPress={handleResetToOriginal}
            >
              <RotateCcw size={14} color="#EF4444" />
              <Text style={[styles.quickBtnText, { color: '#EF4444' }]}>Voltar à Planilha</Text>
            </Pressable>

            <Pressable
              style={[styles.quickBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              onPress={handleOpenGoogleMaps}
            >
              <ExternalLink size={14} color={colors.primary} />
              <Text style={[styles.quickBtnText, { color: colors.primary }]}>Google Maps</Text>
            </Pressable>
          </View>

          {/* Botão Principal de Retroceder / Restaurar Posição Original da Planilha */}
          <Pressable
            style={[
              styles.revertBtn,
              { backgroundColor: colors.dangerGhost, borderColor: colors.danger + '66' },
            ]}
            onPress={handleRevertToSpreadsheet}
          >
            <RotateCcw size={16} color={colors.danger} />
            <Text style={[styles.revertBtnText, { color: colors.danger }]}>
              Voltar ao Ponto Original da Planilha
            </Text>
          </Pressable>

          {/* Botão de Salvar */}
          <Pressable
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleConfirmSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.saveBtnText}>Salvar Nova Posição do Pino</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  headerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  headerTagText: {
    ...typography.label,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerTitle: {
    ...typography.title,
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  searchBarWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    height: 42,
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  searchBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  searchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  crosshairOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetPinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1.5,
    gap: 4,
    marginBottom: 6,
    ...shadows.md,
    elevation: 6,
  },
  targetPinText: {
    fontSize: 11,
    fontWeight: '800',
  },
  targetPinCenter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  targetPinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  markerContainer: {
    alignItems: 'center',
  },
  markerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginBottom: 3,
    ...shadows.sm,
    elevation: 3,
  },
  markerBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  legendBox: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    padding: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
    ...shadows.sm,
    elevation: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '600',
  },
  bottomPanel: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  divergenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  divergenceTitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  divergenceValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
  coordCol: {
    alignItems: 'flex-end',
  },
  coordText: {
    fontSize: 10,
    fontWeight: '500',
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
  },
  quickBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 6,
    marginTop: spacing.xs,
  },
  modifiedBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  revertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  revertBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: radius.md,
    gap: spacing.xs,
    ...shadows.md,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
