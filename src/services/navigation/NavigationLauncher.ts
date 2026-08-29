import { Linking, Platform, Alert } from 'react-native';
import type { LngLat, ExternalNavApp } from '../../types/geo';
import { formatPhoneBR } from '../../utils/addressParser';

/**
 * NavigationLauncher — Integração com Waze, Google Maps e WhatsApp.
 *
 * Abre o app externo de navegação ou WhatsApp diretamente do app de entregas.
 */
export class NavigationLauncher {
  /**
   * Constrói a URL oficial Universal do Google Maps com suporte a Multi-Paradas (Waypoints).
   *
   * Formato padrão:
   * https://www.google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=...&travelmode=driving
   *
   * @param stops Lista de paradas (RouteStop ou array de pontos com latitude/longitude)
   * @param origin Coordenadas de origem [longitude, latitude] ou null (usa My+Location)
   */
  static buildGoogleMapsMultiStopUrl(
    stops: Array<{ latitude: number; longitude: number; address?: string }>,
    origin?: LngLat | null,
  ): string | null {
    if (!stops || stops.length === 0) return null;

    // Filtra paradas com coordenadas válidas
    const validStops = stops.filter(
      (s) =>
        typeof s.latitude === 'number' &&
        typeof s.longitude === 'number' &&
        !isNaN(s.latitude) &&
        !isNaN(s.longitude) &&
        (s.latitude !== 0 || s.longitude !== 0),
    );

    if (validStops.length === 0) return null;

    // 1. Origem: coordenadas do GPS ou 'My+Location'
    const originParam =
      origin && origin[0] !== undefined && origin[1] !== undefined && !isNaN(origin[0]) && !isNaN(origin[1])
        ? `${origin[1]},${origin[0]}`
        : 'My+Location';

    // 2. Destino Final: último item da lista
    const lastStop = validStops[validStops.length - 1];
    const destinationParam = `${lastStop.latitude},${lastStop.longitude}`;

    // 3. Paradas Intermediárias (Waypoints): do primeiro até o penúltimo
    if (validStops.length === 1) {
      // Apenas 1 parada: omite waypoints
      return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destinationParam}&travelmode=driving`;
    }

    const intermediateStops = validStops.slice(0, -1);
    const waypointsStr = intermediateStops
      .map((s) => `${s.latitude},${s.longitude}`)
      .join('|');

    return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destinationParam}&waypoints=${encodeURIComponent(waypointsStr)}&travelmode=driving`;
  }

  /**
   * Abre o aplicativo oficial do Google Maps (ou navegador) com o itinerário completo de múltiplas paradas.
   */
  static async openGoogleMapsMultiStop(
    stops: Array<{ latitude: number; longitude: number; address?: string }>,
    origin?: LngLat | null,
  ): Promise<boolean> {
    if (!stops || stops.length === 0) {
      Alert.alert('Google Maps', 'Nenhuma parada disponível para traçar a rota.');
      return false;
    }

    const url = this.buildGoogleMapsMultiStopUrl(stops, origin);
    if (!url) {
      Alert.alert('Google Maps', 'As paradas da rota não possuem coordenadas válidas.');
      return false;
    }

    try {
      await Linking.openURL(url);
      return true;
    } catch (error) {
      console.warn('[NavigationLauncher] Falha ao abrir rota multi-paradas no Google Maps', error);
      Alert.alert('Erro', 'Não foi possível abrir o Google Maps no dispositivo.');
      return false;
    }
  }

  /**
   * Abre um app de navegação externo (Waze / Google Maps) com o destino.
   * Se o app não estiver instalado, abre no browser.
   */
  static async openNavigation(
    coords: LngLat,
    label?: string,
    app: ExternalNavApp = 'waze',
  ): Promise<boolean> {
    const [lon, lat] = coords;
    let url: string;

    switch (app) {
      case 'waze':
        url = `waze://?ll=${lat},${lon}&navigate=yes`;
        break;
      case 'google_maps':
        url = Platform.OS === 'ios'
          ? `comgooglemaps://?daddr=${lat},${lon}&directionsmode=driving`
          : `google.navigation:q=${lat},${lon}&mode=d`;
        break;
      case 'apple_maps':
        url = `maps://?daddr=${lat},${lon}&dirflg=d`;
        break;
    }

    const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}${label ? '&destination_place_id=' + encodeURIComponent(label) : ''}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      } else {
        await Linking.openURL(fallbackUrl);
        return true;
      }
    } catch (error) {
      console.warn('[NavigationLauncher] Failed to open navigation', error);
      try {
        await Linking.openURL(fallbackUrl);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Verifica se o Waze está instalado no dispositivo.
   */
  static async isWazeInstalled(): Promise<boolean> {
    try {
      return await Linking.canOpenURL('waze://');
    } catch {
      return false;
    }
  }

  /**
   * Verifica se o Google Maps está instalado.
   */
  static async isGoogleMapsInstalled(): Promise<boolean> {
    try {
      const url = Platform.OS === 'ios' ? 'comgooglemaps://' : 'google.navigation:q=0,0';
      return await Linking.canOpenURL(url);
    } catch {
      return false;
    }
  }

  /**
   * Abre o WhatsApp com o número do cliente e uma mensagem pronta.
   * O número é formatado automaticamente para +55XXXXXXXXXXX.
   */
  static async openWhatsApp(
    phone: string,
    clientName?: string,
    address?: string,
  ): Promise<boolean> {
    const formatted = formatPhoneBR(phone);
    if (!formatted) {
      console.warn('[NavigationLauncher] Invalid phone number:', phone);
      return false;
    }

    const digitsOnly = formatted.replace('+', '');

    const defaultMsg = [
      `Olá${clientName ? ', ' + clientName : ''}! 👋`,
      'Sou o entregador e estou a caminho para realizar a sua entrega.',
      address ? `📍 Endereço confirmado: ${address}` : '',
      'Por favor, esteja disponível para receber.',
      '📦 Obrigado!',
    ].filter(Boolean).join('\n');

    const url = `whatsapp://send?phone=${digitsOnly}&text=${encodeURIComponent(defaultMsg)}`;
    const fallbackUrl = `https://api.whatsapp.com/send?phone=${digitsOnly}&text=${encodeURIComponent(defaultMsg)}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      } else {
        await Linking.openURL(fallbackUrl);
        return true;
      }
    } catch (error) {
      console.warn('[NavigationLauncher] Failed to open WhatsApp', error);
      try {
        await Linking.openURL(fallbackUrl);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Faz uma ligação direta para o cliente.
   */
  static async callPhone(phone: string): Promise<boolean> {
    const formatted = formatPhoneBR(phone);
    const dialNumber = formatted ?? phone.replace(/\D/g, '');
    const url = `tel:${dialNumber}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      }
      return false;
    } catch (error) {
      console.warn('[NavigationLauncher] Failed to call phone', error);
      return false;
    }
  }
}
