import React, { memo, useEffect, useRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { colors } from '../../design/theme';
import { heartMotion, heartPath } from '../../design/heart-motion';
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One path, no particles/overlay or perpetual animation; interruptible on rapid taps. */
export const MorphingHeart = memo(function MorphingHeart({ selected, reduced, size = 21 }: {
  selected: boolean; reduced: boolean; size?: number;
}): React.JSX.Element {
  const progress = useSharedValue(Number(selected)), scale = useSharedValue(1);
  const previous = useRef(selected);
  useEffect(() => {
    cancelAnimation(progress); cancelAnimation(scale);
    const changed = previous.current !== selected;
    previous.current = selected;
    const config = heartMotion(reduced);
    progress.value = reduced ? Number(selected) : withTiming(Number(selected), { duration: config.duration });
    scale.value = reduced || !changed ? 1 : withSequence(withTiming(config.peakScale, { duration: 90 }), withTiming(1, { duration: 130 }));
    return () => { cancelAnimation(progress); cancelAnimation(scale); };
  }, [selected, reduced, progress, scale]);
  const path = useAnimatedProps(() => ({ d: heartPath(progress.value), fillOpacity: progress.value }));
  const transform = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={transform} pointerEvents="none" accessible={false}>
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <AnimatedPath animatedProps={path} fill={colors.accent} stroke={colors.accent} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  </Animated.View>;
});
