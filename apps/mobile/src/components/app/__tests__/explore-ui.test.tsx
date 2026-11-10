import type React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogCollection, CatalogProviderInfo, CatalogResource, CatalogResourcePage, CatalogSong } from '@aadat/contracts';
import type { IPlayableTrack } from '../../../data/sample-tracks';
const h=vi.hoisted(()=>({slots:[] as unknown[],index:0,jobs:[] as Array<()=>void>,params:{id:'10000000-0000-4000-8000-000000000001'},fontScale:1,
  provider:vi.fn(),resources:vi.fn(),collection:vi.fn(),remember:vi.fn(async(_songs:readonly CatalogSong[])=>{}),push:vi.fn(),play:vi.fn(async()=>{}),allow:vi.fn(()=>true),interactions:[] as {key:string;ready:boolean}[],tracks:new Map<string,IPlayableTrack>(),
}));
vi.mock('react',async original=>{
 const memo=(factory:()=>unknown,deps:unknown[])=>{const i=h.index++,old=h.slots[i] as {deps:unknown[];value:unknown}|undefined;if(!old||deps.length!==old.deps.length||deps.some((value,index)=>value!==old.deps[index]))h.slots[i]={deps,value:factory()};return(h.slots[i] as {value:unknown}).value;};
 return{...await original<typeof import('react')>(),memo:(component:unknown)=>component,useMemo:memo,useCallback:(callback:unknown,deps:unknown[])=>memo(()=>callback,deps),
 useState:(initial:unknown)=>{const i=h.index++;if(!(i in h.slots))h.slots[i]={value:typeof initial==='function'?initial():initial};const slot=h.slots[i] as {value:unknown};return[slot.value,(value:unknown)=>{slot.value=typeof value==='function'?value(slot.value):value;}];},
 useRef:(value:unknown)=>{const i=h.index++;return h.slots[i]??(h.slots[i]={current:value});},
 useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const i=h.index++,old=h.slots[i] as {deps:unknown[];cleanup?:()=>void}|undefined;if(old&&deps.length===old.deps.length&&deps.every((v,n)=>v===old.deps[n]))return;h.jobs.push(()=>{old?.cleanup?.();h.slots[i]={deps,cleanup:effect()};});},
 };
});
vi.mock('react-native',()=>({View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',FlatList:'FlatList',ScrollView:'ScrollView',ActivityIndicator:'ActivityIndicator',StyleSheet:{create:(v:unknown)=>v,hairlineWidth:1},useWindowDimensions:()=>({width:320,height:640,fontScale:h.fontScale})}));
vi.mock('react-native-safe-area-context',()=>({SafeAreaView:'SafeAreaView'}));
vi.mock('expo-router',()=>({useRouter:()=>({push:h.push}),useLocalSearchParams:()=>h.params}));
vi.mock('../ui',()=>({Button:'Button',EmptyState:'EmptyState',PageHeader:'PageHeader',colors:{line:'#393241',panel:'#17151D'},ui:{input:{},screen:{flex:1},subtitle:{fontSize:12},sectionTitle:{fontSize:16},body:{},grow:{flex:1,minWidth:0}}}));
vi.mock('../../../design/Artwork',()=>({Artwork:'Artwork'}));
vi.mock('../../catalog/SongList',()=>({SongList:'SongList'}));
vi.mock('../../loading/Skeleton',()=>({PlaylistListSkeleton:'PlaylistListSkeleton',ArtworkSkeleton:'ArtworkSkeleton'}));
vi.mock('../../../catalog/catalog-runtime',()=>({catalogEnabled:()=>true,catalogRepository:{providerInfo:h.provider,resources:h.resources,collection:h.collection},catalogClient:{remember:h.remember}}));
vi.mock('../../../catalog/demo-catalog',()=>({demoCatalog:{get:(id:string)=>h.tracks.get(id)}}));
vi.mock('../../../store/useCatalogStore',()=>({useCatalogStore:()=>0}));
vi.mock('../../../store/usePlayerStore',()=>({usePlayerStore:{getState:()=>({playQueue:h.play})}}));
vi.mock('../../lists/use-list-interaction',()=>{const guard={allowPress:h.allow};return{useListInteraction:(key:string,ready=true)=>{h.interactions.push({key,ready});return{guard,list:{current:null},handlers:{}};}};});
import Browse from '../../../screens/ProviderBrowseScreen';
import Collection from '../../../screens/ProviderCollectionScreen';
import { CatalogResourceCard as CardComponent } from '../../catalog/CatalogResourceCard';
import { FilterRow } from '../../discovery/FilterRow';
type Element=React.JSX.Element;
const resource:CatalogResource={id:'10000000-0000-4000-8000-000000000001',kind:'albums',name:'Unit contract album',artworkUrl:null,releaseYear:2018,sourceLabel:'JioSaavn · development provider'};
const second:CatalogResource={...resource,id:'20000000-0000-4000-8000-000000000002',name:'Second contract album'};
const third:CatalogResource={...resource,id:'30000000-0000-4000-8000-000000000003',name:'Third contract album'};
const info:CatalogProviderInfo={sourceLabel:'JioSaavn · development provider',developmentOnly:true,resourceKinds:['albums','artists','playlists'],remotePagination:true,videoSupported:false,recognitionSupported:false};
// Captured real metadata; resource envelopes above are isolated contract fixtures, not a claimed live catalog.
const songs=JSON.parse(readFileSync('apps/mobile/src/catalog/__tests__/fixtures/bycom-captured-metadata.json','utf8')) as CatalogSong[];
function nodes(node:unknown):Element[]{if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);const el=node as Element;return[el,...nodes(el.props?.children)];}
const button=(tree:unknown,title:string)=>nodes(tree).find(node=>node.type==='Button'&&node.props.title===title)!;
function render(component:typeof Browse|typeof Collection=Browse){h.index=0;h.jobs=[];const tree=component(),list=nodes(tree).find(node=>node.type==='FlatList'||node.type==='SongList')!;h.jobs.forEach(job=>job());return{tree,list,header:list.props.ListHeaderComponent??list.props.header};}
const input=(view:ReturnType<typeof render>)=>nodes(view.header).find(node=>node.type==='TextInput')!;
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function setup(){render();await settle();return render();}
async function search(query='Believer'){const view=render();input(view).props.onChangeText(query);render();await vi.advanceTimersByTimeAsync(300);await settle();return render();}
const page=(items:readonly CatalogResource[],more=false):CatalogResourcePage=>({nodes:items,page:0,total:null,hasMore:more});
const collection=(items:readonly CatalogSong[],page=0,hasMore=false):CatalogCollection=>({resource,nodes:items,page,total:null,hasMore});
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();h.slots=[];h.index=0;h.jobs=[];h.interactions=[];h.fontScale=1;h.tracks.clear();h.allow.mockReturnValue(true);h.provider.mockResolvedValue(info);h.resources.mockResolvedValue(page([resource]));h.collection.mockResolvedValue(collection([songs[0]!]));h.remember.mockImplementation(async values=>{for(const song of values)if(!h.tracks.has(song.id))h.tracks.set(song.id,{id:song.id,title:song.title,artist:song.artistName,duration:song.durationSeconds,url:'',artwork:'',catalogSource:'catalog'});});});
afterEach(()=>{for(const slot of h.slots)(slot as {cleanup?:()=>void}|undefined)?.cleanup?.();vi.useRealTimers();});
describe('Stage 13 Explore UI and request contracts (mocked native runtime)',()=>{
 it('uses category context, one provider credit and only actual supported resource filters',async()=>{
  const view=await setup(),header=nodes(view.header);expect(header.find(node=>node.type==='PageHeader')!.props).toMatchObject({title:'Albums',back:true});
  expect(header.filter(node=>node.props?.children==='JioSaavn')).toHaveLength(1);const filter=header.find(node=>node.type===FilterRow)!;expect(filter.props).toMatchObject({includeAll:false,values:info.resourceKinds,selected:'albums'});filter.props.select('artists');
  h.resources.mockResolvedValueOnce(page([{...resource,kind:'artists'}]));const next=await search();expect(h.resources).toHaveBeenLastCalledWith('artists','Believer',0);expect(nodes(next.header).find(node=>node.type==='PageHeader')!.props.title).toBe('Artists');expect(h.play).not.toHaveBeenCalled();
 });
 it('removes the nonfunctional All chip only for resource browsing; other filters retain their All action',()=>{
  const select=vi.fn(),target=FilterRow({title:'Browse',values:['albums','artists'],selected:'albums',select,includeAll:false});expect(target.props.children[1].props.children).toHaveLength(2);target.props.children[1].props.children[1].props.onPress();expect(select).toHaveBeenLastCalledWith('artists');
  const normal=FilterRow({title:'Season',values:['Monsoon'],selected:'Monsoon',select});expect(normal.props.children[1].props.children).toHaveLength(2);normal.props.children[1].props.children[0].props.onPress();expect(select).toHaveBeenLastCalledWith('');
 });
 it('joins rapid pagination taps, keeps the prefix and stable render callback, and stops duplicate-only pages',async()=>{
  await setup();h.resources.mockResolvedValueOnce(page([resource],true));let view=await search();const before=view.list.props.data,renderer=view.list.props.renderItem;
  let release!:(value:CatalogResourcePage)=>void;h.resources.mockImplementationOnce(()=>new Promise<CatalogResourcePage>(resolve=>{release=resolve;}));const more=button(view.list.props.ListFooterComponent,'Load more results');more.props.onPress();more.props.onPress();await settle();view=render();
  expect(h.resources).toHaveBeenCalledTimes(2);expect(view.list.props.data).toBe(before);expect(view.list.props.renderItem).toBe(renderer);expect(button(view.list.props.ListFooterComponent,'Loading…').props.disabled).toBe(true);expect(view.list.props.onEndReached).toBeUndefined();
  release(page([{...resource},second],true));await settle();view=render();expect(view.list.props.data.map((item:CatalogResource)=>item.id)).toEqual([resource.id,second.id]);expect(view.list.props.initialNumToRender).toBe(8);expect(view.list.props.windowSize).toBe(5);
  h.resources.mockResolvedValueOnce(page([second],true));button(view.list.props.ListFooterComponent,'Load more results').props.onPress();await settle();view=render();expect(view.list.props.data.map((item:CatalogResource)=>item.id)).toEqual([resource.id,second.id]);expect(view.list.props.ListFooterComponent).toBeNull();expect(h.play).not.toHaveBeenCalled();
 });
 it('retains the loaded prefix on page failure and retries that exact page without duplicates',async()=>{
  await setup();h.resources.mockResolvedValueOnce(page([resource],true));let view=await search();const before=view.list.props.data;h.resources.mockRejectedValueOnce(new Error('Offline'));button(view.list.props.ListFooterComponent,'Load more results').props.onPress();await settle();view=render();expect(view.list.props.data).toBe(before);expect(nodes(view.header).some(node=>node.props?.children==='Catalog unavailable.')).toBe(true);
  h.resources.mockResolvedValueOnce(page([second]));button(view.header,'Try again').props.onPress();await settle();view=render();expect(h.resources.mock.calls.map(call=>call[2])).toEqual([0,1,1]);expect(view.list.props.data.map((item:CatalogResource)=>item.id)).toEqual([resource.id,second.id]);
 });
 it('shows cached query pages immediately, never flashes another query’s rows or repeats its HTTP request',async()=>{
  await setup();h.resources.mockResolvedValueOnce(page([resource]));let view=await search('A');const saved=view.list.props.data;h.resources.mockResolvedValueOnce(page([third]));
  input(view).props.onChangeText('B');view=render();expect(view.list.props.data).toHaveLength(0);expect(h.interactions.at(-1)?.ready).toBe(false);await vi.advanceTimersByTimeAsync(300);await settle();view=render();expect(view.list.props.data[0].id).toBe(third.id);
  input(view).props.onChangeText('A');view=render();expect(view.list.props.data).toBe(saved);expect(h.interactions.at(-1)).toEqual({key:'provider-browse:albums:A',ready:true});await vi.advanceTimersByTimeAsync(300);await settle();expect(h.resources).toHaveBeenCalledTimes(2);
 });
 it('ignores stale search responses, preserves clear empty/error/loading states and retries failed filter capabilities',async()=>{
  h.provider.mockRejectedValueOnce(new Error('Offline'));let view=await setup();expect(button(view.header,'Retry filters')).toBeTruthy();button(view.header,'Retry filters').props.onPress();render();await settle();expect(h.provider).toHaveBeenCalledTimes(2);
  let release!:(value:CatalogResourcePage)=>void;h.resources.mockImplementationOnce(()=>new Promise<CatalogResourcePage>(resolve=>{release=resolve;}));view=await search('old');expect(view.list.props.ListEmptyComponent.type).toBe('PlaylistListSkeleton');h.resources.mockResolvedValueOnce(page([]));view=await search('new');expect(view.list.props.ListEmptyComponent.props.title).toBe('No matching collections');release(page([resource]));await settle();expect(render().list.props.data).toHaveLength(0);
 });
 it('keeps resource cards consistent, uncluttered and accessible with stable primitive props and guarded navigation',async()=>{
  await setup();const view=await search(),row=view.list.props.renderItem({item:resource}),copy=view.list.props.renderItem({item:{...resource}});expect(row.props).toEqual(copy.props);h.allow.mockReturnValue(false);row.props.open(resource.id);expect(h.push).not.toHaveBeenCalled();h.allow.mockReturnValue(true);row.props.open(resource.id);expect(h.push).toHaveBeenCalledExactlyOnceWith({pathname:'/provider-collection',params:{id:resource.id}});
  const Card=CardComponent as (props:React.ComponentProps<typeof CardComponent>)=>Element;for(const scale of [1,2]){h.fontScale=scale;const known=Card(row.props),unknown=Card({...row.props,releaseYear:null});expect(known.props.style[1]).toEqual(unknown.props.style[1]);expect(known.props.style[1].minHeight).toBe(scale===1?98:150);expect(known.props.accessibilityLabel).toBe(`Open ${resource.name}`);expect(nodes(unknown).some(node=>node.props?.children==='Year unavailable')).toBe(false);}
 });
 it('preserves exact real-song collection playback, unique paginated IDs and minimal title/artist presentation',async()=>{
  h.collection.mockResolvedValueOnce(collection([songs[0]!],0,true));render(Collection);await settle();let view=render(Collection);expect(view.list.props.minimalMetadata).toBe(true);expect(nodes(view.header).find(node=>node.type==='PageHeader')!.props.subtitle).toBeUndefined();expect(h.play).not.toHaveBeenCalled();
  h.collection.mockResolvedValueOnce(collection([songs[0]!,songs[1]!],1));button(view.list.props.footer,'Load more songs').props.onPress();await settle();view=render(Collection);expect(view.list.props.tracks.map((item:IPlayableTrack)=>item.id)).toEqual([songs[0]!.id,songs[1]!.id]);expect(view.list.props.footer).toBeUndefined();button(view.header,'Play collection').props.onPress();expect(h.play).toHaveBeenCalledExactlyOnceWith(view.list.props.tracks,songs[0]!.id,resource.name);expect(h.push).toHaveBeenLastCalledWith('/player');
 });
 it('preserves collection songs and retry page after an error instead of resetting the queue/list',async()=>{
  h.collection.mockResolvedValueOnce(collection([songs[0]!],0,true));render(Collection);await settle();let view=render(Collection);const before=view.list.props.tracks;h.collection.mockRejectedValueOnce(new Error('Offline'));button(view.list.props.footer,'Load more songs').props.onPress();await settle();view=render(Collection);expect(view.list.props.tracks).toBe(before);expect(view.list.props.emptyContent).toBeNull();
  h.collection.mockResolvedValueOnce(collection([songs[1]!],1));button(view.header,'Retry collection').props.onPress();await settle();view=render(Collection);expect(h.collection.mock.calls.map(call=>call[1])).toEqual([0,1,1]);expect(view.list.props.tracks.map((item:IPlayableTrack)=>item.id)).toEqual([songs[0]!.id,songs[1]!.id]);expect(h.play).not.toHaveBeenCalled();
 });
});
