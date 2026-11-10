import React, { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { PlaybackState } from '@aadat/contracts';
import { KobraPlaybackControls } from '../components/kobra/KobraPlaybackControls';
import { ArtworkCarousel } from '../components/carousel/ArtworkCarousel';
import { Scrubber } from '../components/player/Scrubber';
import { Button, colors, IconButton, ui } from '../components/app/ui';
import { GlassSurface } from '../design/GlassSurface';
import { Artwork } from '../design/Artwork';
import { useFlowingTransport } from '../design/layout-policy';
import { VisualReviewHub } from './VisualReviewHub';
import { DevelopmentPlaybackController, type DiagnosticState } from './development-playback.controller';

/** Subscribe to stable presentation fields; progress ticks only rerender the transport dock. */
function useValue<K extends keyof DiagnosticState>(controller: DevelopmentPlaybackController, key: K): DiagnosticState[K] {
  const get = useCallback(() => controller.snapshot()[key], [controller, key]);
  return useSyncExternalStore(controller.subscribe, get, get);
}
const DiagnosticTransport = memo(function DiagnosticTransport({ controller, compact }: { controller: DevelopmentPlaybackController; compact: boolean }) {
  const position = useValue(controller, 'position'), duration = useValue(controller, 'duration'), buffered = useValue(controller, 'buffered');
  const playback = useValue(controller, 'playback'), tracks = useValue(controller, 'tracks'), index = useValue(controller, 'active');
  const active = tracks[index];
  return <GlassSurface style={[styles.dock, compact && styles.compactDock]}><View style={compact ? ui.grow : undefined}><View style={styles.nowPlaying}><View style={ui.grow}><Text style={styles.trackTitle} numberOfLines={1}>{active?.title ?? 'Choose a song'}</Text><Text style={ui.subtitle} numberOfLines={1}>{active?.artist ?? 'Search the real development catalog'}</Text></View><Text style={styles.status} accessibilityLiveRegion="polite">{playback ?? 'IDLE'}</Text></View>
    <Scrubber position={position} duration={duration} buffered={buffered} disabled={!active} onSeek={seconds => controller.seek(seconds)} /></View>
    <View><KobraPlaybackControls playbackState={playback ?? PlaybackState.IDLE} disabled={!active} onPlayPause={() => controller.toggle()} onPrevious={() => controller.previous()} onNext={() => controller.next()} />
    <View style={styles.utility}><Pressable accessibilityRole="button" accessibilityLabel="Stop and retain playback queue" disabled={!active} onPress={() => controller.stop()} style={styles.utilityButton}><Text style={styles.utilityText}>Stop</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Retry or resume playback" disabled={!active} onPress={() => controller.retry()} style={styles.utilityButton}><Text style={styles.utilityText}>Retry / resume</Text></Pressable></View></View>
  </GlassSurface>;
});
export default function DevelopmentPlaybackScreen(): React.JSX.Element {
  const [controller] = useState(() => new DevelopmentPlaybackController());
  const unlocked = useValue(controller, 'unlocked'), busy = useValue(controller, 'busy'), songs = useValue(controller, 'songs');
  const message = useValue(controller, 'message'), queue = useValue(controller, 'tracks'), index = useValue(controller, 'active'), cursor = useValue(controller, 'cursor');
  const { width, height, fontScale } = useWindowDimensions();
  const flowing = useFlowingTransport(width, height, fontScale);
  const [review, setReview] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [query, setQuery] = useState('Believer'), [covers, setCovers] = useState<ReadonlyMap<string, string>>(new Map());
  const secret = useRef(''), input = useRef<TextInput>(null), searchInput = useRef<TextInput>(null);
  useEffect(() => { const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true)), hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false)); return () => { show.remove(); hide.remove(); }; }, []);
  useEffect(() => { const sub = AppState.addEventListener('change', status => { if (status === 'active') controller.checkExpiry(); }); return () => { secret.current = ''; sub.remove(); void controller.dispose(); }; }, [controller]);
  useEffect(() => { let alive = true; if (!unlocked) { setCovers(new Map()); return; } const ids = songs.map(s => s.id); if (ids.length) void controller.artwork(ids).then(urls => { if (alive) setCovers(previous => new Map([...previous, ...urls].slice(-200))); }).catch(() => {}); return () => { alive = false; }; }, [controller, songs, unlocked]);
  const search = () => { searchInput.current?.blur(); Keyboard.dismiss(); void controller.search(query); };
  const artworkQueue = queue.map(track => ({ ...track, artwork: covers.get(track.id) ?? track.artwork }));
  const verify = () => {
    if (busy) return;
    const value = secret.current; secret.current = ''; input.current?.clear(); input.current?.blur(); Keyboard.dismiss(); void controller.unlock(value);
  };
  const heading = <View><View style={styles.heading}><View style={ui.grow}><Text style={ui.eyebrow}>AADAT MUSIC</Text><Text style={styles.title}>Playback verification</Text></View>{unlocked && <IconButton icon={X} label="Close development catalog access" onPress={() => { void controller.lock(); }} />}</View><View style={{paddingHorizontal:20,paddingTop:12}}><Button title="Open visual acceptance review" secondary onPress={() => { input.current?.blur(); Keyboard.dismiss(); setReview(true); }} /></View><Text style={styles.disclosure}>Internal · Read-only catalog · Account features remain protected</Text></View>;
  const searchBar = <View style={styles.search}><TextInput ref={searchInput} value={query} onChangeText={setQuery} accessibilityLabel="Search actual provider songs" placeholder="Songs or artists" placeholderTextColor={colors.muted} returnKeyType="search" onSubmitEditing={search} style={styles.searchInput} /><IconButton icon={Search} label="Search real catalog" disabled={busy} onPress={search} /></View>;
  return <SafeAreaProvider><SafeAreaView style={ui.screen}>
    {!unlocked ? <KeyboardAvoidingView style={ui.grow} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.access}>
      {heading}<GlassSurface style={styles.accessCard}><Text style={ui.sectionTitle}>Your real-song listening check</Text><Text style={ui.body}>Enter the private, expiring developer key. This opens catalog playback only; it does not sign in to an account.</Text>
        <TextInput ref={input} secureTextEntry autoCorrect={false} autoCapitalize="none" accessibilityLabel="Private development catalog key" placeholder="Private developer key" placeholderTextColor={colors.muted} onChangeText={value => { secret.current = value; }} style={ui.input} textContentType="none" importantForAutofill="no" returnKeyType="done" onSubmitEditing={verify} />
        <Button title={busy ? 'Verifying…' : 'Verify read-only access'} disabled={busy} onPress={verify} /><Text style={ui.subtitle} accessibilityLiveRegion="polite">{message}</Text>
      </GlassSurface>
    </ScrollView></KeyboardAvoidingView> : <>
      {!flowing && <>{heading}{searchBar}</>}
      <FlatList data={songs} keyExtractor={item => item.id} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.results}
        ListHeaderComponent={<View>{flowing && <>{heading}{searchBar}</>}{queue.length > 0 && <ArtworkCarousel tracks={artworkQueue} activeIndex={index} onTrackSelect={selected => controller.select(selected)} />}<View style={{paddingHorizontal:20}}><Text style={ui.subtitle} accessibilityLiveRegion="polite">{message}</Text><Text style={[ui.sectionTitle, { marginTop: 18 }]}>Real catalog · {songs.length}</Text></View></View>}
        ListEmptyComponent={<Text style={[ui.body, { padding: 20 }]}>{busy ? 'Searching…' : 'Search for a song or artist to begin.'}</Text>}
        ListFooterComponent={<View>{cursor && <View style={{ padding: 20 }}><Button title={busy ? 'Loading…' : 'More results'} secondary disabled={busy} onPress={() => { void controller.search(query, true); }} /></View>}{flowing && !keyboardOpen && <DiagnosticTransport controller={controller} compact={false} />}</View>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Play ${item.title} by ${item.artistName}`} disabled={busy} onPress={() => { void controller.play(item.id); }} style={({ pressed }) => [styles.song, pressed && ui.pressed]}><Artwork uri={covers.get(item.id)} /><View style={ui.grow}><Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text><Text style={ui.subtitle} numberOfLines={1}>{item.artistName}</Text><Text style={styles.status}>{item.releaseYear ?? 'Undated'} · {Math.floor(item.durationSeconds / 60)}:{String(item.durationSeconds % 60).padStart(2, '0')}</Text></View></Pressable>} />
      {!flowing && !keyboardOpen && <DiagnosticTransport controller={controller} compact={false} />}
    </>}
    <Modal visible={review} animationType="none" supportedOrientations={['portrait','landscape','landscape-left','landscape-right']} onRequestClose={() => setReview(false)}>{review && <SafeAreaProvider><VisualReviewHub close={() => setReview(false)} /></SafeAreaProvider>}</Modal>
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 }, title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 },
  disclosure: { color: colors.muted, fontSize: 11, lineHeight: 17, paddingHorizontal: 20, paddingVertical: 10 }, access: { flexGrow: 1, paddingBottom: 32 }, accessCard: { padding: 20, gap: 20, margin: 20 },
  search: { marginHorizontal: 20, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, paddingLeft: 16, paddingRight: 4 }, searchInput: { flex: 1, minWidth: 0, minHeight: 52, color: colors.text, fontSize: 16 },
  results: { paddingBottom: 16 }, song: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, trackTitle: { color: colors.text, fontSize: 16, fontWeight: '600' }, status: { color: colors.muted, fontSize: 12, marginTop: 4 },
  compactDock: { flexDirection: 'row', alignItems: 'center', paddingTop: 0 },
  dock: { margin: 12, marginTop: 0, paddingTop: 12 }, nowPlaying: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 }, utility: { flexDirection: 'row', justifyContent: 'center', gap: 20 }, utilityButton: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }, utilityText: { color: colors.muted, fontSize: 12 },
});
