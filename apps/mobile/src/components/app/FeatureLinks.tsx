import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ArrowUpRight, Clock3, Compass, Disc3, Video, UserCircle } from 'lucide-react-native';
import { colors, ui } from './ui';
const links = [
  { title: 'Your moment', detail: 'Mood & discovery', route: '/discovery', icon: Compass },
  { title: 'Music videos', detail: 'Watch & listen', route: '/videos', icon: Video },
  { title: 'Explore catalog', detail: 'Artists & albums', route: '/provider-browse', icon: Disc3 },
  { title: 'Listening history', detail: 'Your confirmed plays', route: '/history', icon: Clock3 },
  { title: 'Your account', detail: 'Profile & collections', route: '/profile', icon: UserCircle },
] as const;
export function FeatureLinks(): React.JSX.Element {
  const router = useRouter();
  return <View style={styles.section}><View style={styles.heading}><Text style={ui.sectionTitle} accessibilityRole="header">Explore</Text><Pressable accessibilityRole="button" style={styles.discovery} onPress={() => router.push('/discovery')}><Text style={styles.open}>Open discovery</Text><ArrowUpRight size={16} color={colors.muted} /></Pressable></View><View style={styles.grid}>
    {links.map(({ title, detail, route, icon: Icon }) => <Pressable key={route} accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`} style={styles.link} onPress={() => router.push(route as Href)}>
      <View style={styles.symbol}><Icon size={19} color={colors.accent} /></View><View style={ui.grow}><Text style={styles.title}>{title}</Text></View>
    </Pressable>)}
  </View></View>;
}
const styles = StyleSheet.create({ section: { padding: 18, paddingTop: 28, gap: 10 }, heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }, discovery: { flexDirection: 'row', gap: 6, minHeight: 44, alignItems: 'center' }, open: { color: colors.muted, fontSize: 11 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, link: { flexBasis: '46%', flexGrow: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.subtle, minHeight: 76, padding: 10, gap: 10 }, symbol: { backgroundColor: colors.raised, width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }, title: { fontSize: 12, fontWeight: '600', color: colors.text }, detail: { fontSize: 10, color: colors.muted, marginTop: 5 } });
