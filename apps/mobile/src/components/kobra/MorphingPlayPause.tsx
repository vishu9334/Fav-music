import React, { useEffect } from 'react';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import { playbackPolygon } from '../../design/playback-geometry';
import { colors } from '../../design/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface MorphingPlayPauseProps {
  playing: boolean;
  reduced: boolean;
  size?: number;
  color?: string;
}

/** Smooth equal-vertex morphing between Play triangle and Pause bars inspired by Kobra Systems. */
export function MorphingPlayPause({
  playing,
  reduced,
  size = 28,
  color = colors.mediaForeground,
}: MorphingPlayPauseProps): React.JSX.Element {
  const progress = useSharedValue(playing ? 1 : 0);

  useEffect(() => {
    progress.value = reduced
      ? Number(playing)
      : withSpring(Number(playing), { damping: 14, stiffness: 180 });
  }, [playing, reduced, progress]);

  const left = useAnimatedProps(() => ({
    d: 'M' + playbackPolygon(progress.value, false) + 'Z',
  }));

  const right = useAnimatedProps(() => ({
    d: 'M' + playbackPolygon(progress.value, true) + 'Z',
  }));

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} pointerEvents="none">
      <AnimatedPath
        animatedProps={left}
        fill={color}
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <AnimatedPath
        animatedProps={right}
        fill={color}
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
