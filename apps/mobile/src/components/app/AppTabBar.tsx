import { BottomTabStrip, bottomTabs } from './BottomTabStrip';
import { activeBottomTab, bottomTabPath, bottomTabTarget, compactDock, type BottomTabName } from './bottom-navigation';
import { useDockKeyboard } from './use-dock-keyboard';
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Tabs, usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { SkipForward } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from '../../design/GlassSurface';
import { Artwork } from '../../design/Artwork';
import { MorphingPlayPause } from '../kobra/MorphingPlayPause';
import { useReducedMotion } from '../../design/useReducedMotion';
import { PlaybackState } from '@aadat/contracts';
import { usePlayerStore } from '../../store/usePlayerStore';
import { colors, IconButton, ui } from './ui';
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];


function MiniProgress(): React.JSX.Element {
  const progress = usePlayerStore(s => s.duration > 0 ? Math.max(0, Math.min(1, s.position / s.duration)) : 0);
  return <View accessible={false} style={styles.progress}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>;
}
function MiniPlayer(): React.JSX.Element | null {
  const router = useRouter(), reduced = useReducedMotion(), path = usePathname();
  const track = usePlayerStore((s) => s.tracks[s.activeTrackIndex]);
  const state = usePlayerStore((s) => s.playbackState);
  if (!track || path === '/rooms') return null;
  const playing = state === PlaybackState.PLAYING;
  return <GlassSurface style={styles.mini}><View style={styles.miniRow}><Pressable style={ui.grow} accessibilityRole="button" accessibilityLabel={`Open player for ${track.title}`}
    onPress={() => router.push('/player')}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Artwork uri={track.artwork} size={38} /><View style={ui.grow}><Text style={styles.miniTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.miniArtist} numberOfLines={1}>{track.artist}</Text></View></View>
  </Pressable><Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={ui.iconButton} onPress={() => { void usePlayerStore.getState().togglePlayPause(); }}><MorphingPlayPause playing={playing} reduced={reduced} size={22} /></Pressable>
    <IconButton icon={SkipForward} label="Next track" onPress={() => { void usePlayerStore.getState().skipToNext(); }} />
  </View><MiniProgress /></GlassSurface>;
}
export function AppTabBar({ state, descriptors, navigation }: TabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets(), keyboard = useDockKeyboard();
  const items = state.routes.flatMap(route => route.name in bottomTabs ? [{ name: route.name as BottomTabName, key: route.key, label: descriptors[route.key]?.options.tabBarAccessibilityLabel }] : []);
  const current = state.routes[state.index]?.name;
  return <View importantForAccessibility={keyboard ? 'no-hide-descendants' : 'auto'} style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom), paddingLeft: insets.left, paddingRight: insets.right }, keyboard && styles.keyboardHidden]}><MiniPlayer /><BottomTabStrip items={items} selected={items.find(item => item.name === current)?.name ?? null}
    select={name => {
      const route = state.routes.find(item => item.name === name); if (!route || name === current) return;
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!event.defaultPrevented) navigation.navigate(route.name, route.params);
    }} longPress={name => { const route = state.routes.find(item => item.name === name); if (route) navigation.emit({ type: 'tabLongPress', target: route.key }); }} />
  </View>;
}
/** The reference dock remains reachable on secondary screens as well as the four tabs. */
export function AppDock(): React.JSX.Element | null {
  const router = useRouter(), path = usePathname(), insets = useSafeAreaInsets(), state = useRootNavigationState();
  const keyboard = useDockKeyboard();
  const { width, height, fontScale } = useWindowDimensions();
  const compact = compactDock(width, height, fontScale, insets.left, insets.right);
  const hasTrack = usePlayerStore(s => !!s.tracks[s.activeTrackIndex]);
  if (path === '/player' || path === '/login') return null;
  return <View importantForAccessibility={keyboard ? 'no-hide-descendants' : 'auto'} style={[styles.bar, compact && styles.compact, { paddingBottom: Math.max(8, insets.bottom), paddingLeft: insets.left, paddingRight: insets.right }, keyboard && styles.keyboardHidden]}>{hasTrack && path !== '/rooms' && <View style={compact && ui.grow}><MiniPlayer /></View>}<View style={compact && ui.grow}>
    <BottomTabStrip selected={activeBottomTab(path,state)} select={name => { const route = bottomTabPath(name); if (route !== path) router.navigate(bottomTabTarget(name,state)); }} />
  </View></View>;
}
const styles = StyleSheet.create({
  compact: { flexDirection: 'row', alignItems: 'center' },
  bar: { backgroundColor: colors.subtle, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  mini: { marginHorizontal: 9, marginTop: 6, borderRadius: 16 }, miniRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 4, minHeight: 60 },
  progress: { height: 2, backgroundColor: colors.line }, progressFill: { height: 2, backgroundColor: colors.success },
  miniTitle: { color: colors.text, fontWeight: '600', fontSize: 13 }, miniArtist: { color: colors.muted, fontSize: 11, marginTop: 5 },
  keyboardHidden: { display: 'none' },
});
