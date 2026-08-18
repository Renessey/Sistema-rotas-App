import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { DatabaseService } from './src/storage/DatabaseService';

export default function App() {
  useEffect(() => {
    DatabaseService.init();
  }, []);

  return (
    <SafeAreaProvider>
      {/* StatusBar globalmente oculta — o modo imersivo nativo (MainActivity.kt)
          cuida de esconder também a barra de navegação inferior */}
      <StatusBar hidden />
      <Navigation />
    </SafeAreaProvider>
  );
}
