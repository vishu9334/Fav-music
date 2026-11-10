import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** Hide the dock when Android resizes for the IME; no keyboard-owned screen is unmounted. */
export function useDockKeyboard(): boolean {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    // Close the mount/subscription gap if the IME was already opening.
    setVisible(Keyboard.isVisible());
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}
