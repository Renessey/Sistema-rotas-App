import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { DatabaseService } from './src/storage/DatabaseService';
import { ThemeProvider } from './src/theme/ThemeContext';
import { AppSplashScreen } from './src/components/Common/AppSplashScreen';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    DatabaseService.init();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* StatusBar globalmente oculta — o modo imersivo nativo (MainActivity.kt)
            cuida de esconder também a barra de navegação inferior */}
        <StatusBar hidden />
        <Navigation />
        {showSplash && <AppSplashScreen onFinish={() => setShowSplash(false)} />}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
