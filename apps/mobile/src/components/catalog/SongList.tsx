import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MoreHorizontal, Plus, Minus, Archive, RotateCcw, Music, Play } from 'lucide-react-native';
import { WarehouseStatus } from '@aadat/contracts';
import { useRouter } from 'expo-router';
import { IPlayableTrack } from '../../data/sample-tracks';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { colors, EmptyState, IconButton, ui } from '../app/ui';
import { TrackActionsSheet } from '../library/LibrarySheets';
import { LikeButton } from '../library/LikeButton';
import { warehouseSources } from '../../library/warehouse';
import { artworkRecovery } from '../../catalog/artwork-recovery';
import { useListInteraction } from '../lists/use-list-interaction';
import { SongListSkeleton } from '../loading/Skeleton';
import { uniqueTracks } from '../../catalog/unique-tracks';
import { unlistDuplicateVersions, type ISongGroup } from '../../catalog/song-grouping';

export const GroupedSongRow = memo(function GroupedSongRow({
  group,
  onPlayTrack,
  onMenuTrack,
  minimalMetadata = false,
}: {
  group: ISongGroup;
  onPlayTrack?: (track: IPlayableTrack) => void;
  onMenuTrack?: (track: IPlayableTrack) => void;
  minimalMetadata?: boolean;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const track = group.primaryTrack;
  const active = usePlayerStore((s) => s.tracks[s.activeTrackIndex]?.id === track.id);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <View style={styles.groupContainer}>
      <View style={[styles.row, active && { backgroundColor: colors.darkAccent }]}>
        {/* Direct 1-Tap Play Button on card without navigating inside */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${track.title} by ${track.artist}`}
          onPress={() => onPlayTrack?.(track)}
          style={styles.directPlayTarget}
        >
          {track.artwork && !imageFailed ? (
            <Image
              source={{ uri: track.catalogSource === 'catalog' ? track.artwork : track.artwork.replace('w=800', 'w=160') }}
              style={styles.art}
              fadeDuration={0}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={[styles.art, { alignItems: 'center', justifyContent: 'center' }]}>
              <Music size={20} color={colors.accent} />
            </View>
          )}
          <View style={styles.playBadge}>
            <Play size={11} color="#FFFFFF" fill="#FFFFFF" />
          </View>
        </Pressable>

        {/* Card info - tapping title/artist expands the version list */}
        <Pressable
          style={ui.grow}
          accessibilityRole="button"
          accessibilityLabel={`View all ${group.versionCount} versions of ${group.baseTitle}`}
          onPress={() => setExpanded((prev) => !prev)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={[styles.title, active && { color: colors.text }]} numberOfLines={1}>
              {track.title}
            </Text>
            <View style={styles.versionPill}>
              <Text style={styles.versionPillText}>{group.versionCount} versions</Text>
            </View>
          </View>
          <Text style={styles.artist} numberOfLines={1}>
            {minimalMetadata ? track.artist : [track.artist, track.album].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>

        <LikeButton trackId={track.id} title={track.title} />
        <IconButton
          icon={MoreHorizontal}
          label={`More actions for ${track.title}`}
          onPress={() => onMenuTrack?.(track)}
        />
      </View>

      {/* Expanded list showing all specific versions when user goes inside */}
      {expanded && (
        <View style={styles.versionsList}>
          {group.versions.map((ver, idx) => (
            <Pressable
              key={ver.id}
              accessibilityRole="button"
              accessibilityLabel={`Play version ${ver.title} by ${ver.artist}`}
              style={styles.versionRow}
              onPress={() => onPlayTrack?.(ver)}
            >
              <Text style={styles.versionIndex}>{idx + 1}</Text>
              <View style={ui.grow}>
                <Text style={styles.versionTitle} numberOfLines={1}>{ver.title}</Text>
                <Text style={styles.versionArtist} numberOfLines={1}>{ver.artist}</Text>
              </View>
              <Text style={styles.duration}>
                {Math.floor(ver.duration / 60)}:{String(Math.floor(ver.duration % 60)).padStart(2, '0')}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});

export const SongRow = memo(function SongRow({ track, onPlay, onMenu, onPlayTrack, onMenuTrack, playlistId, warehouseMode, minimalMetadata = false }: {
  track: IPlayableTrack; onPlay?: () => void; onMenu?: () => void; onPlayTrack?: (track:IPlayableTrack)=>void; onMenuTrack?: (track:IPlayableTrack)=>void; playlistId?: string; warehouseMode?: WarehouseStatus; minimalMetadata?:boolean;
}): React.JSX.Element {
  const active = usePlayerStore((s) => s.tracks[s.activeTrackIndex]?.id === track.id);
  const included = useLibraryStore((s) => playlistId ? s.data.playlists.find((p) => p.id === playlistId)?.trackIds.includes(track.id) ?? false : false);
  const sources = useLibraryStore((s) => warehouseMode ? warehouseSources(s.data, track.id).join(' · ') : '');
  const [imageFailed, setImageFailed] = useState(false);
  const artworkRetried = useRef(false);
  useEffect(() => { setImageFailed(false); }, [track.artwork]);
  return <View style={[styles.row, active && { backgroundColor: colors.darkAccent }]}><Pressable style={styles.song} onPress={() => onPlayTrack ? onPlayTrack(track) : onPlay?.()} accessibilityRole="button" accessibilityLabel={`Play ${track.title} by ${track.artist}`}>
    {track.artwork && !imageFailed ? <Image source={{ uri: track.catalogSource === 'catalog' ? track.artwork : track.artwork.replace('w=800', 'w=160') }} style={styles.art} fadeDuration={0} accessibilityIgnoresInvertColors onError={() => {
      setImageFailed(true);
      if (track.catalogSource === 'catalog' && !artworkRetried.current) { artworkRetried.current = true; void artworkRecovery.recover(track.id,track.artwork).catch(() => {}); }
    }} />
      : <View style={[styles.art, { alignItems: 'center', justifyContent: 'center' }]}><Music size={20} color={colors.accent} /></View>}
    <View style={ui.grow}><Text style={[styles.title, active && { color: colors.text }]} numberOfLines={1}>{track.title}</Text>
      <Text style={styles.artist} numberOfLines={1}>{minimalMetadata ? track.artist : [track.artist, track.album].filter(Boolean).join(' · ')}</Text>
      {!!sources && <Text style={styles.artist} numberOfLines={1}>{sources}</Text>}
    </View>{!minimalMetadata && <Text style={styles.duration}>{Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, '0')}</Text>}
  </Pressable>{playlistId ? <IconButton icon={included ? Minus : Plus} label={`${included ? 'Remove' : 'Add'} ${track.title} ${included ? 'from' : 'to'} playlist`} selected={included}
    onPress={() => { void useLibraryStore.getState().setPlaylistTrack(playlistId, track.id, !included); }} />
    : warehouseMode ? <IconButton icon={warehouseMode === WarehouseStatus.ACTIVE ? Archive : RotateCcw}
      label={`${warehouseMode === WarehouseStatus.ACTIVE ? 'Remove' : 'Restore'} ${track.title} ${warehouseMode === WarehouseStatus.ACTIVE ? 'from' : 'to'} Warehouse`}
      onPress={() => { void useLibraryStore.getState().setWarehouseStatus(track.id, warehouseMode === WarehouseStatus.ACTIVE ? WarehouseStatus.ARCHIVED : WarehouseStatus.ACTIVE); }} />
    : <LikeButton trackId={track.id} title={track.title} />}
    <IconButton icon={MoreHorizontal} label={`More actions for ${track.title}`} onPress={() => onMenuTrack ? onMenuTrack(track) : onMenu?.()} />
  </View>;
});

export function SongList({ tracks: inputTracks, label, header, footer, emptyTitle = 'No tracks yet', emptyMessage = undefined, playlistId, warehouseMode, scrollKey, minimalMetadata = false, emptyContent, loading = false, loadingLabel, groupVersions = false }: {
  tracks: readonly IPlayableTrack[]; label: string; header?: React.ReactElement; footer?: React.ReactElement; emptyTitle?: string; emptyMessage?: string; playlistId?: string; warehouseMode?: WarehouseStatus; scrollKey?:string; minimalMetadata?:boolean; emptyContent?:React.ReactElement|null; loading?:boolean; loadingLabel?:string; groupVersions?: boolean;
}): React.JSX.Element {
  const tracks = useMemo(() => {
    const unique = uniqueTracks(inputTracks);
    return groupVersions ? unlistDuplicateVersions(unique) : unique;
  }, [inputTracks, groupVersions]);
  const router = useRouter(); const [selected, setSelected] = useState<IPlayableTrack | null>(null);
  const {guard,list,handlers}=useListInteraction<IPlayableTrack>(scrollKey??`songs:${label}`,tracks.length>0);
  const latest=useRef({tracks,label,router});latest.current={tracks,label,router};
  const play=useCallback((track:IPlayableTrack)=>{
    if(!guard.allowPress())return;
    const current=latest.current;
    if(!current.tracks.some(item=>item.id===track.id))return;
    void usePlayerStore.getState().playQueue(current.tracks,track.id,current.label);current.router.push('/player');
  },[guard]);
  const close=useCallback(()=>setSelected(null),[]);
  const render = useCallback(({ item }: { item: IPlayableTrack }) => {
    return <SongRow track={item} minimalMetadata={minimalMetadata} playlistId={playlistId} warehouseMode={warehouseMode} onMenuTrack={setSelected} onPlayTrack={play} />;
  }, [playlistId, warehouseMode, play, minimalMetadata]);
  return <View style={ui.grow}><FlatList ref={list as any} {...handlers} data={tracks} renderItem={render} keyExtractor={(item) => item.id}
    ListHeaderComponent={header} ListFooterComponent={footer} ListEmptyComponent={loading ? <SongListSkeleton label={loadingLabel} /> : emptyContent === undefined ? <EmptyState title={emptyTitle} message={emptyMessage} /> : emptyContent}
    initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" />
    <TrackActionsSheet trackId={selected?.id ?? null} fallbackTrack={selected ?? undefined} close={close} />
  </View>;
}
const styles = StyleSheet.create({
  list: { paddingBottom: 24 }, row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 6, minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  song: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  art: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.raised },
  title: { color: colors.text, fontWeight: '600', fontSize: 15 }, artist: { color: colors.muted, fontSize: 12, marginTop: 4 },
  duration: { color: colors.muted, fontSize: 10, fontVariant: ['tabular-nums'], marginTop: 3 },
  groupContainer: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  directPlayTarget: { position: 'relative', width: 46, height: 46, marginRight: 12 },
  playBadge: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#000000' },
  versionPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(56, 189, 248, 0.16)' },
  versionPillText: { color: '#38BDF8', fontSize: 10, fontWeight: '700' },
  versionsList: { paddingLeft: 64, paddingRight: 16, paddingBottom: 10, backgroundColor: 'rgba(255, 255, 255, 0.02)' },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  versionIndex: { color: colors.muted, fontSize: 11, fontVariant: ['tabular-nums'], width: 18 },
  versionTitle: { color: colors.text, fontSize: 13, fontWeight: '500' },
  versionArtist: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
