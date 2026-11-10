import { PlaylistListSkeleton } from '../components/loading/Skeleton';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bookmark, ChevronRight, Heart, ListMusic, Star } from 'lucide-react-native';
import { useLibraryStore } from '../store/useLibraryStore';
import { CreatePlaylistSheet, TrackActionsSheet } from '../components/library/LibrarySheets';
import { demoCatalog } from '../catalog/demo-catalog';
import { useCatalogStore } from '../store/useCatalogStore';
import { uniqueTracks } from '../catalog/unique-tracks';
import { usePlayerStore } from '../store/usePlayerStore';
import { SongRow } from '../components/catalog/SongList';
import { useListInteraction } from '../components/lists/use-list-interaction';
import type { LocalPlaylist } from '../library/library.contract';
import type { IPlayableTrack } from '../data/sample-tracks';
import { Button, colors, EmptyState, PageHeader, ui } from '../components/app/ui';
export default function LibraryScreen(): React.JSX.Element {
  const router = useRouter(), data = useLibraryStore((s) => s.data), status = useLibraryStore((s) => s.status);
  const scopeVersion = useLibraryStore((s) => s.scopeVersion);
  const {guard,list,handlers}=useListInteraction<LocalPlaylist>('library');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<IPlayableTrack | null>(null);
  const revision = useCatalogStore(s => s.revision);
  const recent = useMemo(() => uniqueTracks(demoCatalog.tracks([...new Set([...data.warehouse, ...data.likes, ...data.favourites, ...data.bookmarks])].reverse())).slice(0, 8), [data, revision]);
  useEffect(() => { setCreating(false); setSelected(null); }, [scopeVersion]);
  return <SafeAreaView style={ui.screen} edges={['left', 'right']}><FlatList ref={list} {...handlers} data={data.playlists} keyExtractor={(p) => p.id}
    initialNumToRender={8} windowSize={5} contentContainerStyle={{ paddingBottom: 24 }}
    ListHeaderComponent={<View><PageHeader eyebrow="" title="Your library" />
      {status === 'loading' && data.playlists.length>0 && <ActivityIndicator size="small" color={colors.accent} accessibilityLabel="Loading account library" />}
      <View style={styles.collections}>{([{ kind: 'likes', title: 'Liked Tracks', icon: Heart }, { kind: 'favourites', title: 'Favourites', icon: Star }, { kind: 'bookmarks', title: 'Bookmarks', icon: Bookmark }] as const).map(({ kind, title, icon: Icon }) =>
        <Pressable key={kind} style={styles.collection} accessibilityRole="button" onPress={() => router.push({ pathname: '/collection', params: { kind } })}>
          <View style={styles.symbol}><Icon size={22} color={colors.accent} /></View><View style={ui.grow}><Text style={styles.name}>{title}</Text></View><ChevronRight size={18} color={colors.muted} />
        </Pressable>)}
      </View>
      <View style={styles.playlistHeading}><View><Text style={ui.sectionTitle}>Playlists</Text></View><Button title="New playlist" secondary disabled={status !== 'ready'} onPress={() => setCreating(true)} /></View>
    </View>}
    ListEmptyComponent={status === 'loading' ? <PlaylistListSkeleton /> : status==='error' ? null : <EmptyState title="No playlists yet" />}
    ListFooterComponent={recent.length ? <View><View style={{ padding: 18, paddingTop: 26, gap: 6 }}><Text style={ui.sectionTitle}>Your saved songs</Text></View>{recent.map(track => <SongRow key={track.id} track={track} onMenu={() => setSelected(track)} onPlay={() => { if(!guard.allowPress())return; void usePlayerStore.getState().playQueue(recent, track.id, 'Your library'); router.push('/player'); }} />)}</View> : null}
    renderItem={({ item }) => <Pressable accessibilityRole="button" style={styles.playlist} accessibilityLabel={`Open playlist ${item.name}`} onPress={() => router.push({ pathname: '/playlist', params: { id: item.id } })}>
      <View style={styles.playlistIcon}><ListMusic size={26} color={colors.accent} /></View><View style={ui.grow}><Text style={styles.name} numberOfLines={1}>{item.name}</Text></View><ChevronRight size={18} color={colors.muted} />
    </Pressable>} />
    <CreatePlaylistSheet visible={creating} close={() => setCreating(false)} created={(id) => { setCreating(false); router.push({ pathname: '/playlist', params: { id } }); }} />
    <TrackActionsSheet trackId={selected?.id ?? null} fallbackTrack={selected ?? undefined} close={() => setSelected(null)} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  collections: { gap: 10, marginHorizontal: 18 }, collection: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, padding: 14, borderRadius: 16 },
  symbol: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.darkAccent, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 4 }, playlistHeading: { flexWrap: 'wrap', padding: 18, paddingTop: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  playlist: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 24 }, playlistIcon: { width: 58, height: 62, borderRadius: 18, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
});
