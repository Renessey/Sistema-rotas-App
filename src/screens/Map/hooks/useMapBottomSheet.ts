import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Animated, Dimensions, PanResponder } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Bottom Sheet Snap Points ────────────────────────────────────────────────
export const SNAP_EXPANDED = Math.round(SCREEN_HEIGHT * 0.94);
export const SNAP_HALF = Math.round(SCREEN_HEIGHT * 0.58);
export const SNAP_COLLAPSED = 105;

export const TRANS_EXPANDED = 0;
export const TRANS_HALF = SNAP_EXPANDED - SNAP_HALF;
export const TRANS_COLLAPSED = SNAP_EXPANDED - SNAP_COLLAPSED;

export function useMapBottomSheet() {
  const sheetTranslateY = useRef(new Animated.Value(TRANS_HALF)).current;
  const currentTranslateRef = useRef(TRANS_HALF);
  const [sheetState, setSheetState] = useState<'expanded' | 'half' | 'collapsed'>('half');

  // Keep currentTranslateRef in sync with animated value
  useEffect(() => {
    const id = sheetTranslateY.addListener(({ value }) => {
      currentTranslateRef.current = value;
    });
    return () => sheetTranslateY.removeListener(id);
  }, [sheetTranslateY]);

  const animateToState = useCallback(
    (nextState: 'expanded' | 'half' | 'collapsed', velocity?: number) => {
      setSheetState(nextState);
      const targetTrans =
        nextState === 'expanded'
          ? TRANS_EXPANDED
          : nextState === 'half'
          ? TRANS_HALF
          : TRANS_COLLAPSED;

      currentTranslateRef.current = targetTrans;

      Animated.spring(sheetTranslateY, {
        toValue: targetTrans,
        velocity: velocity,
        tension: 80,
        friction: 10,
        overshootClamping: true,
        useNativeDriver: true,
      }).start();
    },
    [sheetTranslateY],
  );

  const panStartTranslate = useRef(TRANS_HALF);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation();
          panStartTranslate.current = currentTranslateRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const newTrans = panStartTranslate.current + gestureState.dy;
          const clamped = Math.max(TRANS_EXPANDED, Math.min(TRANS_COLLAPSED, newTrans));
          currentTranslateRef.current = clamped;
          sheetTranslateY.setValue(clamped);
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentT = currentTranslateRef.current;
          const vy = gestureState.vy;

          if (vy > 0.3) {
            animateToState(currentT < TRANS_HALF - 30 ? 'half' : 'collapsed', vy);
            return;
          }
          if (vy < -0.3) {
            animateToState(currentT > TRANS_HALF + 30 ? 'half' : 'expanded', vy);
            return;
          }

          const distToExpanded = Math.abs(currentT - TRANS_EXPANDED);
          const distToHalf = Math.abs(currentT - TRANS_HALF);
          const distToCollapsed = Math.abs(currentT - TRANS_COLLAPSED);
          const minDist = Math.min(distToExpanded, distToHalf, distToCollapsed);

          if (minDist === distToCollapsed) animateToState('collapsed', vy);
          else if (minDist === distToHalf) animateToState('half', vy);
          else animateToState('expanded', vy);
        },
      }),
    [animateToState, sheetTranslateY],
  );

  const handleToggleSnap = useCallback(() => {
    if (sheetState === 'collapsed') animateToState('half');
    else if (sheetState === 'half') animateToState('expanded');
    else animateToState('half');
  }, [sheetState, animateToState]);

  return {
    sheetTranslateY,
    sheetState,
    snapExpanded: SNAP_EXPANDED,
    snapHalf: SNAP_HALF,
    snapCollapsed: SNAP_COLLAPSED,
    transExpanded: TRANS_EXPANDED,
    transHalf: TRANS_HALF,
    transCollapsed: TRANS_COLLAPSED,
    animateToState,
    panResponder,
    handleToggleSnap,
  };
}
