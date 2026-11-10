import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LucideIcon } from 'lucide-react-native';
import { colors } from '../../design/theme';
import { useReducedMotion } from '../../design/useReducedMotion';

export interface MorphingTabIconProps {
  icon: LucideIcon;
  active: boolean;
  size?: number;
}

/**
 * Kobra-inspired morphing tab icon with fluid spring scaling,
 * glowing accent state, and active specular aura.
 */
export function MorphingTabIcon({
  icon: Icon,
  active,
  size = 21,
}: MorphingTabIconProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const scale = useSharedValue(active ? 1.08 : 1);
  const glow = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      scale.value = active ? 1.08 : 1;
      glow.value = active ? 1 : 0;
    } else {
      scale.value = withSpring(active ? 1.12 : 1, { damping: 13, stiffness: 200 });
      glow.value = withSpring(active ? 1 : 0, { damping: 14, stiffness: 180 });
    }
  }, [active, reduced, scale, glow]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <View style={styles.container}>
      {/* Subtle active glow backdrop */}
      <Animated.View style={[styles.glowBackdrop, glowStyle]} pointerEvents="none" />
      <Animated.View style={animatedStyle}>
        <Icon
          size={size}
          strokeWidth={active ? 2.4 : 1.8}
          color={active ? colors.accent : colors.muted}
          accessible={false}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 44,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowBackdrop: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
  },
});
