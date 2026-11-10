import { Animated } from 'react-native';

/** One native opacity animation per group, never one timer/loop per placeholder. */
export function startSkeletonMotion(opacity: Animated.Value, reduced: boolean): () => void {
  let loop: Animated.CompositeAnimation | undefined;
  opacity.setValue(0);
  const timer = setTimeout(() => {
    opacity.setValue(0.65);
    if (reduced) return;
    loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 950, useNativeDriver: true, isInteraction: false }),
      Animated.timing(opacity, { toValue: 0.65, duration: 950, useNativeDriver: true, isInteraction: false }),
    ]));
    loop.start();
  }, 160);
  return () => { clearTimeout(timer); loop?.stop(); opacity.stopAnimation(); opacity.setValue(0); };
}
