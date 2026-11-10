import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Music2 } from 'lucide-react-native';
import { colors } from './theme';
export function Artwork({ uri, size = 52 }: { uri?: string; size?: number }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return <View style={[styles.frame, { width: size, height: size, borderRadius: Math.min(20, size / 4) }]}>
    {uri && !failed ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} fadeDuration={0} accessible={false} /> : <Music2 size={size * 0.4} color={colors.accent} />}
  </View>;
}
const styles = StyleSheet.create({ frame: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
