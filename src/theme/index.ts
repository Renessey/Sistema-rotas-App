/**
 * Design System — RotaSimples Premium
 * Paleta dark/slate com azul elétrico, esmeralda e âmbar tático.
 */

export const colors = {
  // Brand
  primary: '#3b82f6',       // azul elétrico vibrante
  primaryDark: '#2563eb',
  primaryLight: '#60a5fa',
  primaryGhost: 'rgba(59,130,246,0.12)',

  // Status
  success: '#10b981',       // esmeralda
  successGhost: 'rgba(16,185,129,0.15)',
  danger: '#ef4444',        // vermelho alerta
  dangerGhost: 'rgba(239,68,68,0.15)',
  warning: '#f59e0b',       // âmbar tático
  warningGhost: 'rgba(245,158,11,0.15)',
  info: '#06b6d4',          // ciano informativo

  // Surfaces (Light Mode)
  background: '#f1f5f9',    // slate-100
  surface: '#ffffff',
  surfaceElevated: '#f8fafc',
  card: '#ffffff',

  // Glassmorphism overlays
  glass: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.4)',
  glassDark: 'rgba(15,23,42,0.75)',
  overlay: 'rgba(15,23,42,0.5)',

  // Text
  text: '#0f172a',          // slate-900
  textSecondary: '#334155', // slate-700
  textMuted: '#64748b',     // slate-500
  textDisabled: '#94a3b8',  // slate-400
  textOnPrimary: '#ffffff',

  // Borders
  border: '#e2e8f0',        // slate-200
  borderStrong: '#cbd5e1',  // slate-300

  // Gradients (as strings for LinearGradient)
  gradientPrimary: ['#3b82f6', '#2563eb'],
  gradientSuccess: ['#10b981', '#059669'],
  gradientDanger: ['#ef4444', '#dc2626'],
  gradientWarning: ['#f59e0b', '#d97706'],
  gradientDark: ['#1e293b', '#0f172a'],
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 32,
  full: 999,
};

export const typography = {
  displayLarge: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  displayMedium: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.3 },
  headline: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
  title: { fontSize: 18, fontWeight: '700' as const },
  titleSmall: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '500' as const },
  bodySmall: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.5 },
  caption: { fontSize: 11, fontWeight: '400' as const },
  mono: { fontSize: 13, fontFamily: 'monospace' as const },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  colored: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  }),
};

export const statusConfig = {
  pending:        { color: colors.textMuted,  bg: colors.border,        label: 'Pendente',       icon: '⏳' },
  optimized:      { color: colors.primary,    bg: colors.primaryGhost,  label: 'Roteirizado',    icon: '🗺️' },
  in_progress:    { color: colors.warning,    bg: colors.warningGhost,  label: 'Em Rota',        icon: '🚚' },
  completed:      { color: colors.success,    bg: colors.successGhost,  label: 'Entregue',       icon: '✅' },
  failed:         { color: colors.danger,     bg: colors.dangerGhost,   label: 'Insucesso',      icon: '❌' },
  invalid_coords: { color: colors.danger,     bg: colors.dangerGhost,   label: 'Sem Coordenada', icon: '⚠️' },
} as const;
