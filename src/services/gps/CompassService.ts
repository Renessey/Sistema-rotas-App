import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { CompassModule } = NativeModules;
const compassEmitter = CompassModule ? new NativeEventEmitter(CompassModule) : null;

/**
 * CompassService
 * Interface em tempo real para a bússola / sensor de orientação física do aparelho.
 * Lê o sensor nativo de rotação (giroscópio + magnetômetro + acelerômetro) a 60 FPS,
 * permitindo que a seta e o mapa girem instantaneamente quando o celular é movido com as mãos.
 */
export class CompassService {
  /**
   * Inicia o rastreamento em tempo real do azimute físico do aparelho.
   * Retorna uma função de limpeza (unsubscribe).
   */
  static start(onUpdate: (heading: number) => void): () => void {
    if (Platform.OS !== 'android' || !CompassModule || !compassEmitter) {
      return () => {};
    }

    try {
      CompassModule.start();
      const subscription = compassEmitter.addListener('CompassUpdate', (event: any) => {
        if (event && typeof event.heading === 'number' && !isNaN(event.heading)) {
          onUpdate(event.heading);
        }
      });

      return () => {
        subscription.remove();
        try {
          CompassModule.stop();
        } catch {}
      };
    } catch (e) {
      console.warn('[CompassService] Falha ao iniciar sensor de bússola', e);
      return () => {};
    }
  }
}
