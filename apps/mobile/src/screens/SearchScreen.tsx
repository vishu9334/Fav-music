import { catalogPending } from '../components/loading/loading-state';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { DECADES, SEASONS, demoCatalog } from '../catalog/demo-catalog';
import { SongList } from '../components/catalog/SongList';
import { Button, colors, IconButton, PageHeader, ui } from '../components/app/ui';
import { FilterRow } from '../components/discovery/FilterRow';
import { useCatalogStore } from '../store/useCatalogStore';
import { CatalogNotice } from '../components/catalog/CatalogNotice';
import { catalogEnabled } from '../catalog/catalog-runtime';
import type { CatalogQuery } from '@aadat/contracts';
import { catalogQuery, catalogQueryKey } from '../catalog/catalog-query';
import { useCatalogPage } from '../catalog/use-catalog-page';
import { useDebouncedValue } from '../catalog/use-debounced-value';

export default function SearchScreen(): React.JSX.Element {
  const router = useRouter();
  const [query, setQuery] = useState(''), [decade, setDecade] = useState(''), [season, setSeason] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const revision = useCatalogStore((s) => s.revision);
  const remoteQuery = useMemo((): CatalogQuery => {
    return catalogQuery({ query: debouncedQuery, decade, season });
  }, [debouncedQuery, decade, season]);
  const page = useCatalogPage(remoteQuery, 0), status = page.status, more = page.hasMore;
  const matchingPage = catalogQueryKey(remoteQuery) === catalogQueryKey(page.query);
  const tracks = useMemo(() => catalogEnabled() && (page.ids.length > 0 || status === 'ready' || status === 'loading') ? page.tracks : demoCatalog.search({ query: debouncedQuery, decade, season }), [page.tracks, page.ids, status, debouncedQuery, decade, season, revision]);
  const pending = catalogPending(status, page.error, catalogEnabled());
  return <SafeAreaView style={ui.screen} edges={['left', 'right']}><SongList groupVersions loading={pending} emptyContent={page.error ? null : undefined} minimalMetadata={!!season} scrollKey={`search:${catalogQueryKey(remoteQuery)}`} tracks={tracks} label="Music search results" emptyTitle="No matching tracks found"
    emptyMessage="Try another search"
    footer={more && matchingPage ? <View style={{ padding: 20 }}><Button title={status === 'loading' ? 'Loading…' : 'Load more catalog tracks'} disabled={status === 'loading'} secondary onPress={() => { void useCatalogStore.getState().load(remoteQuery, true); }} /></View> : undefined}
    header={<View><PageHeader title="Search" /><CatalogNotice query={remoteQuery} loadingHandled={pending&&!tracks.length} />
      <View style={styles.search}><Search color={colors.muted} size={20} /><TextInput clearButtonMode="while-editing" value={query} onChangeText={setQuery} style={styles.input} onSubmitEditing={() => { if (catalogEnabled()) void useCatalogStore.getState().load(catalogQuery({query,decade,season})); }}
        placeholder="Songs, artists, albums" placeholderTextColor={colors.muted} accessibilityLabel="Search songs, artists and albums" autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
        {!!query && <IconButton icon={X} label="Clear search" onPress={() => setQuery('')} />}</View>
      <View style={{padding:20}}><Button title="Browse albums, artists and provider playlists" secondary onPress={()=>router.push('/provider-browse')} /></View>
      <FilterRow title="Decade" values={DECADES} selected={decade} select={setDecade} /><FilterRow title="Season" values={SEASONS} selected={season} select={setSeason} />
      <View style={styles.result}>
        {(!!query || !!decade || !!season) && <Pressable accessibilityRole="button" onPress={() => { setQuery(''); setDecade(''); setSeason(''); }}><Text style={styles.clear}>Clear all filters</Text></Pressable>}
      </View>
    </View>} /></SafeAreaView>;
}
const styles = StyleSheet.create({
  search: { marginHorizontal: 20, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, paddingLeft: 15, paddingRight: 3, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minHeight: 52, minWidth: 0, color: colors.text, fontSize: 15 }, result: { flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clear: { minHeight: 44, color: colors.text, fontSize: 12, paddingVertical: 12 },
});
