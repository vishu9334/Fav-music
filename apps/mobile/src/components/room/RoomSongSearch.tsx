import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { useCatalogPage } from '../../catalog/use-catalog-page';
import { useDebouncedValue } from '../../catalog/use-debounced-value';
import { uniqueTracks } from '../../catalog/unique-tracks';
import { Artwork } from '../../design/Artwork';
import { colors } from '../../design/theme';
import { roomSocketClient } from '../../services/room/room-socket.client';
import { useRoomStore } from '../../store/useRoomStore';
import { mapTrackDtoToPlayable, RoomPlaybackBridge } from '../../services/room/room-playback-bridge';

export interface RoomSongSearchProps {
  roomId: string;
  onSongSelected?: () => void;
}

/** Catalog reads are debounced/cached; only a server queue update confirms an addition. */
export function RoomSongSearch({ roomId, onSongSelected }: RoomSongSearchProps): React.JSX.Element {
  const [query, setQuery] = useState(''), [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const connected = useRoomStore(s => s.socketConnected), queue = useRoomStore(s => s.queue);
  const isController = useRoomStore(s => s.isController);
  const value = useDebouncedValue(query.trim(), 300);
  const page = useCatalogPage({ query: value }, 0, !!value);
  const tracks = useMemo(() => uniqueTracks(page.tracks).slice(0, 3), [page.tracks]);
  useEffect(() => {
    if (!pendingId) return;
    const confirmed = queue.find(item => item.trackId === pendingId);
    if (confirmed) {
      setPendingId(null);
      const complete = () => { setQuery(''); setMessage('Added to the room queue.'); onSongSelected?.(); };
      if (isController) {
        void RoomPlaybackBridge.getInstance().playTrackImmediately(roomId, mapTrackDtoToPlayable(confirmed.track))
          .then(played => {
            if (played) complete();
            else setMessage('Song queued. The current DJ can start playback.');
          })
          .catch(() => setMessage('Song queued, but audio could not load. Retry using the top Play button.'));
      } else complete();
      return;
    }
    const timer = setTimeout(() => { setPendingId(null); setMessage('The room has not confirmed this song. Please retry.'); }, 8000);
    return () => clearTimeout(timer);
  }, [queue, pendingId, roomId, isController, onSongSelected]);
  return <View style={styles.container}>
    <View style={styles.inputRow}><Search size={16} color={colors.text} />
      <TextInput value={query} onChangeText={text => { setQuery(text); setMessage(''); }} maxLength={160}
        accessibilityLabel="Search songs while chatting" placeholder="Search a song for this room" placeholderTextColor={colors.text}
        autoCapitalize="none" autoCorrect={false} style={styles.input} />
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear room song search" hitSlop={10} onPress={() => setQuery('')}><X size={18} color={colors.text} /></Pressable>}
    </View>
    {!!value && page.status === 'loading' && <ActivityIndicator size="small" color={colors.accent} accessibilityLabel="Searching room songs" />}
    {!!value && page.error && <Text style={styles.feedback}>{page.error}</Text>}
    {!!value && page.status === 'ready' && !tracks.length && <Text style={styles.feedback}>No songs found. Try a song title or artist.</Text>}
    {!!value && <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.results}>
      {tracks.map(track => {
        const added = queue.some(item => item.trackId === track.id), waiting = pendingId === track.id;
        return <View key={track.id} style={styles.result}><Artwork uri={track.artwork} size={32} />
          <View style={styles.meta}><Text numberOfLines={1} style={styles.title}>{track.title}</Text><Text numberOfLines={1} style={styles.artist}>{track.artist}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Add ${track.title} to room queue`} disabled={!connected || added || !!pendingId}
            onPress={() => {
              if (!connected || added || pendingId) return;
              setPendingId(track.id);
              setMessage('');
              try {
                roomSocketClient.addQueueTrack(roomId, track.id);
              } catch {
                setPendingId(null);
                setMessage('Could not add this song. Please retry.');
              }
            }}
            style={[styles.add, (!connected || added || !!pendingId) && { opacity: 0.5 }]}>
            <Text style={styles.title}>{added ? 'Queued' : waiting ? 'Waiting…' : '+ Queue'}</Text>
          </Pressable>
        </View>;
      })}
    </ScrollView>}
    {!!message && <Text style={styles.feedback} accessibilityLiveRegion="polite">{message}</Text>}
    {!connected && <Text style={styles.feedback}>Reconnecting to the room…</Text>}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 6 }, inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 44, color: colors.text, fontSize: 12 },
  results: { maxHeight: 156 }, result: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  meta: { flex: 1, minWidth: 0 }, title: { color: colors.text, fontSize: 12, fontWeight: '600' }, artist: { color: colors.text, fontSize: 11 },
  add: { minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.darkAccent },
  feedback: { color: colors.text, fontSize: 11, lineHeight: 16 },
});
