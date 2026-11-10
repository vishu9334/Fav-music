import { SongListSkeleton } from '../components/loading/Skeleton';
import React, {memo, useCallback, useMemo, useRef} from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useDiscoveryStore } from '../store/useDiscoveryStore';
import { useCatalogStore } from '../store/useCatalogStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useLibraryStore } from '../store/useLibraryStore';
import type { IPlayableTrack } from '../data/sample-tracks';
import { demoCatalog } from '../catalog/demo-catalog';
import { Artwork } from '../design/Artwork';
import { useListInteraction } from '../components/lists/use-list-interaction';
import { historyRows } from '../components/lists/history-rows';
import type { PlayedTrack } from '../discovery/discovery.types';
import { Button, EmptyState, PageHeader, ui, colors } from '../components/app/ui';
const HistoryRow=memo(function HistoryRow({id,playedAt,track,replay}:{id:string;playedAt:number;track?:IPlayableTrack;replay:(id:string)=>void}):React.JSX.Element{
  const time=new Date(playedAt),when=Number.isFinite(time.getTime())?time.toLocaleString():'Time unavailable';
  return <Pressable accessibilityRole="button" accessibilityLabel={track?`Replay ${track.title} by ${track.artist}`:'Song unavailable'} accessibilityHint={`Last played ${when}`} accessibilityState={{disabled:!track}} disabled={!track} onPress={()=>replay(id)} style={styles.row}>
    <Artwork uri={track?.artwork} size={46}/><View style={ui.grow}><Text style={ui.sectionTitle} numberOfLines={2}>{track?.title??'Song unavailable'}</Text>{track&&<Text style={ui.subtitle} numberOfLines={1}>{track.artist}</Text>}</View>
  </Pressable>;
});
/** The same account journals remain the source of persistence; list identity is canonical song ID. */
export default function HistoryScreen(): React.JSX.Element {
  const history = useDiscoveryStore(s => s.history), ready = useDiscoveryStore(s => s.historyReady), error = useDiscoveryStore(s => s.historyError);
  const scope=useLibraryStore(s=>s.scope),status=useLibraryStore(s=>s.status);
  const revision = useCatalogStore(s => s.revision);
  const router = useRouter(),routerRef=useRef(router);routerRef.current=router;
  const rows=useMemo(()=>status==='ready'?historyRows(history):[],[history,status]);
  const {guard,list,handlers}=useListInteraction<PlayedTrack & {key:string}>(`history:${scope??'locked'}`,rows.length>0);
  const queue=useMemo(()=>rows.flatMap(entry=>{const t=demoCatalog.get(entry.trackId);return t?[t]:[];}),[rows,revision]);
  const replay=useCallback((id:string)=>{const track=demoCatalog.get(id);if(track&&guard.allowPress()){const activeQueue=queue.some(t=>t.id===id)?queue:[track];void usePlayerStore.getState().playQueue(activeQueue,id,'Listening history');routerRef.current.push('/player');}},[guard,queue]);
  const renderRow=useCallback(({item}:{item:PlayedTrack&{key:string}})=><HistoryRow id={item.trackId} playedAt={item.playedAt} track={demoCatalog.get(item.trackId)} replay={replay}/>,[revision,replay]);
  const visibleError=status==='ready'?error:null,pending=status==='loading'||(status==='ready'&&!ready&&!visibleError);
  return <SafeAreaView style={ui.screen} edges={['left','right']}><FlatList ref={list} {...handlers} data={rows} keyExtractor={entry => entry.key} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
    ListHeaderComponent={<View><PageHeader back title="Listening history" />{visibleError&&<View style={styles.notice}><Text style={ui.body} accessibilityLiveRegion="polite">{visibleError}</Text><Button title="Try again" secondary onPress={()=>{void useDiscoveryStore.getState().retryHistory();}}/></View>}</View>}
    ListEmptyComponent={pending ? <SongListSkeleton label="Loading listening history" /> : visibleError||status==='error' ? null : <EmptyState title="No history yet" />}
    renderItem={renderRow} />
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  row:{marginHorizontal:20,minHeight:76,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:colors.line},
  notice:{paddingHorizontal:20,paddingBottom:16,gap:10},
});
