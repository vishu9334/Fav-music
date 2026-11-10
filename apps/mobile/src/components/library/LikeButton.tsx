import React, { memo } from 'react';
import { Platform, Pressable, Vibration } from 'react-native';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { ui } from '../../design/styles';
import { MorphingHeart } from '../kobra/MorphingHeart';

/** All song surfaces share the same account-bound selector and tactile action. */
export const LikeButton = memo(function LikeButton({ trackId, title }: { trackId: string; title: string }): React.JSX.Element {
  const selected = useLibraryStore(s => s.data.likes.includes(trackId));
  const ready = useLibraryStore(s => s.status === 'ready');
  const scopeVersion = useLibraryStore(s => s.scopeVersion);
  const reduced = usePlayerStore(s => s.isReducedMotion);

  const handlePress = () => {
    // Tactile sensory feedback inspired by Kobra Systems micro-interactions
    try {
      Vibration.vibrate(Platform.OS === 'android' ? 12 : 10);
    } catch {
      // Safe fallback if vibration hardware is restricted
    }
    const state = useLibraryStore.getState();
    if (state.scopeVersion === scopeVersion && state.status === 'ready') {
      void state.toggle('likes', trackId);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${selected ? 'Unlike' : 'Like'} ${title}`}
      accessibilityState={{ selected, disabled: !ready }}
      disabled={!ready}
      style={({ pressed }) => [ui.iconButton, pressed && ui.pressed, !ready && ui.disabled]}
      onPress={handlePress}
    >
      <MorphingHeart selected={selected} reduced={reduced} />
    </Pressable>
  );
});
