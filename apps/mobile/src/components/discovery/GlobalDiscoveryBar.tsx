import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Shuffle, SlidersHorizontal } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDiscoveryStore } from '../../store/useDiscoveryStore';
import { colors, IconButton } from '../app/ui';

/** Mounted once outside the navigation stack, including on the full player. */
export function GlobalDiscoveryBar(): React.JSX.Element {
  const insets = useSafeAreaInsets(), router = useRouter(), path = usePathname();
  const period = useDiscoveryStore((s) => s.period), weather = useDiscoveryStore((s) => s.weather), mood = useDiscoveryStore((s) => s.mood), busy = useDiscoveryStore((s) => s.busy);
  const season = useDiscoveryStore((s) => s.season), decade = useDiscoveryStore((s) => s.decade);
  const message = useDiscoveryStore((s) => s.message), historyError = useDiscoveryStore((s) => s.historyError);
  const notice = historyError ? 'Listening history needs attention. Open discovery to retry.' : message;
  const caption = [period ?? 'Check device time', weather, mood ?? 'Any mood', season, decade, 'Music'].filter(Boolean).join(' · ');
  return <View style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom), paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }]}>
    <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel={`Play a suitable random song. ${period ?? 'Time unavailable'}. ${mood ?? 'Any mood'}.`}
      accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => { void useDiscoveryStore.getState().playRandom(); }} style={styles.play}>
      <Shuffle size={19} color={colors.accent} /><View style={{ flex: 1 }}><Text style={styles.title}>{busy ? 'Finding your next track…' : 'Play something'}</Text><Text style={styles.caption} numberOfLines={1}>{caption}</Text></View>
    </Pressable><IconButton icon={SlidersHorizontal} label="Open mood, season and year discovery filters" onPress={() => { if (path !== '/discovery') router.push('/discovery'); }} /></View>
    {notice && <Text numberOfLines={2} style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  bar: { backgroundColor: colors.subtle, borderTopWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 }, play: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontWeight: '600', fontSize: 13 }, caption: { color: colors.muted, fontSize: 11, marginTop: 4 },
  notice: { color: colors.muted, fontSize: 11, lineHeight: 16, paddingVertical: 6 },
});
