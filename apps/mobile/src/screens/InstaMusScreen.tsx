import { SongListSkeleton, SavedLinksSkeleton } from '../components/loading/Skeleton';
import { catalogPending } from '../components/loading/loading-state';
import { catalogEnabled } from '../catalog/catalog-runtime';
import { CatalogNotice } from '../components/catalog/CatalogNotice';
import { useCatalogStore } from '../store/useCatalogStore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { demoCatalog } from '../catalog/demo-catalog';
import { normalizeReelUrl } from '../discovery/instagram-link';
import { useLibraryStore } from '../store/useLibraryStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { SongRow } from '../components/catalog/SongList';
import { TrackActionsSheet } from '../components/library/LibrarySheets';
import { ShareButton } from '../components/app/ShareButton';
import { GlassSurface } from '../design/GlassSurface';
import { Button, colors, PageHeader, ui } from '../components/app/ui';
import { shareLinks } from '../sharing/sharing';
import { CollectionScopeGuard } from '../library/scope-guard';
import { useCatalogPage } from '../catalog/use-catalog-page';
import { useListInteraction } from '../components/lists/use-list-interaction';
import { instaMusRows, type InstaMusRow } from '../components/lists/instamus-rows';
import { noSongMatchMessage } from '../sharing/track-availability';
import type { IPlayableTrack } from '../data/sample-tracks';
import { importReelShare } from '../sharing/reel-import.service';
import { catalogQueryKey } from '../catalog/catalog-query';
import { uniqueTracks } from '../catalog/unique-tracks';

