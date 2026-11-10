import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { demoCatalog } from '../catalog/demo-catalog';
import { shareLinks, sharedContentLoader } from '../sharing/sharing';
import type { SharedReviewData } from '../sharing/shared-content.loader';
import { useLibraryStore } from '../store/useLibraryStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { Button, EmptyState, PageHeader, ui } from '../components/app/ui';
import { GlassSurface } from '../design/GlassSurface';
import { PlaylistNamingService } from '../library/playlist-naming.service';
import { CollectionScopeGuard } from '../library/scope-guard';
import { SONG_NOT_FOUND } from '../sharing/track-availability';

const naming = new PlaylistNamingService(demoCatalog);
export default function SharedContentScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ payload?: string }>(), router = useRouter();
  const status = useLibraryStore((s) => s.status);
  const scopeVersion = useLibraryStore((s) => s.scopeVersion);
  const [attempt, setAttempt] = useState(0);
  const parsed = useMemo(() => {
    try { return { content: shareLinks.parse(params.payload), error: null }; }
    catch (e) { return { content: null, error: e instanceof Error ? e.message : 'This link is unavailable.' }; }
  }, [params.payload]);
  const identity = typeof params.payload === 'string' ? params.payload : '';
  const key = `${scopeVersion}:${identity}:${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; data: SharedReviewData | null; error: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (parsed.content) void sharedContentLoader.load(parsed.content, () => active && useLibraryStore.getState().scopeVersion === scopeVersion)
      .then(data => { if (active) setLoaded({ key, data, error: null }); })
      .catch(() => { if (active) setLoaded({ key, data: null, error: 'This song could not be loaded. Check your connection and retry.' }); });
    return () => { active = false; };
  }, [key, parsed.content, scopeVersion]);
  const review = loaded?.key === key ? loaded : null;
  // A second incoming link must have its own review/confirmation state.
  return <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}><ScrollView contentContainerStyle={{ paddingBottom: 28 }}><PageHeader back title="Shared with you" />
    {!parsed.content ? <EmptyState title="Link unavailable" message={parsed.error ?? 'This link is invalid.'}><Button title="Open Home" onPress={() => router.replace('/')} /></EmptyState>
      : !review ? <Text style={[ui.body, { padding: 20 }]} accessibilityLiveRegion="polite">Loading shared music…</Text>
      : review.error || !review.data ? <EmptyState title="Shared music unavailable" message={review.error ?? 'This song is unavailable.'}><Button title="Retry" onPress={() => setAttempt(value => value + 1)} /></EmptyState>
      : <SharedReview key={key} title={parsed.content.type === 'playlist' ? parsed.content.name : review.data.tracks[0]?.title ?? SONG_NOT_FOUND}
        playlist={parsed.content.type === 'playlist'} ids={review.data.ids} tracks={review.data.tracks} unavailable={review.data.unavailable} ready={status === 'ready'} />}
  </ScrollView></SafeAreaView>;
}
export function SharedReview({ title, playlist, ids, tracks, unavailable, ready }: {
  title: string; playlist: boolean; ids: readonly string[]; tracks: SharedReviewData['tracks']; unavailable: number; ready: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [savedId, setSavedId] = useState<string | null>(null);
  const saving = useRef(false), opening = useRef(false), alive = useRef(true);
  const [playError, setPlayError] = useState<string | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const bookmarked = useLibraryStore((s) => !playlist && !!tracks[0] && s.data.bookmarks.includes(tracks[0].id));
  const save = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true);
    try {
      const store = useLibraryStore.getState();
      const name = naming.availableName(title, store.data.playlists.map((p) => p.name));
      const id = await store.createPlaylist(name, ids); if (id) setSavedId(id);
    } finally { saving.current = false; setBusy(false); }
  };
  const play = async () => {
    const first = tracks[0]; if (!first || opening.current || !ready) return;
    opening.current = true; setPlayError(null);
    const guard = new CollectionScopeGuard(useLibraryStore.getState);
    try {
      await usePlayerStore.getState().playQueue(tracks, first.id, title);
      if (!alive.current || !guard.valid()) return;
      const player = usePlayerStore.getState();
      if (player.tracks[player.activeTrackIndex]?.id !== first.id || player.errorMessage) throw new Error('This shared song could not be played. Please retry.');
      router.push('/player');
    } catch (error) { if (alive.current && guard.valid()) setPlayError(error instanceof Error ? error.message : 'Playback is unavailable.'); }
    finally { opening.current = false; }
  };
  return <GlassSurface style={{ marginHorizontal: 20, padding: 20, gap: 16 }}><Text style={ui.sectionTitle}>{title}</Text>
    {unavailable > 0 && <Text style={ui.body}>Some songs unavailable</Text>}
    {tracks.map((track) => <View key={track.id}><Text style={ui.sectionTitle}>{track.title}</Text><Text style={ui.subtitle}>{track.artist}</Text></View>)}
    <Button title="Play shared tracks" disabled={!ready || tracks.length === 0} onPress={() => { void play(); }} />
    {playError && <Text style={ui.body} accessibilityRole="alert">{playError}</Text>}
    {playlist && (savedId ? <Button title="Open saved playlist" onPress={() => router.replace({ pathname: '/playlist', params: { id: savedId } })} />
      : <Button title={busy ? 'Saving…' : 'Save to your playlists'} secondary disabled={!ready || busy || ids.length === 0} onPress={() => { void save(); }} />)}
    {!playlist && tracks[0] && <Button title={bookmarked ? 'Remove track bookmark' : 'Bookmark this track'} secondary disabled={!ready}
      onPress={() => { if (tracks[0]) void useLibraryStore.getState().toggle('bookmarks', tracks[0].id); }} />}
    
  </GlassSurface>;
}
