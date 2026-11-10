import { colors } from '../../design/theme';
import React from 'react';
import {
  GestureResponderEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface ScrubberProps {
  position: number;
  duration: number;
  buffered: number;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
  showTimeLabels?: boolean;
}

/**
 * Formats seconds into mm:ss timestamp
 */
function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export const Scrubber: React.FC<ScrubberProps> = ({
  position,
  duration,
  buffered,
  onSeek,
  disabled = false,
  showTimeLabels = true,
}) => {
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const bufferedRatio = duration > 0 ? Math.min(1, Math.max(0, buffered / duration)) : 0;

  const handlePress = (event: GestureResponderEvent) => {
    if (disabled || duration <= 0) return;
    const { locationX } = event.nativeEvent;
    // Estimate width from target layout (default 320 for full container)
    event.currentTarget.measure((_x, _y, width) => {
      if (width > 0) {
        const ratio = Math.min(1, Math.max(0, locationX / width));
        onSeek(ratio * duration);
      }
    });
  };

  return (
    <View style={[styles.container, !showTimeLabels && styles.containerCompact]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek slider"
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'increment', label: 'Forward 10 seconds' }, { name: 'decrement', label: 'Back 10 seconds' }]}
        onAccessibilityAction={(event) => {
          if (!disabled && duration > 0) onSeek(Math.max(0, Math.min(duration,
            position + (event.nativeEvent.actionName === 'increment' ? 10 : -10))));
        }}
        accessibilityValue={{
          min: 0,
          max: duration,
          now: position,
          text: `${formatTime(position)} of ${formatTime(duration)}`,
        }}
        style={[styles.touchableArea, !showTimeLabels && styles.touchableAreaCompact]}
      >
        <View style={styles.trackBackground}>
          {/* Buffered Progress */}
          <View
            style={[
              styles.bufferedBar,
              { width: `${bufferedRatio * 100}%` },
            ]}
          />
          {/* Active Playback Progress */}
          <View
            style={[
              styles.progressBar,
              { width: `${progressRatio * 100}%` },
            ]}
          />
          {/* Thumb Indicator */}
          <View
            style={[
              styles.thumb,
              { left: `${progressRatio * 100}%` },
            ]}
          />
        </View>
      </TouchableOpacity>

      {/* Time Labels */}
      {showTimeLabels && (
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 24,
    marginVertical: 12,
  },
  containerCompact: {
    paddingHorizontal: 12,
    marginVertical: 0,
  },
  touchableArea: {
    height: 44,
    justifyContent: 'center',
  },
  touchableAreaCompact: {
    height: 20,
    justifyContent: 'center',
  },
  trackBackground: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.mediaTrack,
    overflow: 'visible',
    position: 'relative',
  },
  bufferedBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.mediaBuffered,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.mediaForeground,
  },
  thumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.mediaForeground,
    marginLeft: -6,
    // Subtle shadow
    shadowColor: colors.mediaBackground,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    fontSize: 12,
    color: colors.mediaMuted,
    fontVariant: ['tabular-nums'],
  },
});

