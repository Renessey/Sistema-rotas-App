/**
 * LassoCanvas — Canvas SVG otimizado para o modo lasso.
 *
 * PROBLEMA ORIGINAL: O componente antigo chamava `setCurrentLassoStroke` em cada
 * evento de `onPanResponderMove`, causando um re-render completo do React para cada
 * pixel desenhado → lentidão perceptível durante o desenho.
 *
 * SOLUÇÃO: Este componente usa `useImperativeHandle` + um ref para o path SVG, e
 * atualiza o path diretamente via `setNativeProps` sem passar pelo reconciliador
 * do React. Isso elimina completamente o custo de re-render durante o traçado.
 *
 * O traçado também é suavizado com interpolação Catmull-Rom para que a linha
 * fique orgânica e fluida (não linha reta).
 */
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
} from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export interface LassoCanvasRef {
  /** Inicia um novo traçado a partir de um ponto inicial */
  beginStroke: (x: number, y: number) => void;
  /** Adiciona um ponto ao traçado atual (chamado a cada move do dedo) */
  addPoint: (x: number, y: number) => void;
  /** Finaliza e limpa o traçado visual */
  clearStroke: () => void;
  /** Retorna os pontos acumulados do traçado atual */
  getPoints: () => Array<[number, number]>;
}

/** Converte um array de pontos em um path SVG suavizado (Catmull-Rom → Bezier) */
function pointsToSmoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${pts[0][0]},${pts[0][1]} L ${pts[1][0]},${pts[1][1]}`;
  }

  let d = `M ${pts[0][0]},${pts[0][1]}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    // Catmull-Rom → Cubic Bezier (tension = 0.4 para traço suave)
    const tension = 0.4;
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }

  return d;
}

const LassoCanvas = forwardRef<LassoCanvasRef>((_, ref) => {
  const pathRef = useRef<any>(null);
  const pointsRef = useRef<Array<[number, number]>>([]);
  const lastPointRef = useRef<[number, number] | null>(null);

  const beginStroke = useCallback((x: number, y: number) => {
    pointsRef.current = [[x, y]];
    lastPointRef.current = [x, y];
    if (pathRef.current) {
      pathRef.current.setNativeProps({ d: `M ${x},${y}` });
    }
  }, []);

  const addPoint = useCallback((x: number, y: number) => {
    const last = lastPointRef.current;
    if (last) {
      // Threshold reduzido para 2px — traçado mais preciso e orgânico
      const dist = Math.hypot(x - last[0], y - last[1]);
      if (dist < 2) return;
    }
    lastPointRef.current = [x, y];
    pointsRef.current.push([x, y]);

    // Atualiza o path SVG diretamente via setNativeProps (sem re-render React)
    if (pathRef.current && pointsRef.current.length >= 2) {
      const smoothPath = pointsToSmoothPath(pointsRef.current);
      pathRef.current.setNativeProps({ d: smoothPath });
    }
  }, []);

  const clearStroke = useCallback(() => {
    pointsRef.current = [];
    lastPointRef.current = null;
    if (pathRef.current) {
      pathRef.current.setNativeProps({ d: '' });
    }
  }, []);

  const getPoints = useCallback((): Array<[number, number]> => {
    return [...pointsRef.current];
  }, []);

  useImperativeHandle(ref, () => ({
    beginStroke,
    addPoint,
    clearStroke,
    getPoints,
  }));

  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path
        ref={pathRef}
        d=""
        fill="none"
        stroke="#818CF8"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
});

LassoCanvas.displayName = 'LassoCanvas';

export default LassoCanvas;
