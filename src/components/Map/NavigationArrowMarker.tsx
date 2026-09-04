import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

interface NavigationArrowMarkerProps {
  /** Ângulo de rotação na tela em graus (0° = apontando para cima/frente) */
  rotation: number;
  /** Tamanho do marcador em pixels (default: 52) */
  size?: number;
}

/**
 * NavigationArrowMarker
 * Seta de navegação automotiva estilo Google Maps / Waze.
 * Aponta RIGOROSAMENTE para o topo (0° / 12 horas) no estado inicial.
 */
export const NavigationArrowMarker = memo(function NavigationArrowMarker({
  rotation,
  size = 52,
}: NavigationArrowMarkerProps) {
  const center = size / 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          transform: [{ rotate: `${rotation}deg` }],
        },
      ]}
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 52 52">
        <Defs>
          {/* Halo sutil com gradiente radial */}
          <RadialGradient id="haloGrad" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor="#2563EB" stopOpacity="0.28" />
            <Stop offset="70%" stopColor="#2563EB" stopOpacity="0.12" />
            <Stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
          </RadialGradient>
        </Defs>

        {/* Anel de sombra / halo translúcido exterior */}
        <Circle cx={center} cy={center} r={24} fill="url(#haloGrad)" />

        {/* Círculo base branco elevado */}
        <Circle
          cx={center}
          cy={center}
          r={17}
          fill="#FFFFFF"
          stroke="#E2E8F0"
          strokeWidth={1.5}
        />

        {/* ── Flecha de Navegação 3D (Apontando exatamente para 0° / Cima) ── */}
        {/* Contorno branco espesso da flecha */}
        <Path
          d="M26 9 L38 37 L26 31 L14 37 Z"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={4.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Asa direita (Azul primário vívido) */}
        <Path
          d="M26 10 L37 36 L26 30.5 Z"
          fill="#2563EB"
          strokeLinejoin="round"
        />

        {/* Asa esquerda (Azul profundo para contraste/relevo 3D) */}
        <Path
          d="M26 10 L15 36 L26 30.5 Z"
          fill="#1D4ED8"
          strokeLinejoin="round"
        />

        {/* Linha central da espinha da flecha */}
        <Path
          d="M26 10 L26 30.5"
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth={1}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    // Sombra para dar elevação sobre o mapa
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 8,
  },
});
