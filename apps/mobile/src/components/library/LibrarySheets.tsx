import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import { Bookmark, Boxes, Check, ChevronLeft, EyeOff, Heart, ListPlus, Star, X } from 'lucide-react-native';
import { WarehouseStatus } from '@aadat/contracts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibraryStore } from '../../store/useLibraryStore';
import { demoCatalog } from '../../catalog/demo-catalog';
import { CollectionKind, LocalPlaylist } from '../../library/library.contract';
import { PlaylistNamingService } from '../../library/playlist-naming.service';
import { warehouseIds, warehouseStatus } from '../../library/warehouse';
import { shareLinks } from '../../sharing/sharing';
import { ShareButton } from '../app/ShareButton';
import { useRouter } from 'expo-router';
import { useReducedMotion } from '../../design/useReducedMotion';
import { GlassSurface } from '../../design/GlassSurface';
import { MorphingHeart } from '../kobra/MorphingHeart';
import type { IPlayableTrack } from '../../data/sample-tracks';
import { Button, colors, IconButton, ui } from '../app/ui';

function Sheet({ visible, title, close, children }: { visible: boolean; title: string; close: () => void; children: React.ReactNode }): React.JSX.Element {
  const insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const scopeVersion = useLibraryStore((s) => s.scopeVersion), previousScope = useRef(scopeVersion);
  const sameScope = previousScope.current === scopeVersion;
  useEffect(() => { if (previousScope.current !== scopeVersion) { previousScope.current = scopeVersion; close(); } }, [scopeVersion, close]);
  return <Modal visible={visible && sameScope} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={close} statusBarTranslucent>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close dialog" onPress={close} />
      <GlassSurface style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom), paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }]} accessibilityViewIsModal>
        <View style={styles.heading}><Text style={[ui.sectionTitle, ui.grow]}>{title}</Text><IconButton icon={X} label="Close" onPress={close} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>{children}</ScrollView>
      </GlassSurface>
    </KeyboardAvoidingView>
  </Modal>;
}
const naming = new PlaylistNamingService(demoCatalog);
const noTracks: readonly string[] = [];
function CreateForm({ created, trackIds = noTracks, playlist }: { created: (id: string) => void; trackIds?: readonly string[]; playlist?: LocalPlaylist }): React.JSX.Element {
  const [name, setName] = useState(playlist?.name ?? ''); const [saving, setSaving] = useState(false);
  const ownerVersion = useRef(useLibraryStore.getState().scopeVersion);
  const playlists = useLibraryStore((s) => s.data.playlists);
  const suggestions = useMemo(() => naming.suggestions(playlist?.trackIds ?? trackIds, playlists.filter((p) => p.id !== playlist?.id).map((p) => p.name)), [trackIds, playlist, playlists]);
  const error = useLibraryStore((s) => s.error);
  return <View style={styles.form}><TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Playlist name"
    placeholderTextColor={colors.muted} style={styles.input} accessibilityLabel="Playlist name" autoCapitalize="sentences"
    returnKeyType="done" editable={!saving} />
    <Text style={ui.subtitle}>Suggested names</Text><View style={styles.suggestions}>{suggestions.map((suggestion) =>
      <Pressable key={suggestion} accessibilityRole="button" accessibilityLabel={`Use playlist name ${suggestion}`} disabled={saving} style={styles.suggestion} onPress={() => setName(suggestion)}><Text style={ui.subtitle}>{suggestion}</Text></Pressable>)}</View>
    {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    <Button title={saving ? 'Saving…' : playlist ? 'Save name' : 'Create playlist'} disabled={saving || !name.trim()} onPress={() => {
      setSaving(true); const store = useLibraryStore.getState();
      if (store.scopeVersion !== ownerVersion.current || store.status !== 'ready') { setSaving(false); return; }
      void (playlist ? store.renamePlaylist(playlist.id, name).then((saved) => saved ? playlist.id : null) : store.createPlaylist(name, trackIds)).then((id) => {
        setSaving(false); if (id && useLibraryStore.getState().scopeVersion === ownerVersion.current) { if (!playlist) setName(''); created(id); }
      });
    }} />
  </View>;
}
export function RenamePlaylistSheet({ playlist, close }: { playlist: LocalPlaylist | null; close: () => void }): React.JSX.Element {
  return <Sheet visible={!!playlist} title="Rename playlist" close={close}>{playlist && <CreateForm key={playlist.id} playlist={playlist} created={close} />}</Sheet>;
}
export function CreatePlaylistSheet({ visible, close, created }: { visible: boolean; close: () => void; created: (id: string) => void }): React.JSX.Element {
  const scopeVersion = useLibraryStore((s) => s.scopeVersion);
  return <Sheet visible={visible} title="New playlist" close={close}>
    <CreateForm key={scopeVersion} created={created} />
  </Sheet>;
}
const actions: readonly { kind: CollectionKind; title: string; icon: typeof Heart }[] = [
  { kind: 'likes', title: 'Like', icon: Heart }, { kind: 'favourites', title: 'Favourite', icon: Star },
  { kind: 'bookmarks', title: 'Bookmark', icon: Bookmark }, { kind: 'warehouse', title: 'Save to Warehouse', icon: Boxes },
];
export function TrackActionsSheet({ trackId, fallbackTrack, close }: { trackId: string | null; fallbackTrack?: IPlayableTrack; close: () => void }): React.JSX.Element {
  const router = useRouter();
  const [picker, setPicker] = useState(false);
  const data = useLibraryStore((s) => s.data);
  const scopeVersion = useLibraryStore(s => s.scopeVersion), ready = useLibraryStore(s => s.status === 'ready');
  const reduced = useReducedMotion();
  const error = useLibraryStore((s) => s.error);
  useEffect(() => { setPicker(false); }, [trackId]);
  const track = trackId ? demoCatalog.get(trackId) ?? (fallbackTrack?.id === trackId ? fallbackTrack : undefined) : undefined;
  return <Sheet visible={!!track} title={picker ? 'Add to a playlist' : track?.title ?? 'Track actions'} close={close}>
    {track && <>
      <Text style={ui.subtitle}>{[track.artist, track.album].filter(Boolean).join(' · ')}</Text>
      {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
      {!picker ? <View>{actions.map(({ kind, title, icon: Icon }) => {
        const included = kind === 'warehouse' ? warehouseIds(data).includes(track.id) : data[kind].includes(track.id);
        const actionTitle = kind === 'warehouse' && !included && warehouseStatus(data, track.id) !== WarehouseStatus.ACTIVE ? 'Restore to Warehouse' : title;
        return <Pressable key={kind} accessibilityRole="button" accessibilityState={{ selected: included }}
          disabled={kind === 'likes' && !ready} onPress={() => { const state = useLibraryStore.getState(); if (state.scopeVersion === scopeVersion) void state.toggle(kind, track.id); }} style={styles.action}>
          {kind === 'likes' ? <MorphingHeart selected={included} reduced={reduced} /> : <Icon size={21} color={included ? colors.accent : colors.text} />}<Text style={styles.actionText}>{included ? `Remove ${kind === 'warehouse' ? 'from Warehouse' : `from ${kind}`}` : actionTitle}</Text>{included && <Check size={18} color={colors.accent} />}
        </Pressable>;
      })}<Pressable accessibilityRole="button" onPress={() => setPicker(true)} style={styles.action}>
        <ListPlus size={21} color={colors.text} /><Text style={styles.actionText}>Add to playlist</Text>
      </Pressable>{warehouseStatus(data, track.id) !== WarehouseStatus.HIDDEN && <Pressable accessibilityRole="button" onPress={() => { void useLibraryStore.getState().setWarehouseStatus(track.id, WarehouseStatus.HIDDEN); }} style={styles.action}>
        <EyeOff size={21} color={colors.text} /><Text style={styles.actionText}>Hide in Warehouse</Text></Pressable>}
      {track.catalogVideo && <Button title="Watch catalog video" secondary onPress={() => { close(); router.push({ pathname: '/videos', params: { trackId: track.id } }); }} />}
      <ShareButton title="Share track" identity={`track:${scopeVersion}:${track.id}`} disabled={!ready} share={(current) => shareLinks.shareTrack(track.id, current)} /></View> : <>
        <Pressable style={styles.action} accessibilityRole="button" onPress={() => setPicker(false)}><ChevronLeft size={18} color={colors.accent} /><Text style={styles.actionText}>Track actions</Text></Pressable>
        <ScrollView style={styles.playlists} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {data.playlists.length === 0 && <Text style={ui.body}>Create your first playlist below.</Text>}
          {data.playlists.map((playlist) => {
            const included = playlist.trackIds.includes(track.id);
            return <Pressable key={playlist.id} style={styles.action} accessibilityRole="checkbox" accessibilityState={{ checked: included }}
              accessibilityLabel={`${included ? 'Remove from' : 'Add to'} ${playlist.name}`}
              onPress={() => { void useLibraryStore.getState().setPlaylistTrack(playlist.id, track.id, !included); }}>
              <Text style={styles.actionText} numberOfLines={1}>{playlist.name}</Text>{included && <Check size={18} color={colors.accent} />}
            </Pressable>;
          })}
        </ScrollView><CreateForm trackIds={[track.id]} created={() => setPicker(false)} />
      </>}
    </>}
  </Sheet>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.glass, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 20, paddingTop: 12, maxHeight: '90%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, form: { gap: 14, marginVertical: 18 },
  input: { color: colors.text, backgroundColor: colors.raised, borderRadius: 16, padding: 16, minHeight: 50, fontSize: 16, borderWidth: 1, borderColor: colors.line },
  action: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingVertical: 8 },
  actionText: { flex: 1, color: colors.text, fontSize: 15 }, playlists: { maxHeight: 160 }, error: { color: colors.text, marginTop: 8, fontSize: 13 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, suggestion: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line },
});
