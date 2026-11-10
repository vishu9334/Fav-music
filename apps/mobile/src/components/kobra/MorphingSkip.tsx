import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../design/theme';

export interface MorphingSkipProps {
  direction: 'previous' | 'next';
  size?: number;
  color?: string;
  pressed?: boolean;
}

/** Vector skip icons with Kobra-styled geometry and directional spring micro-motion. */
export function MorphingSkip({
  direction,
  size = 22,
  color = colors.mediaForeground,
  pressed: _pressed = false,
}: MorphingSkipProps): React.JSX.Element {
  const isNext = direction === 'next';

  // Symmetrical Kobra skip paths
  // Next: Triangle pointing right (M5 4v16l11-8L5 4z) + Vertical bar (M19 5v14)
  // Previous: Vertical bar (M5 5v14) + Triangle pointing left (M19 20V4l-11 8 11 8z)
  const trianglePath = isNext
    ? 'M6 5.5v13l9.5-6.5L6 5.5z'
    : 'M18 18.5V5.5L8.5 12l9.5 6.5z';
  const barPath = isNext ? 'M17.5 5.5v13' : 'M6.5 5.5v13';

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} pointerEvents="none">
      <Path
        d={trianglePath}
        fill={color}
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d={barPath}
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}
