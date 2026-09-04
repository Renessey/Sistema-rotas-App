import { useState, useEffect, useRef } from 'react';
import type { LngLat } from '../../../types/geo';

interface UseSmoothLocationProps {
  rawLocation: LngLat | null;
  rawHeading: number | null;
  cameraBearing: number;
  isNavigating: boolean;
  navigationOrientation: 'course' | 'north';
}

/**
 * useSmoothLocation
 * Interpolação suave e sob demanda de coordenadas GPS e rumo (Heading).
 * Elimina saltos bruscos sem sobrecarregar a thread principal do React:
 * quando parado, a animação é desligada completamente (0 re-renders, 0 CPU).
 */
export function useSmoothLocation({
  rawLocation,
  rawHeading,
  cameraBearing,
  isNavigating,
  navigationOrientation,
}: UseSmoothLocationProps) {
  const [smoothLocation, setSmoothLocation] = useState<LngLat | null>(rawLocation);
  const [smoothHeading, setSmoothHeading] = useState<number>(rawHeading || 0);

  const currentCoordRef = useRef<LngLat | null>(rawLocation);
  const targetCoordRef = useRef<LngLat | null>(rawLocation);
  const startCoordRef = useRef<LngLat | null>(rawLocation);
  const animStartTimeRef = useRef<number>(0);
  const animDurationRef = useRef<number>(500);

  const currentHeadingRef = useRef<number>(rawHeading || 0);
  const targetHeadingRef = useRef<number>(rawHeading || 0);

  const isAnimatingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // 1. Atualização do Alvo de Localização (apenas com deslocamento real >= 1.5m)
  useEffect(() => {
    if (!rawLocation) return;

    if (!currentCoordRef.current) {
      currentCoordRef.current = rawLocation;
      targetCoordRef.current = rawLocation;
      startCoordRef.current = rawLocation;
      setSmoothLocation(rawLocation);
      return;
    }

    const [prevLng, prevLat] = targetCoordRef.current || currentCoordRef.current;
    const [newLng, newLat] = rawLocation;

    const dLng = (newLng - prevLng) * 111320 * Math.cos((newLat * Math.PI) / 180);
    const dLat = (newLat - prevLat) * 110540;
    const distM = Math.sqrt(dLng * dLng + dLat * dLat);

    // Filtro anti-ruído: ignora micro-deriva de GPS parado (< 1.5m)
    if (distM < 1.5) {
      return;
    }

    startCoordRef.current = currentCoordRef.current;
    targetCoordRef.current = rawLocation;
    animStartTimeRef.current = Date.now();
    animDurationRef.current = Math.min(800, Math.max(400, distM * 60));

    triggerAnimation();
  }, [rawLocation]);

  // 2. Atualização do Alvo de Heading
  useEffect(() => {
    if (rawHeading !== null && rawHeading >= 0) {
      const diff = Math.abs(((rawHeading - targetHeadingRef.current + 540) % 360) - 180);
      if (diff >= 2.0) {
        targetHeadingRef.current = rawHeading;
        triggerAnimation();
      }
    }
  }, [rawHeading]);

  // 3. Gerenciador de Animação sob Demanda (inicia e encerra quando atinge o alvo)
  const triggerAnimation = () => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    const tick = () => {
      const now = Date.now();
      let hasMovement = false;

      // ─── Interpolação de Posição ───
      if (startCoordRef.current && targetCoordRef.current && currentCoordRef.current) {
        const elapsed = now - animStartTimeRef.current;
        const progress = Math.min(1, elapsed / animDurationRef.current);

        if (progress < 1) {
          const t = 1 - Math.pow(1 - progress, 3);
          const [startLng, startLat] = startCoordRef.current;
          const [targetLng, targetLat] = targetCoordRef.current;
          const currentLng = startLng + (targetLng - startLng) * t;
          const currentLat = startLat + (targetLat - startLat) * t;

          currentCoordRef.current = [currentLng, currentLat];
          setSmoothLocation([currentLng, currentLat]);
          hasMovement = true;
        } else {
          currentCoordRef.current = targetCoordRef.current;
          setSmoothLocation(targetCoordRef.current);
        }
      }

      // ─── Interpolação de Rumo (Heading) ───
      const targetH = targetHeadingRef.current;
      const currentH = currentHeadingRef.current;
      const diffH = ((targetH - currentH + 540) % 360) - 180;

      if (Math.abs(diffH) > 0.4) {
        const nextH = (currentH + diffH * 0.3 + 360) % 360;
        currentHeadingRef.current = nextH;
        setSmoothHeading(nextH);
        hasMovement = true;
      } else {
        currentHeadingRef.current = targetH;
        setSmoothHeading(targetH);
      }

      // Se ainda houver transição pendente, agenda o próximo frame. Caso contrário, desliga o loop.
      if (hasMovement) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        isAnimatingRef.current = false;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    return () => {
      isAnimatingRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // 4. Cálculo da Rotação da Seta na Tela
  let markerRotation = 0;
  if (isNavigating) {
    if (navigationOrientation === 'course') {
      const diff = ((smoothHeading - cameraBearing + 540) % 360) - 180;
      markerRotation = diff;
    } else {
      markerRotation = smoothHeading;
    }
  } else {
    markerRotation = smoothHeading;
  }

  return {
    smoothLocation: smoothLocation || rawLocation,
    smoothHeading,
    markerRotation,
  };
}
