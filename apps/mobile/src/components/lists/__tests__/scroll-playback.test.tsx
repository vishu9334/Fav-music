import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
const h=vi.hoisted(()=>({slots:[] as unknown[],index:0,play:vi.fn(async()=>{}),push:vi.fn(),scrollToOffset:vi.fn()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
 useState:(initial:unknown)=>{const i=h.index++;if(!(i in h.slots))h.slots[i]=initial;return [h.slots[i],(value:unknown)=>{h.slots[i]=value;}];},
 useRef:(value:unknown)=>{const i=h.index++;if(!(i in h.slots))h.slots[i]={current:value===null?{scrollToOffset:h.scrollToOffset}:value};return h.slots[i];},
 useMemo:(factory:()=>unknown,deps:unknown[])=>{const i=h.index++,prior=h.slots[i] as {value:unknown;deps:unknown[]}|undefined;if(!prior||deps.some((value,index)=>value!==prior.deps[index]))h.slots[i]={value:factory(),deps};return (h.slots[i] as {value:unknown}).value;},
 useCallback:(callback:unknown,deps:unknown[])=>{const i=h.index++,prior=h.slots[i] as {value:unknown;deps:unknown[]}|undefined;if(!prior||deps.some((value,index)=>value!==prior.deps[index]))h.slots[i]={value:callback,deps};return (h.slots[i] as {value:unknown}).value;},
 useEffect:(effect:()=>unknown)=>{effect();},
}));
vi.mock('react-native',()=>({View:'View',Text:'Text',Image:'Image',Pressable:'Pressable',FlatList:'FlatList',StyleSheet:{create:(v:unknown)=>v,absoluteFillObject:{},hairlineWidth:1},useWindowDimensions:()=>({width:360,height:800,fontScale:1})}));
vi.mock('react-native-reanimated',()=>({default:{View:'AnimatedView',FlatList:'AnimatedFlatList'},interpolate:()=>1,useSharedValue:(value:number)=>({value}),useAnimatedStyle:(compute:()=>unknown)=>compute(),useAnimatedScrollHandler:(value:unknown)=>typeof value==='function'?value:(value as {onScroll:unknown}).onScroll}));
vi.mock('lucide-react-native',()=>({Music:'Music',MoreHorizontal:'More',Plus:'Plus',Minus:'Minus',Archive:'Archive',RotateCcw:'Restore'}));
vi.mock('expo-router',()=>({useRouter:()=>({push:h.push})}));
vi.mock('../../../design/useReducedMotion',()=>({useReducedMotion:()=>false}));
vi.mock('../../app/ui',()=>({colors:{},ui:{grow:{}},IconButton:'IconButton',EmptyState:'EmptyState'}));
vi.mock('../../library/LibrarySheets',()=>({TrackActionsSheet:'TrackActionsSheet'}));
vi.mock('../../library/LikeButton',()=>({LikeButton:'LikeButton'}));
vi.mock('../../../catalog/artwork-recovery',()=>({artworkRecovery:{recover:vi.fn(async()=>{})}}));
vi.mock('../../../store/usePlayerStore',()=>({usePlayerStore:Object.assign(()=>false,{getState:()=>({playQueue:h.play})})}));
vi.mock('../../../store/useLibraryStore',()=>({useLibraryStore:()=>false}));
import {ArtworkCarousel} from '../../carousel/ArtworkCarousel';
import {VideoPosterCarousel} from '../../../video/VideoPosterCarousel';
import {SongList} from '../../catalog/SongList';
import {listPositions} from '../scroll-interaction';
import type {IPlayableTrack} from '../../../data/sample-tracks';
import type {VideoItem} from '../../../video/video.contract';
const captured=JSON.parse(await readFile(new URL('../../../sharing/__tests__/fixtures/real-track-pages.json',import.meta.url),'utf8')).tracks as {id:string;title:string;artist:string}[];
const tracks:IPlayableTrack[]=captured.map(track=>({...track,url:'',artwork:'',duration:204,catalogSource:'catalog'}));
const videos=tracks.map(track=>({id:track.id,title:track.title,description:track.artist,source:{kind:'catalog',trackId:track.id,attribution:'Captured metadata only'}})) as VideoItem[];
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);vi.clearAllMocks();h.slots=[];h.index=0;});afterEach(()=>vi.useRealTimers());
const element=(node:unknown)=>node as import('react').JSX.Element;
describe('scrolling cannot select or start audio/video (mocked native UI)',()=>{
 it('audio artwork drags, momentum, programmatic synchronization and release never select a song',()=>{
  const selected=vi.fn(),tree=element(ArtworkCarousel({tracks,activeIndex:0,onTrackSelect:selected})),list=tree.props.children;
  expect(h.scrollToOffset).toHaveBeenCalled();list.props.onScrollBeginDrag();list.props.onScroll({contentOffset:{x:260}});list.props.onScrollEndDrag();list.props.onMomentumScrollBegin();list.props.onMomentumScrollEnd();
  const card=list.props.renderItem({item:tracks[1],index:1});card.props.choose();expect(selected).not.toHaveBeenCalled();vi.advanceTimersByTime(180);card.props.choose();expect(selected).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.play).not.toHaveBeenCalled();
 });
 it('video carousel scroll end never selects/autoplays an item; an explicit settled tap still selects',()=>{
  const selected=vi.fn(),tree=element(VideoPosterCarousel({items:videos,index:0,reduced:false,disabled:false,select:selected})),list=tree.props.children;
  list.props.onScrollBeginDrag();list.props.onScroll({contentOffset:{x:260}});list.props.onScrollEndDrag();list.props.onMomentumScrollBegin();list.props.onMomentumScrollEnd();expect(selected).not.toHaveBeenCalled();
  vi.advanceTimersByTime(180);list.props.renderItem({item:videos[1],index:1}).props.choose();expect(selected).toHaveBeenCalledExactlyOnceWith(1);expect(h.play).not.toHaveBeenCalled();
 });
 it('row presses generated during a scroll/release are dropped, without a delayed playback',()=>{
  const tree=element(SongList({tracks,label:'Scroll test',scrollKey:'test:scroll'})),list=tree.props.children[0],row=list.props.renderItem({item:tracks[0]});
  expect(list.props.onEndReached).toBeUndefined();list.props.onScrollBeginDrag();row.props.onPlayTrack(tracks[0]);list.props.onScrollEndDrag();row.props.onPlayTrack(tracks[0]);vi.advanceTimersByTime(200);expect(h.play).not.toHaveBeenCalled();
  row.props.onPlayTrack(tracks[0]);expect(h.play).toHaveBeenCalledExactlyOnceWith([tracks[0]],tracks[0]!.id,'Scroll test');expect(h.push).toHaveBeenCalledExactlyOnceWith('/player');
 });
 it('never restores an old offset over a user scroll while filtered songs are still loading',()=>{
  listPositions.set('test:pending-filter',700);
  let tree=element(SongList({tracks:[],label:'Filtered',scrollKey:'test:pending-filter',loading:true})),list=tree.props.children[0];
  list.props.onContentSizeChange(360,2400);expect(h.scrollToOffset).not.toHaveBeenCalled();
  list.props.onScrollBeginDrag();list.props.onScroll({nativeEvent:{contentOffset:{y:240}}});list.props.onScrollEndDrag();
  h.index=0;tree=element(SongList({tracks,label:'Filtered',scrollKey:'test:pending-filter',loading:false}));list=tree.props.children[0];list.props.onContentSizeChange(360,2800);
  expect(h.scrollToOffset).not.toHaveBeenCalled();expect(listPositions.get('test:pending-filter')).toBe(240);expect(h.play).not.toHaveBeenCalled();
 });
 it('retains memoized row data/callbacks on append, with bounded list batches and no playback from layout',()=>{
  let tree=element(SongList({tracks:tracks.slice(0,1),label:'Pagination',scrollKey:'test:append'})),list=tree.props.children[0];const oldRow=list.props.renderItem({item:tracks[0]}),oldRender=list.props.renderItem;
  h.index=0;tree=element(SongList({tracks,label:'Pagination',scrollKey:'test:append'}));list=tree.props.children[0];const row=list.props.renderItem({item:tracks[0]});
  expect(list.props.renderItem).toBe(oldRender);expect(row.props.track).toBe(oldRow.props.track);expect(row.props.onPlayTrack).toBe(oldRow.props.onPlayTrack);expect(row.props.onMenuTrack).toBe(oldRow.props.onMenuTrack);
  expect(list.props.initialNumToRender).toBe(8);expect(list.props.maxToRenderPerBatch).toBe(8);expect(list.props.windowSize).toBe(5);list.props.onContentSizeChange(360,2000);expect(h.play).not.toHaveBeenCalled();
 });
});


