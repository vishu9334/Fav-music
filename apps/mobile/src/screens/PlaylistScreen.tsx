import React, { useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { demoCatalog } from '../catalog/demo-catalog';
import { useLibraryStore } from '../store/useLibraryStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { SongList } from '../components/catalog/SongList';
import { Button, EmptyState, PageHeader, ui } from '../components/app/ui';
import { RenamePlaylistSheet } from '../components/library/LibrarySheets';
import { ShareButton } from '../components/app/ShareButton';
import { shareLinks } from '../sharing/sharing';
import { useCatalogStore } from '../store/useCatalogStore';
export default function PlaylistScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>(), router = useRouter();
  const scopeVersion = useLibraryStore((s) => s.scopeVersion), ownerVersion = useRef(scopeVersion);
  const playlist = useLibraryStore((s) => s.data.playlists.find((p) => p.id === id));
  const status = useLibraryStore((s) => s.status), [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const revision = useCatalogStore((s) => s.revision);
  const saved = useMemo(() => demoCatalog.tracks(playlist?.trackIds ?? []), [playlist, revision]);
  const all = useMemo(() => demoCatalog.tracks(), [revision]);
  const missing = playlist?.trackIds.filter((id) => !demoCatalog.has(id)) ?? [];
  if (status === 'loading' && !playlist) return <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}><SongList tracks={[]} label="Your playlist" loading loadingLabel="Loading playlist songs" header={<PageHeader back title="Your playlist" />} /></SafeAreaView>;
  if (!playlist || ownerVersion.current !== scopeVersion) return <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}><PageHeader back title="Playlist unavailable"  /><EmptyState title="Reopen this playlist from Library" message="The active account changed, or this playlist was removed. Saved collections remain in their own library."><Button title="Open Library" onPress={() => router.replace('/library')} /></EmptyState></SafeAreaView>;
  return <SafeAreaView style={ui.screen} edges={['left', 'right']}><SongList tracks={editing ? all : saved} label={editing ? 'Available catalog' : playlist.name} playlistId={editing ? playlist.id : undefined}
    emptyTitle="No available songs" emptyMessage="Add songs"
    header={<View><PageHeader back title={playlist.name} />
      <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 16 }}>
        <Button title="Play playlist" disabled={saved.length === 0} onPress={() => {
          const first = saved[0]; if (first) { void usePlayerStore.getState().playQueue(saved, first.id, playlist.name); router.push('/player'); }
        }} />
        <View style={ui.actionRow}><Button title={editing ? 'Done adding songs' : 'Add or remove songs'} secondary onPress={() => setEditing(!editing)} />
        <Button title="Rename playlist" secondary onPress={() => setRenaming(true)} />
        <ShareButton title="Share playlist" disabled={saved.length === 0} share={() => shareLinks.sharePlaylist(playlist)} /></View>
        
        {missing.length > 0 && <Text style={ui.body}>Some songs unavailable</Text>}
        {editing && missing.map((id) => <Button key={id} title={`Remove unavailable track ${id.slice(0, 8)}`} secondary onPress={() => { void useLibraryStore.getState().setPlaylistTrack(playlist.id, id, false); }} />)}
        <Button title="Delete playlist" secondary onPress={() => Alert.alert('Delete playlist?', `Delete “${playlist.name}” from your account collection? Your saved tracks and current playback will stay.`, [
          { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => {
            if (useLibraryStore.getState().scopeVersion !== ownerVersion.current) return;
            void useLibraryStore.getState().deletePlaylist(playlist.id).then(() => {
              const current = useLibraryStore.getState();
              if (current.scopeVersion === ownerVersion.current && !current.data.playlists.some((p) => p.id === playlist.id)) router.replace('/library');
            });
          } },
        ])} />
      </View>
    </View>} /><RenamePlaylistSheet playlist={renaming ? playlist : null} close={() => setRenaming(false)} />
  </SafeAreaView>;
}
