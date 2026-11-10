import React, { useId } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { PlaybackState } from '@aadat/contracts';
import { RotateCcw, RotateCw } from 'lucide-react-native';
import { motion } from '../../design/theme';
import { useReducedMotion } from '../../design/useReducedMotion';
import { MorphingPlayPause } from './MorphingPlayPause';
import { MorphingSkip } from './MorphingSkip';

export interface KobraPlaybackControlsProps {
  playbackState: PlaybackState;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  reducedMotion?: boolean;
  variant?: 'skip' | 'seek';
}

interface LiquidWaterButtonProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled: boolean;
  reduced: boolean;
  children: React.ReactNode;
}

/**
 * Authentic Liquid Water Glass Morphic Button inspired by Kobra Systems (kobra.systems/components/video).
 * Features multi-layered SVG optical refraction:
 * - Radial water volume lens with luminous core
 * - Curved top specular glare ellipse (droplet surface reflection)
 * - Bottom caustic ground-bounce reflection
 * - Caustic glass rim highlight with diamond white clarity
 * - Micro-spring bubble compression physics
 */
function LiquidWaterButton({
  label,
  onPress,
  primary = false,
  disabled,
  reduced,
  children,
}: LiquidWaterButtonProps): React.JSX.Element {
  const scale = useSharedValue(1);
  const rawId = useId();
  const id = 'water' + rawId.replace(/[^a-zA-Z0-9]/g, '');

  const size = primary ? 68 : 52;
  const radius = size / 2;
  const strokeWidth = primary ? 1.6 : 1.3;
  const r = radius - strokeWidth / 2;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = reduced
      ? 1
      : withSpring(primary ? 0.92 : 0.90, {
          damping: motion.damping,
          stiffness: motion.stiffness,
        });
  };

  const handlePressOut = () => {
    scale.value = reduced
      ? 1
      : withSpring(1, {
          damping: motion.damping,
          stiffness: motion.stiffness,
        });
  };

  return (
    <Animated.View style={animatedStyle}>
      <View
        style={[
          styles.waterOrbContainer,
          { width: size, height: size, borderRadius: radius },
          primary ? styles.primaryShadow : styles.secondaryShadow,
        ]}
      >
        {/* SVG Liquid Water Glass Layers */}
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          pointerEvents="none"
          accessible={false}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            {/* 1. Core water volume refraction gradient */}
            <RadialGradient
              id={`${id}-lens`}
              cx={primary ? '38%' : '36%'}
              cy={primary ? '32%' : '30%'}
              r="68%"
            >
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={primary ? 0.42 : 0.34} />
              <Stop offset="35%" stopColor="#FFFFFF" stopOpacity={primary ? 0.20 : 0.15} />
              <Stop offset="70%" stopColor="#38BDF8" stopOpacity={primary ? 0.14 : 0.10} />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={primary ? 0.08 : 0.05} />
            </RadialGradient>

            {/* 2. Top specular glare gradient */}
            <LinearGradient id={`${id}-glare`} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={primary ? 0.88 : 0.80} />
              <Stop offset="45%" stopColor="#FFFFFF" stopOpacity={primary ? 0.35 : 0.25} />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>

            {/* 3. Bottom caustic reflection gradient */}
            <LinearGradient id={`${id}-caustic`} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
              <Stop offset="60%" stopColor="#BAE6FD" stopOpacity={primary ? 0.24 : 0.18} />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={primary ? 0.48 : 0.38} />
            </LinearGradient>

            {/* 4. Caustic glass rim gradient */}
            <LinearGradient id={`${id}-rim`} x1="12%" y1="0%" x2="88%" y2="100%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={primary ? 0.95 : 0.88} />
              <Stop offset="30%" stopColor="#FFFFFF" stopOpacity={0.25} />
              <Stop offset="65%" stopColor="#38BDF8" stopOpacity={0.20} />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={primary ? 0.72 : 0.62} />
            </LinearGradient>
          </Defs>

          {/* Layer A: Base water droplet volume */}
          <Circle
            cx={radius}
            cy={radius}
            r={r}
            fill={`url(#${id}-lens)`}
          />

          {/* Layer B: Top specular glare curved ellipse */}
          <Ellipse
            cx={radius}
            cy={primary ? 13 : 10}
            rx={primary ? 21 : 16}
            ry={primary ? 8 : 6}
            fill={`url(#${id}-glare)`}
          />

          {/* Layer C: Bottom caustic reflection */}
          <Ellipse
            cx={radius}
            cy={primary ? 56 : 43}
            rx={primary ? 18 : 14}
            ry={primary ? 6 : 4.5}
            fill={`url(#${id}-caustic)`}
          />

          {/* Layer D: Caustic glass rim border */}
          <Circle
            cx={radius}
            cy={radius}
            r={r}
            fill="none"
            stroke={`url(#${id}-rim)`}
            strokeWidth={strokeWidth}
          />
        </Svg>

        {/* Pressable button touch target */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={({ pressed }) => [
            styles.touchArea,
            { width: size, height: size, borderRadius: radius },
            disabled && styles.disabled,
            pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
          ]}
        >
          {children}
        </Pressable>
      </View>
    </Animated.View>
  );
}

/**
 * Authentic Liquid Glass Morphic Playback Controls inspired by Kobra Systems.
 * Features specular rim highlights, frosted refraction, multi-layered depth, and morphing icons.
 */
export function KobraPlaybackControls({
  playbackState,
  onPlayPause,
  onPrevious,
  onNext,
  disabled = false,
  style,
  reducedMotion = false,
  variant = 'skip',
}: KobraPlaybackControlsProps): React.JSX.Element {
  const reduced = useReducedMotion(reducedMotion);
  const playing = playbackState === PlaybackState.PLAYING;
  const buffering =
    playbackState === PlaybackState.LOADING || playbackState === PlaybackState.BUFFERING;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.liquidDock}>
        {/* Previous / Rewind */}
        <LiquidWaterButton
          label={variant === 'seek' ? 'Rewind' : 'Previous track'}
          onPress={onPrevious}
          disabled={disabled}
          reduced={reduced}
        >
          {variant === 'seek' ? (
            <RotateCcw size={22} color="#FFFFFF" />
          ) : (
            <MorphingSkip direction="previous" size={22} color="#FFFFFF" />
          )}
        </LiquidWaterButton>

        {/* Center Primary Play/Pause Orb */}
        <LiquidWaterButton
          label={playing ? 'Pause' : 'Play'}
          onPress={onPlayPause}
          primary
          disabled={disabled}
          reduced={reduced}
        >
          {buffering ? (
            <ActivityIndicator color="#FFFFFF" accessibilityLabel="Buffering media" />
          ) : (
            <MorphingPlayPause playing={playing} reduced={reduced} size={30} color="#FFFFFF" />
          )}
        </LiquidWaterButton>

        {/* Next / Forward */}
        <LiquidWaterButton
          label={variant === 'seek' ? 'Fast forward' : 'Next track'}
          onPress={onNext}
          disabled={disabled}
          reduced={reduced}
        >
          {variant === 'seek' ? (
            <RotateCw size={22} color="#FFFFFF" />
          ) : (
            <MorphingSkip direction="next" size={22} color="#FFFFFF" />
          )}
        </LiquidWaterButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  liquidDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingVertical: 4,
  },
  waterOrbContainer: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.42,
    shadowRadius: 16,
    elevation: 8,
  },
  touchArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  primaryPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
  disabled: {
    opacity: 0.35,
  },
});
