import { ArtworkSkeleton } from '../components/loading/Skeleton';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { CatalogCollection } from '@aadat/contracts';
import { catalogClient, catalogEnabled, catalogRepository } from '../catalog/catalog-runtime';
import { demoCatalog } from '../catalog/demo-catalog';
import { useCatalogStore } from '../store/useCatalogStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { Artwork } from '../design/Artwork';
import type { IPlayableTrack } from '../data/sample-tracks';
import { PageRequests } from '../catalog/page-requests';
import { SongList } from '../components/catalog/SongList';
import { Button, colors, PageHeader, ui } from '../components/app/ui';
export default function ProviderCollectionScreen(): React.JSX.Element {
    const router = useRouter();
    const { id } = useLocalSearchParams<{
        id?: string;
    }>(), [value, setValue] = useState<CatalogCollection | null>(null), [ids, setIds] = useState<readonly string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), generation = useRef(0), revision = useCatalogStore(s => s.revision);
    const requests=useRef(new PageRequests<CatalogCollection>()).current;
    const failedPage=useRef(0),snapshots=useRef(new Map<string,IPlayableTrack>()).current;
    const load = async (page = 0,force=false) => { const version = ++generation.current; failedPage.current=page; setBusy(true); setError(null); try {
        if (typeof id !== 'string' || !catalogEnabled())
            throw new Error();
        const result = await requests.run(`${id}:${page}`,()=>catalogRepository.collection(id as string,page),force);
        if (version !== generation.current)
            return;
        await catalogClient.remember(result.nodes);
        if (version !== generation.current)
            return;
        const nextIds=[...new Set([...(page?ids:[]),...result.nodes.map(node=>node.id)])].slice(0,500);
        for(const song of result.nodes){const track=demoCatalog.get(song.id);if(track&&nextIds.includes(song.id))snapshots.set(song.id,track);}
        setValue({...result,hasMore:result.hasMore&&nextIds.length<500&&(!page||nextIds.length>ids.length)});
        setIds(current=>current.length===nextIds.length&&current.every((id,index)=>id===nextIds[index])?current:nextIds);
    }
    catch {
        if (version === generation.current)
            setError('Collection unavailable.');
    }
    finally {
        if (version === generation.current)
            setBusy(false);
    } };
    useEffect(() => { generation.current++; setValue(null); setIds([]); snapshots.clear(); void load(); return () => { generation.current++; }; }, [id]);
    const tracks = useMemo(() => ids.flatMap(id=>{const track=demoCatalog.get(id)??snapshots.get(id);return track?[track]:[];}), [ids, revision]);
    const pending = !error && (busy || !value);
    return <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}><SongList minimalMetadata loading={pending} loadingLabel="Loading collection songs" emptyContent={error ? null : undefined} scrollKey={`provider-collection:${id}`} tracks={tracks} label={value?.resource.name ?? 'Provider collection'} header={<View><PageHeader back title={value?.resource.name ?? 'Catalog collection'}/>
 {busy && tracks.length>0 && <ActivityIndicator color={colors.accent} accessibilityLabel="Loading collection songs"/>}{error && <View style={{ padding: 20, gap: 12 }}><Text style={ui.body} accessibilityLiveRegion="polite">{error}</Text><Button title="Retry collection" disabled={busy} secondary onPress={() => { void load(failedPage.current,true); }}/></View>}
 <View style={{ padding: 20, gap: 16 }}>{pending&&!value ? <ArtworkSkeleton size={112} /> : <Artwork uri={value?.resource.artworkUrl ?? undefined} size={112} />}{value?.resource.sourceLabel && <Text style={ui.subtitle}>{value.resource.sourceLabel.replace(/\s*·\s*development provider/gi, '')}</Text>}<Button title="Play collection" disabled={!tracks.length} onPress={() => { const first = tracks[0]; if (first) { void usePlayerStore.getState().playQueue(tracks, first.id, value?.resource.name ?? 'Catalog collection'); router.push('/player'); } }} /></View></View>} footer={value?.hasMore ? <View style={{ padding: 20 }}><Button title={busy ? 'Loading…' : 'Load more songs'} secondary disabled={busy} onPress={() => { void load(value.page + 1); }}/></View> : undefined} emptyTitle={busy ? 'Loading songs…' : 'No available songs'} emptyMessage="Try another collection"/></SafeAreaView>;
}