export default function InstaMusScreen(): React.JSX.Element {
  const {guard,list,handlers}=useListInteraction<InstaMusRow>('instamus');
  const params = useLocalSearchParams<{ reel?: string; query?: string; import?: string; owner?: string }>(), router = useRouter();
  const notes = useLibraryStore((s) => s.data.instamus), status = useLibraryStore((s) => s.status);
  const scopeVersion = useLibraryStore((s) => s.scopeVersion);
  const [reel, setReel] = useState(''), [query, setQuery] = useState(''), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null), [menu, setMenu] = useState<string | null>(null);
  const revision=useCatalogStore(s=>s.revision);
  const trimmed = query.trim();
  const page=useCatalogPage({query:trimmed},300,!!trimmed),hasMore=page.hasMore,catalogStatus=page.status;
  const loadedQuery=page.query.query??'';
  const searchPending = !!trimmed && catalogPending(catalogStatus, page.error, catalogEnabled());
  const results = useMemo(() => trimmed ? uniqueTracks(page.tracks ?? demoCatalog.search({ query: trimmed }).filter((track) => track.catalogSource==='catalog')) : [], [trimmed,page.tracks,revision]);
  const searchFeedback=noSongMatchMessage(trimmed,loadedQuery,catalogStatus,results.length,hasMore);
  const rows=useMemo(()=>instaMusRows(results,notes),[results,notes]);
  const latest = useRef({results,router}); latest.current={results,router};
  const playMatch = useCallback((track:IPlayableTrack) => {
    if(!guard.allowPress())return;
    const current=latest.current;if(!current.results.some(item=>item.id===track.id))return;
    void usePlayerStore.getState().playQueue(current.results,track.id,'InstaMus search');current.router.push('/player');
  },[guard]);
  const menuMatch = useCallback((track:IPlayableTrack)=>setMenu(track.id),[]);
  useEffect(() => { setReel(''); setQuery(''); setMessage(null); setMenu(null); setBusy(false); }, [scopeVersion]);
  useEffect(() => {
    if (params.reel === undefined) return;
    try {
      if (typeof params.reel !== 'string') throw new Error('This reel link is invalid.');
      setReel(normalizeReelUrl(params.reel));
      if (typeof params.query === 'string' && params.query.trim()) {
        setQuery(params.query.trim());
        setMessage('Searching for shared reel music');
      } else {
        setQuery('');
        setMessage('Review reel link');
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'This reel link is invalid.'); }
  }, [params.reel, params.query]);
  const importing = useRef('');
  useEffect(() => {
    if (params.import !== '1' || typeof params.reel !== 'string' || status !== 'ready' || params.owner !== useLibraryStore.getState().scope) return;
    const key = `${scopeVersion}:${params.reel}:${params.query ?? ''}`;
    if (importing.current === key) return;
    importing.current = key;
    let reelUrl: string;
    try { reelUrl = normalizeReelUrl(params.reel); } catch { return; }
    const version = scopeVersion;
    let alive = true;
    setMessage('Saving to FavInsta…');
    void importReelShare({ reelUrl, metadata: typeof params.query === 'string' ? params.query : undefined }, useLibraryStore.getState, async query => {
      await useCatalogStore.getState().load({ query });
      return useCatalogStore.getState().pages[catalogQueryKey({ query })]?.tracks ?? [];
    }).then(result => {
      if (!alive || useLibraryStore.getState().scopeVersion !== version) return;
      if (result === 'matched') setMessage('Song matched and saved to FavInsta');
      if (result === 'saved') setMessage('Saved to FavInsta. Choose a song below to finish matching.');
      if (result === 'failed') { importing.current = ''; setMessage('Could not save this reel. Tap Save reel to retry.'); }
    });
    return () => { alive = false; };
  }, [params.import, params.reel, params.query, params.owner, scopeVersion, status]);
  const save = async (trackId: string | null) => {
    const guard = new CollectionScopeGuard(useLibraryStore.getState);
    setBusy(true); setMessage(null);
    const saved = await guard.run(() => useLibraryStore.getState().saveInstaMus(reel, query, trackId));
    if (!guard.valid()) return;
    if (saved) setMessage(trackId ? 'Linked and bookmarked' : 'Reel saved');
    setBusy(false);
  };
  return <SafeAreaView style={ui.screen} edges={['left', 'right']}><FlatList ref={list} {...handlers} data={rows} keyExtractor={row => row.key} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5}
    keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 28 }}
    ListHeaderComponent={<View><PageHeader back title="FavInsta" subtitle="Share an Instagram reel to Fav Music to save it here. Shared song details start a search automatically." />
      <GlassSurface style={styles.form}><Text style={ui.sectionTitle} accessibilityRole="header">Manual matching</Text><Text style={ui.subtitle}>Instagram reel link</Text>
        <TextInput value={reel} onChangeText={(value) => { setReel(value); setMessage(null); }} maxLength={2048} editable={!busy} autoCapitalize="none" autoCorrect={false}
          keyboardType="url" accessibilityLabel="Instagram reel link" placeholder="Paste reel link" placeholderTextColor={colors.muted} style={styles.input} />
        <Text style={ui.subtitle}>Song, artist, note</Text><TextInput value={query} onChangeText={setQuery} maxLength={160} editable={!busy} accessibilityLabel="Song title, artist or discovery note"
          placeholder="Search music" placeholderTextColor={colors.muted} style={styles.input} />
        {/* Reel save feature removed from visible UI */}
        <View style={{ display: 'none' }}><Button title={busy ? 'Saving…' : 'Save reel'} accessibilityLabel={busy ? 'Saving reel' : 'Save reel link and note'} disabled={busy || !reel.trim() || status !== 'ready'} onPress={() => { void save(null); }} /></View>
        <Button title="Open original reel" secondary disabled={busy || !reel.trim()} onPress={() => {
          try {
            const guard=new CollectionScopeGuard(useLibraryStore.getState),url=normalizeReelUrl(reel);
            void guard.run(()=>Linking.openURL(url)).catch(()=>{if(guard.valid())setMessage('The reel could not be opened. Check the link and try again.');});
          } catch (error) { setMessage(error instanceof Error ? error.message : 'This reel link is invalid.'); }
        }} />
        {message && <Text style={ui.body} accessibilityLiveRegion="polite">{message}</Text>}
      </GlassSurface>
      {!!query.trim() && <View style={styles.section}><Text style={ui.sectionTitle} accessibilityRole="header">Search results</Text>{searchFeedback && <Text style={ui.subtitle} accessibilityLiveRegion="polite">{searchFeedback}</Text>}</View>}
      {!!query.trim() && <CatalogNotice query={{query:query.trim()}} loadingHandled={searchPending&&!results.length} />}
      {searchPending&&!results.length && <SongListSkeleton count={3} linkActions label="Searching music" />}
    </View>}
    ListFooterComponent={notes.length===0 ? status==='loading' ? <SavedLinksSkeleton /> : status==='error' ? null : <View style={styles.empty}><Text style={ui.subtitle} accessibilityLiveRegion="polite">No saved reels</Text></View> : null}
    renderItem={({ item:row }) => {
      if(row.kind==='match'){const track=row.track;return <View><SongRow track={track} minimalMetadata onMenuTrack={menuMatch} onPlayTrack={playMatch} /><View style={styles.linkAction}><Button title="Link and bookmark" accessibilityLabel={`Link and bookmark ${track.title}`} secondary disabled={busy || !reel.trim() || status !== 'ready'} onPress={() => { void save(track.id); }} /></View></View>;}
      if(row.kind==='more')return query.trim() && hasMore ? <View style={styles.pagination}><Button title={catalogStatus==='loading'?'Loading…':'Load more matches'} secondary disabled={catalogStatus==='loading'} onPress={()=>{void useCatalogStore.getState().load({query:query.trim()},true);}} /></View> : null;
      if(row.kind==='heading')return <View style={styles.section}><Text style={ui.sectionTitle} accessibilityRole="header">FavInsta library</Text></View>;
      const item=row.note;
      const linked=item.trackId?demoCatalog.get(item.trackId):undefined, title=linked?.title || item.query || 'Saved reel';
      return <View style={styles.note}><Pressable style={styles.noteBody} accessibilityRole="button" accessibilityLabel={`Continue discovery for ${title}`} onPress={() => { setReel(item.reelUrl); setQuery(item.query); setMessage('Discovery loaded'); }}>
      <Text style={styles.noteTitle}>{title}</Text>{linked && <Text style={ui.subtitle} numberOfLines={1}>{linked.artist}</Text>}
      {linked && !!item.query.trim() && item.query.trim().toLowerCase()!==linked.title.trim().toLowerCase() && <Text style={ui.subtitle}>{item.query}</Text>}
      <Text style={ui.subtitle} numberOfLines={1} ellipsizeMode="middle">{item.reelUrl}</Text>
      {!linked && <Text style={ui.subtitle}>{item.trackId ? 'Song unavailable' : 'Not linked'}</Text>}
    </Pressable>
    {linked && <Button title="Play song" accessibilityLabel={`Play song ${title}`} secondary onPress={() => { void usePlayerStore.getState().playQueue([linked], linked.id, 'InstaMus playback'); router.push('/player'); }} />}
    <ShareButton title="Share discovery link" share={() => shareLinks.shareReel(item.reelUrl)} />
      <Button title="Remove reel" accessibilityLabel={`Remove saved reel ${title}`} secondary onPress={() => {
        const guard = new CollectionScopeGuard(useLibraryStore.getState);
        Alert.alert('Remove this reel link?', 'The discovery note will be removed from your account collection. Track bookmarks stay saved.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { void guard.run(() => useLibraryStore.getState().removeInstaMus(item.reelUrl)); } },
        ]);
      }} />
    </View>;}} />
    <TrackActionsSheet trackId={menu} close={() => setMenu(null)} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  form: { marginHorizontal: 20, padding: 16, gap: 12, minWidth: 0 }, input: { minHeight: 52, minWidth: 0, color: colors.text, fontSize: 15, backgroundColor: colors.panel, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line },
  section: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 8 }, pagination: { paddingHorizontal: 20, paddingVertical: 14 }, empty: { paddingHorizontal: 20, paddingBottom: 20 },
  linkAction: { paddingHorizontal: 20, paddingBottom: 14 }, note: { marginHorizontal: 20, marginBottom: 12, padding: 16, gap: 10, minWidth: 0, backgroundColor: colors.panel, borderRadius: 20, borderWidth: 1, borderColor: colors.line },
  noteBody: { minHeight: 44, minWidth: 0, gap: 4 }, noteTitle: { color: colors.text, fontWeight: '600', fontSize: 16 },
});
