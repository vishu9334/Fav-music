import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bookmark, ChevronDown, Heart, MoreHorizontal, Star, Video } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { PlaybackState } from '@aadat/contracts';
import { ArtworkCarousel } from '../components/carousel/ArtworkCarousel';
import { KobraPlaybackControls } from '../components/kobra/KobraPlaybackControls';
import { RepeatButton } from '../components/player/RepeatButton';
import { Scrubber } from '../components/player/Scrubber';
import { Button, colors, IconButton, LibraryNotice, ui } from '../components/app/ui';
import { TrackActionsSheet } from '../components/library/LibrarySheets';
import { LikeButton } from '../components/library/LikeButton';
import { usePlayerStore } from '../store/usePlayerStore';
import { useLibraryStore } from '../store/useLibraryStore';
import { useListInteraction } from '../components/lists/use-list-interaction';
import type { IPlayableTrack } from '../data/sample-tracks';
import { CollectionKind } from '../library/library.contract';

function SavedAction({ id, kind, label, icon }: { id: string; kind: CollectionKind; label: string; icon: typeof Heart }): React.JSX.Element {
  const selected = useLibraryStore((s) => s.data[kind].includes(id));
  return <IconButton icon={icon} label={`${selected ? 'Remove from' : 'Add to'} ${label}`} selected={selected}
    onPress={() => { void useLibraryStore.getState().toggle(kind, id); }} />;
}
function Timeline(): React.JSX.Element {
  const position = usePlayerStore((s) => s.position), duration = usePlayerStore((s) => s.duration), buffered = usePlayerStore((s) => s.buffered);
  const loading = usePlayerStore((s) => s.playbackState === PlaybackState.LOADING);
  return <Scrubber position={position} duration={duration} buffered={buffered} disabled={loading || duration <= 0}
    onSeek={(seconds) => { void usePlayerStore.getState().seekTo(seconds); }} />;
}
function Transport(): React.JSX.Element {
  const playbackState = usePlayerStore((s) => s.playbackState);
  const reduced = usePlayerStore((s) => s.isReducedMotion);
  const empty = usePlayerStore((s) => !s.tracks[s.activeTrackIndex]);
  const repeatMode = usePlayerStore((s) => s.repeatMode) ?? 'off';
  const repeatCount = usePlayerStore((s) => s.repeatCount) ?? 0;
  return (
    <View style={styles.transportContainer}>
      <View style={styles.sideSlot} />
      <KobraPlaybackControls
        disabled={empty}
        playbackState={playbackState}
        onPlayPause={() => { void usePlayerStore.getState().togglePlayPause(); }}
        onPrevious={() => { void usePlayerStore.getState().skipToPrevious(); }}
        onNext={() => { void usePlayerStore.getState().skipToNext(); }}
        reducedMotion={reduced}
      />
      <View style={styles.sideSlot}>
        <RepeatButton
          mode={repeatMode}
          count={repeatCount}
          disabled={empty}
          onPress={() => { void usePlayerStore.getState().toggleRepeat(); }}
        />
      </View>
    </View>
  );
}
function PlaybackNotice(): React.JSX.Element | null {
  const error = usePlayerStore((s) => s.errorMessage), state = usePlayerStore((s) => s.playbackState);
  if (error) return <View style={styles.error} accessibilityLiveRegion="polite"><Text style={styles.errorText}>{error}</Text>
    <Button title="Try playback again" secondary onPress={() => { void usePlayerStore.getState().play(); }} />
  </View>;
  return <View accessible accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.state}
    accessibilityLabel={state === PlaybackState.BUFFERING ? 'Buffering audio' : state === PlaybackState.LOADING ? 'Loading audio' : state === PlaybackState.PLAYING ? 'Audio playing' : state === PlaybackState.STOPPED ? 'Stopped, ready to resume' : 'Audio paused'} />;
}
export default function PlayerScreen(): React.JSX.Element {
  const router = useRouter();
  const {guard,list,handlers}=useListInteraction<IPlayableTrack>('player');
  const { height, fontScale } = useWindowDimensions();
  const tracks = usePlayerStore((s) => s.tracks), activeIndex = usePlayerStore((s) => s.activeTrackIndex);
  const reducedMotion = usePlayerStore((s) => s.isReducedMotion), label = usePlayerStore((s) => s.queueLabel);
  const [menu, setMenu] = useState(false); const track = tracks[activeIndex];
  return <SafeAreaView style={ui.screen}><FlatList ref={list} {...handlers} data={tracks} keyExtractor={item=>item.id} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} contentContainerStyle={styles.content} ListHeaderComponent={<View>
    <View style={styles.heading}><IconButton icon={ChevronDown} label="Close player" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} /><View style={styles.context}><Text style={styles.eyebrow}>NOW PLAYING</Text><Text style={styles.contextText} numberOfLines={1}>{label}</Text></View>
      <IconButton icon={Video} label="Explore music videos" onPress={() => router.push('/videos')} /><IconButton disabled={!track} icon={MoreHorizontal} label="Track options and playlists" onPress={() => setMenu(true)} />
    </View><View style={{ paddingHorizontal: 20 }}><LibraryNotice /></View>
    <View style={{ paddingTop: height < 680 || fontScale >= 1.3 ? 8 : Math.min(76, height * .07) }}><ArtworkCarousel getSelectionVersion={usePlayerStore.getState().selectionVersion} tracks={tracks} activeIndex={activeIndex} isReducedMotion={reducedMotion} swipeToSelect onTrackSelect={(index) => { void usePlayerStore.getState().skipToIndex(index); }} /></View>
    <View style={styles.metadata}><Text style={styles.album}>{[track?.album, track?.releaseYear].filter(Boolean).join(' · ')}</Text><View style={styles.titleRow}><Text style={styles.title}>{track?.title ?? 'Choose a track'}</Text>
      {track && <View style={styles.actions}><LikeButton trackId={track.id} title={track.title} /><SavedAction id={track.id} kind="favourites" label="Favourites" icon={Star} /><SavedAction id={track.id} kind="bookmarks" label="Bookmarks" icon={Bookmark} /></View>}</View><Text style={styles.artist}>{track?.artist ?? 'Search music'}</Text>
      {track?.attribution && <Text style={styles.album}>{track.attribution.replace(/\bdevelopment catalog\b/gi, 'catalog')}</Text>}
    </View>
    <View style={styles.dockCard}><Timeline /><Transport /><PlaybackNotice /></View>
    <View style={styles.queue}><View style={styles.queueHeading}><Text style={ui.sectionTitle}>Up next</Text></View>
    </View></View>} renderItem={({item,index})=><Pressable accessibilityRole="button" accessibilityLabel={`Play queued track ${item.title}`} accessibilityState={{ selected: index === activeIndex }}
        style={[styles.queueRow, index === activeIndex && { backgroundColor: colors.raised }]} onPress={() => { if(!guard.allowPress())return; void usePlayerStore.getState().playQueue(tracks, item.id, label); }}>
        <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text><View style={ui.grow}><Text style={styles.queueTitle} numberOfLines={1}>{item.title}</Text><Text style={ui.subtitle} numberOfLines={1}>{item.artist}</Text></View>
      </Pressable>} /><TrackActionsSheet trackId={menu && track ? track.id : null} fallbackTrack={track} close={() => setMenu(false)} /></SafeAreaView>;
}
const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 28 }, heading: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  context: { flex: 1, alignItems: 'center', gap: 5 }, eyebrow: { color: colors.text, fontSize: 10, fontWeight: '600', letterSpacing: 1.7 },
  contextText: { color: colors.muted, fontSize: 11 }, metadata: { paddingHorizontal: 18, gap: 7 }, titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  title: { color: colors.text, fontSize: 22, fontWeight: '400', letterSpacing: -0.5, flexGrow: 1, flexShrink: 1, minWidth: 120 },
  artist: { color: colors.muted, fontSize: 13 }, album: { color: colors.muted, fontSize: 10, letterSpacing: .5 }, actions: { flexDirection: 'row', gap: 0 },
  state: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  error: { margin: 20, padding: 16, backgroundColor: colors.errorSurface, borderRadius: 18, gap: 10 }, errorText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  queue: { marginHorizontal: 20, marginTop: 12, borderTopWidth: 1, borderColor: colors.line, paddingTop: 20 }, queueHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 13, minHeight: 64 }, number: { color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'] }, queueTitle: { color: colors.text, fontWeight: '600', fontSize: 14, marginBottom: 4 },
  dockCard: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderRadius: 24,
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  transportContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 8,
  },
  sideSlot: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
