import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { launchCamera, CameraOptions, ImagePickerResponse } from 'react-native-image-picker';
import RNFS from 'react-native-fs';

export interface CapturedPhoto {
  uri: string;
  base64?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

export class CameraService {
  private static readonly PHOTOS_DIR = `${RNFS.DocumentDirectoryPath}/delivery_photos`;

  /**
   * Garante que o diretório persistente de fotos de entregas existe no armazenamento local.
   */
  private static async ensureDirectoryExists(): Promise<void> {
    try {
      const exists = await RNFS.exists(this.PHOTOS_DIR);
      if (!exists) {
        await RNFS.mkdir(this.PHOTOS_DIR);
      }
    } catch (e) {
      console.warn('[CameraService] Erro ao criar diretório de fotos:', e);
    }
  }

  /**
   * Solicita permissão de câmera no Android caso ainda não tenha sido concedida.
   */
  static async requestCameraPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (granted) return true;

      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Permissão de Câmera',
        message: 'O aplicativo precisa da câmera para registrar a foto do local da entrega como comprovante.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Agora Não',
      });

      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('[CameraService] Erro ao solicitar permissão de câmera:', err);
      return false;
    }
  }

  /**
   * Abre a câmera nativa, captura a foto do local e comprime em alta definição
   * (1280x1280 px com qualidade 0.80) para garantir nitidez sem consumir excesso de memória.
   * Salva uma cópia permanente no armazenamento do app.
   */
  static async captureDeliveryPhoto(): Promise<CapturedPhoto | null> {
    const hasPermission = await this.requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(
        'Permissão Necessária',
        'Não foi possível acessar a câmera. Conceda a permissão de câmera nas configurações do celular para tirar fotos.',
      );
      return null;
    }

    await this.ensureDirectoryExists();

    const options: CameraOptions = {
      mediaType: 'photo',
      cameraType: 'back',
      maxWidth: 1280,
      maxHeight: 1280,
      quality: 0.8,
      includeBase64: true,
      saveToPhotos: false,
    };

    return new Promise((resolve) => {
      launchCamera(options, async (response: ImagePickerResponse) => {
        if (response.didCancel) {
          resolve(null);
          return;
        }

        if (response.errorCode || response.errorMessage) {
          console.warn('[CameraService] Erro no ImagePicker:', response.errorMessage || response.errorCode);
          Alert.alert('Aviso', 'Não foi possível tirar a foto no momento.');
          resolve(null);
          return;
        }

        const asset = response.assets?.[0];
        if (!asset || !asset.uri) {
          resolve(null);
          return;
        }

        try {
          const fileName = `proof_${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
          const permanentPath = `${this.PHOTOS_DIR}/${fileName}`;

          // Se tiver URI de arquivo em cache temporário, copia para a pasta permanente do app
          const sourcePath = asset.uri.replace('file://', '');
          await RNFS.copyFile(sourcePath, permanentPath);

          const finalUri = Platform.OS === 'android' ? `file://${permanentPath}` : permanentPath;

          resolve({
            uri: finalUri,
            base64: asset.base64,
            width: asset.width,
            height: asset.height,
            fileSize: asset.fileSize,
          });
        } catch (copyErr) {
          console.warn('[CameraService] Erro ao persistir foto localmente:', copyErr);
          // Caso a cópia falhe, retorna a URI original do cache temporário
          resolve({
            uri: asset.uri,
            base64: asset.base64,
            width: asset.width,
            height: asset.height,
            fileSize: asset.fileSize,
          });
        }
      });
    });
  }

  /**
   * Remove com segurança o arquivo da foto do armazenamento local do aparelho.
   */
  static async deletePhoto(photoUri?: string | null): Promise<void> {
    if (!photoUri) return;
    try {
      const cleanPath = photoUri.replace('file://', '');
      const exists = await RNFS.exists(cleanPath);
      if (exists) {
        await RNFS.unlink(cleanPath);
      }
    } catch (err) {
      console.warn('[CameraService] Erro ao remover foto antiga:', err);
    }
  }
}

