import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';

export type ThemeType = 'light' | 'dark';

export const lightColors = {
  // Brand
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  primaryLight: '#60a5fa',
  primaryGhost: 'rgba(59,130,246,0.12)',

  // Status
  success: '#10b981',
  successGhost: 'rgba(16,185,129,0.15)',
  danger: '#ef4444',
  dangerGhost: 'rgba(239,68,68,0.15)',
  warning: '#f59e0b',
  warningGhost: 'rgba(245,158,11,0.15)',
  info: '#06b6d4',

  // Surfaces
  background: '#f1f5f9',
  surface: '#ffffff',
  surfaceElevated: '#f8fafc',
  card: '#ffffff',

  // Glassmorphism overlays
  glass: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.4)',
  glassDark: 'rgba(15,23,42,0.75)',
  overlay: 'rgba(15,23,42,0.5)',

  // Text
  text: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  textDisabled: '#94a3b8',
  textOnPrimary: '#ffffff',

  // Borders
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',

  // Gradients
  gradientPrimary: ['#3b82f6', '#2563eb'],
  gradientSuccess: ['#10b981', '#059669'],
  gradientDanger: ['#ef4444', '#dc2626'],
  gradientWarning: ['#f59e0b', '#d97706'],
  gradientDark: ['#1e293b', '#0f172a'],
};

export const darkColors = {
  // Brand
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  primaryLight: '#60a5fa',
  primaryGhost: 'rgba(59,130,246,0.2)',

  // Status
  success: '#10b981',
  successGhost: 'rgba(16,185,129,0.2)',
  danger: '#ef4444',
  dangerGhost: 'rgba(239,68,68,0.2)',
  warning: '#f59e0b',
  warningGhost: 'rgba(245,158,11,0.2)',
  info: '#06b6d4',

  // Surfaces
  background: '#0f172a',    // slate-900
  surface: '#1e293b',       // slate-800
  surfaceElevated: '#334155',// slate-700
  card: '#1e293b',

  // Glassmorphism overlays
  glass: 'rgba(30,41,59,0.88)',
  glassBorder: 'rgba(255,255,255,0.1)',
  glassDark: 'rgba(15,23,42,0.9)',
  overlay: 'rgba(0,0,0,0.6)',

  // Text
  text: '#f8fafc',          // slate-50
  textSecondary: '#cbd5e1', // slate-300
  textMuted: '#94a3b8',     // slate-400
  textDisabled: '#475569',  // slate-600
  textOnPrimary: '#ffffff',

  // Borders
  border: '#334155',        // slate-700
  borderStrong: '#475569',  // slate-600

  // Gradients
  gradientPrimary: ['#2563eb', '#1d4ed8'],
  gradientSuccess: ['#059669', '#047857'],
  gradientDanger: ['#dc2626', '#b91c1c'],
  gradientWarning: ['#d97706', '#b45309'],
  gradientDark: ['#0f172a', '#020617'],
};

import AsyncStorage from '@react-native-async-storage/async-storage';

export type Colors = typeof lightColors;

interface ThemeContextData {
  theme: ThemeType;
  colors: Colors;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeType) => void;
}

const THEME_STORAGE_KEY = '@routes_app_theme';

export const ThemeContext = createContext<ThemeContextData>({
  theme: 'light',
  colors: lightColors,
  toggleTheme: () => {},
  setThemeMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeType>('light');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
          setTheme(saved);
        } else {
          const sys = Appearance.getColorScheme();
          if (sys === 'dark') setTheme('dark');
        }
      } catch (e) {
        console.warn('[ThemeContext] Erro ao carregar tema:', e);
      }
    })();
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  };

  const setThemeMode = (mode: ThemeType) => {
    setTheme(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  };

  const currentColors = useMemo(() => (theme === 'light' ? lightColors : darkColors), [theme]);

  return (
    <ThemeContext.Provider value={{ theme, colors: currentColors, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

