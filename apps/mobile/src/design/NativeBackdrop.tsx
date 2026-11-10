import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, StyleSheet, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { BlurViewProps } from 'expo-blur';
import { colors } from './theme';
import { useReducedMotion } from './useReducedMotion';
import { allowsNativeBlur } from './glass-policy';
let implementation: React.ComponentType<BlurViewProps> | null | undefined;
/** Lazy view-manager import keeps older APKs safe; there is no fabricated native implementation. */
export function nativeBlurAvailable(): boolean {
  try { return !!requireOptionalNativeModule('ExpoBlurView'); } catch { return false; }
}
function blurComponent(): React.ComponentType<BlurViewProps> | null {
  if (implementation !== undefined) return implementation;
  try { implementation = nativeBlurAvailable() ? (require('expo-blur') as typeof import('expo-blur')).BlurView : null; } catch { implementation = null; }
  return implementation;
}
export function NativeBackdrop({ reducedEffects = false }: { reducedEffects?: boolean }): React.JSX.Element {
  const reduced = useReducedMotion(reducedEffects), [transparent, setTransparent] = useState(false), [active, setActive] = useState(AppState.currentState === 'active');
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const app = AppState.addEventListener('change', value => setActive(value === 'active'));
    let alive = true;
    if (Platform.OS === 'ios') void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (alive) setTransparent(value); }).catch(() => {});
    const accessibility = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setTransparent);
    return () => { alive = false; app.remove(); accessibility.remove(); };
  }, []);
  const permitted = allowsNativeBlur(Platform.OS, Number(Platform.Version), size.width, size.height, active, reduced || transparent);
  const Blur = permitted ? blurComponent() : null;
  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill} onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize(previous => previous.width === width && previous.height === height ? previous : { width, height }); }}>
    {Blur ? <Blur pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill} tint="dark" intensity={24} blurReductionFactor={4} experimentalBlurMethod="dimezisBlurView" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.mediaSurface }]} />}
  </View>;
}