describe('Stage 7 skeleton list isolation',()=>{
 it('keeps exact loaded data, keys, scroll bindings and row identity when pagination is loading',()=>{
  let tree=element(SongList({tracks,label:'Loading isolation',scrollKey:'test:skeleton',loading:false})),list=tree.props.children[0];const row=list.props.renderItem({item:tracks[0]}),render=list.props.renderItem,data=list.props.data;
  h.index=0;tree=element(SongList({tracks,label:'Loading isolation',scrollKey:'test:skeleton',loading:true}));list=tree.props.children[0];
  expect(list.props.data).toBe(data);expect(list.props.data).toEqual([tracks[0]]);expect(list.props.renderItem).toBe(render);expect(list.props.renderItem({item:tracks[0]}).props.track).toBe(row.props.track);expect(list.props.keyExtractor(tracks[0])).toBe(tracks[0]!.id);
  list.props.onContentSizeChange(320,1000);expect(h.play).not.toHaveBeenCalled();expect(h.push).not.toHaveBeenCalled();
 });
 it('uses placeholders as empty content only and restores the original empty component once complete',()=>{
  let tree=element(SongList({tracks:[],label:'Initial load',loading:true}));expect(tree.props.children[0].props.ListEmptyComponent.type).not.toBe('EmptyState');
  h.index=0;tree=element(SongList({tracks:[],label:'Initial load',loading:false,emptyTitle:'No songs yet'}));expect(tree.props.children[0].props.ListEmptyComponent.type).toBe('EmptyState');expect(h.play).not.toHaveBeenCalled();
 });
});
