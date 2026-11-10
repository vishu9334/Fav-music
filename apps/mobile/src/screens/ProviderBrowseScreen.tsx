import { PlaylistListSkeleton } from '../components/loading/Skeleton';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { CatalogResource, CatalogResourceKind, CatalogResourcePage } from '@aadat/contracts';
import { catalogEnabled, catalogRepository } from '../catalog/catalog-runtime';
import { Button, colors, EmptyState, PageHeader, ui } from '../components/app/ui';
import { CatalogResourceCard } from '../components/catalog/CatalogResourceCard';
import { PageRequests, appendStable } from '../catalog/page-requests';
import { useListInteraction } from '../components/lists/use-list-interaction';
import { FilterRow } from '../components/discovery/FilterRow';
const noResources:readonly CatalogResource[]=[];
export default function ProviderBrowseScreen(): React.JSX.Element {
    const router = useRouter(), [query, setQuery] = useState(''), [kind, setKind] = useState<CatalogResourceKind>('albums'), [nodes, setNodes] = useState<readonly CatalogResource[]>([]), [page, setPage] = useState(0), [more, setMore] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), generation = useRef(0);
    const requests=useRef(new PageRequests<CatalogResourcePage>()).current;
    const failedPage=useRef(0);
    const views=useRef(new Map<string,{nodes:readonly CatalogResource[];page:number;more:boolean}>()).current;
    const key=`${kind}:${query.trim()}`;
    const dataKey=useRef(key),cachedView=views.get(key),current=dataKey.current===key;
    const visibleNodes=current?nodes:cachedView?.nodes??noResources,visiblePage=current?page:cachedView?.page??0,visibleMore=current?more:cachedView?.more??false,visibleBusy=current&&busy,visibleError=current?error:null;
    const {guard,list,handlers}=useListInteraction<CatalogResource>(`provider-browse:${key}`,visibleNodes.length>0);
    const routerRef=useRef(router);routerRef.current=router;
    const open=useCallback((id:string)=>{if(guard.allowPress())routerRef.current.push({pathname:'/provider-collection',params:{id}});},[guard]);
    const renderResource=useCallback(({item}:{item:CatalogResource})=><CatalogResourceCard id={item.id} name={item.name} artworkUrl={item.artworkUrl} releaseYear={item.releaseYear} open={open}/>,[open]);
    const [kinds, setKinds] = useState<readonly CatalogResourceKind[]>([]), [source, setSource] = useState(''), [filtersError,setFiltersError]=useState(false), [filtersRetry,setFiltersRetry]=useState(0), [filtersLoading,setFiltersLoading]=useState(true);
    useEffect(() => { let alive = true;setFiltersError(false);setFiltersLoading(catalogEnabled()); if (catalogEnabled())
        void catalogRepository.providerInfo().then(info => { if (alive) {
            setKinds(info.resourceKinds);
            if(info.resourceKinds.length)setKind(current=>info.resourceKinds.includes(current)?current:info.resourceKinds[0]!);
            setSource(info.sourceLabel.replace(/\s*·\s*development provider/gi, ''));
        } }).catch(() => { if (alive)setFiltersError(true); }).finally(()=>{if(alive)setFiltersLoading(false);}); return () => { alive = false; }; }, [filtersRetry]);
    const load = async (next = 0,force=false) => { const version = ++generation.current; failedPage.current=next; if (!catalogEnabled()) {
        setBusy(false);setError('Catalog unavailable.');
        return;
    } if (!query.trim()) {
        setNodes([]);
        setMore(false);
        setBusy(false);
        setError(null);
        return;
    } const saved=views.get(key);if(!next&&!force&&saved){setNodes(saved.nodes);setPage(saved.page);setMore(saved.more);setBusy(false);setError(null);return;} setBusy(true); setError(null); try {
        const result = await requests.run(`${key}:${next}`,()=>catalogRepository.resources(kind, query.trim(), next),force);
        if (version !== generation.current)
            return;
        const previous=next?views.get(key)?.nodes??[]:[],merged=appendStable(previous,result.nodes);
        const hasMore=result.hasMore&&merged.length<500&&(!next||merged.length>previous.length);
        views.delete(key);views.set(key,{nodes:merged,page:next,more:hasMore});while(views.size>8)views.delete(views.keys().next().value!);
        setNodes(merged);setPage(next);setMore(hasMore);
    }
    catch {
        if (version === generation.current)
            setError('Catalog unavailable.');
    }
    finally {
        if (version === generation.current)
            setBusy(false);
    } };
    useEffect(() => { generation.current++; dataKey.current=key; const saved=views.get(key);setNodes(saved?.nodes??[]);setPage(saved?.page??0);setMore(saved?.more??false);setError(null);setBusy(false); const timer = setTimeout(() => { void load(); }, 300); return () => { generation.current++; clearTimeout(timer); }; }, [query, kind]);
    const pending = !visibleError && (visibleBusy || (!!query.trim() && catalogEnabled() && !views.has(key)));
    return <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}><FlatList ref={list} {...handlers} data={visibleNodes} maxToRenderPerBatch={8} keyExtractor={item => item.id} initialNumToRender={8} windowSize={5} keyboardShouldPersistTaps="handled" ListHeaderComponent={<View><PageHeader back title={kind.charAt(0).toUpperCase()+kind.slice(1)}/>
      {!!source && <Text style={[ui.subtitle,styles.credit]}>{source}</Text>}
      <View style={styles.search}><TextInput accessibilityLabel="Search albums, artists and playlists" value={query} onChangeText={setQuery} maxLength={160} placeholder="Search collections" placeholderTextColor={colors.muted} style={ui.input}/></View>
      {!!kinds.length && <FilterRow includeAll={false} title="Browse" values={kinds} selected={kind} select={value => { if (['albums', 'artists', 'playlists'].includes(value)) setKind(value as CatalogResourceKind); }}/>}
      {filtersLoading && !kinds.length && <ActivityIndicator size="small" color={colors.accent} accessibilityLabel="Loading catalog filters"/>}
      {filtersError && <View style={styles.notice}><Text style={ui.body} accessibilityLiveRegion="polite">Filters unavailable</Text><Button title="Retry filters" secondary onPress={()=>setFiltersRetry(value=>value+1)}/></View>}
      {visibleBusy && visibleNodes.length>0 && <ActivityIndicator size="small" color={colors.accent} accessibilityLabel="Loading music collections"/>}
      {visibleError && <View style={styles.notice}><Text style={ui.body} accessibilityLiveRegion="polite">{visibleError}</Text><Button title="Try again" secondary disabled={visibleBusy} onPress={() => { void load(failedPage.current,true); }}/></View>}
    </View>} ListEmptyComponent={pending ? <PlaylistListSkeleton resource /> : visibleError ? null : <EmptyState title={query.trim() ? 'No matching collections' : 'Search collections'}/> } ListFooterComponent={visibleMore ? <View style={styles.pagination}><Button title={visibleBusy ? 'Loading…' : 'Load more results'} disabled={visibleBusy} secondary onPress={() => { void load(visiblePage + 1); }}/></View> : null} renderItem={renderResource}/>
    </SafeAreaView>;
}
const styles=StyleSheet.create({search:{paddingHorizontal:20},credit:{paddingHorizontal:20,paddingBottom:12},notice:{padding:20,gap:10},pagination:{padding:20}});
