import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Repeat } from 'lucide-react-native';
import type { RepeatCycleMode } from '../../services/playback/types';

export interface RepeatButtonProps {
  mode: RepeatCycleMode;
  count?: number | 'infinite';
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * Repeat control button cycling through:
 * 1st tap: 1 extra repeat (count "1")
 * 2nd tap: 2 extra repeats (count "2")
 * 3rd tap: infinite repeat (count "∞")
 * 4th tap: off
 *
 * Visually displays the count badge right on the repeat icon.
 */
export function RepeatButton({
  mode,
  count,
  onPress,
  disabled = false,
  style,
}: RepeatButtonProps): React.JSX.Element {
  const active = mode !== 'off';

  const badgeText =
    mode === 'infinite'
      ? '∞'
      : typeof count === 'number' && count > 0
      ? String(count)
      : mode === '1'
      ? '1'
      : mode === '2'
      ? '2'
      : null;

  const accessibilityLabel =
    mode === 'off'
      ? 'Repeat off. Tap to repeat once.'
      : mode === '1'
      ? 'Repeat 1 extra time. Tap for 2 extra repeats.'
      : mode === '2'
      ? 'Repeat 2 extra times. Tap for infinite repeat.'
      : 'Repeat infinitely. Tap to turn repeat off.';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active ? styles.buttonActive : styles.buttonInactive,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <View style={styles.iconContainer}>
        <Repeat
          size={20}
          color={active ? '#E9FF60' : 'rgba(255, 255, 255, 0.45)'}
          strokeWidth={active ? 2.4 : 1.8}
        />
        {badgeText !== null && (
          <View style={styles.badge} accessibilityLabel={`Count: ${badgeText}`}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  buttonActive: {
    backgroundColor: 'rgba(233, 255, 96, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233, 255, 96, 0.35)',
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    backgroundColor: '#E9FF60',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: '#161618',
  },
  badgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
    textAlign: 'center',
  },
});

