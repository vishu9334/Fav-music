import React, { useId } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { NativeBackdrop } from './NativeBackdrop';
import { colors, radius } from './theme';
/** Bounded native backdrop blur for transport bubbles; inexpensive tint for scrolling surfaces. */
export function GlassSurface({ children, style, backdrop = false, reduceEffects = false, ...props }: ViewProps & { backdrop?: boolean; reduceEffects?: boolean }): React.JSX.Element {
  const id = 'glass' + useId().replace(/:/g, '');
  return <View {...props} style={[styles.surface, style]}>
    {backdrop && <><NativeBackdrop reducedEffects={reduceEffects} />
    <Svg pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor={colors.mediaForeground} stopOpacity="0.1" /><Stop offset="1" stopColor={colors.accent} stopOpacity="0.035" /></LinearGradient><RadialGradient id={id + 'lens'} cx="18%" cy="0%" rx="95%" ry="80%"><Stop offset="0" stopColor={colors.mediaForeground} stopOpacity="0.18" /><Stop offset="1" stopColor={colors.accent} stopOpacity="0.04" /></RadialGradient><LinearGradient id={id + 'rim'} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor={colors.mediaForeground} stopOpacity="0.55" /><Stop offset="0.45" stopColor={colors.mediaForeground} stopOpacity="0.05" /><Stop offset="1" stopColor={colors.accent} stopOpacity="0.45" /></LinearGradient></Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
      {backdrop && <><Rect width="100%" height="100%" fill={`url(#${id}lens)`} /><Rect x="1%" y="1%" width="98%" height="98%" rx="50%" ry="50%" fill="none" stroke={`url(#${id}rim)`} strokeWidth={1.2} /></>}
    </Svg></>}{children}
  </View>;
}
const styles = StyleSheet.create({ surface: { backgroundColor: colors.panel, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' } });
