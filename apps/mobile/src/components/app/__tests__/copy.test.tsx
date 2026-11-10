import React from 'react';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {SEASONS} from '../../../catalog/demo-catalog';
import {catalogQuery} from '../../../catalog/catalog-query';
import {SongList} from '../../catalog/SongList';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {IPlayableTrack} from '../../../data/sample-tracks';
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string};
const h=vi.hoisted(()=>({
 dimensions:{width:412,height:915,fontScale:1},surfaces:[] as unknown[],params:{} as {kind?:string;id?:string;value?:string},push:vi.fn(),load:vi.fn(async()=>{}),actions:new Map<string,()=>void>(),queries:[] as unknown[],
 library:{scope:'10000000-0000-4000-8000-000000000001',scopeVersion:1,status:'ready',error:null as string|null,sync:{status:'synced',message:'Account copy is synchronized.',revision:1},data:{likes:[] as string[],favourites:[] as string[],bookmarks:[] as string[],warehouse:[] as string[],warehouseStates:[],instamus:[],playlists:[] as {id:string;name:string;trackIds:string[]}[]}},
 player:{tracks:[] as IPlayableTrack[],activeTrackIndex:0,queueLabel:'Your music',isReducedMotion:false,playbackState:'PAUSED',position:10,duration:204,buffered:20,errorMessage:null as string|null,selectionVersion:()=>0,playQueue:vi.fn(async()=>{})},
 page:{tracks:[] as IPlayableTrack[],ids:[] as string[],query:{},status:'ready',error:null as string|null,cursor:null,hasMore:false},
 discovery:{period:'Morning',mood:null as string|null,season:'',decade:'',history:[] as {trackId:string;playedAt:number}[],historyReady:true,historyError:null as string|null,setSeason:vi.fn(),setMood:vi.fn(),setDecade:vi.fn(),clearFilters:vi.fn(),retryHistory:vi.fn(async()=>{})},
}));
vi.mock('react-native',()=>{
 const Box=({children,accessibilityLabel,accessibilityRole,accessibilityLiveRegion}:{children?:React.ReactNode;accessibilityLabel?:string;accessibilityRole?:string;accessibilityLiveRegion?:string})=>React.createElement('div',{'aria-label':accessibilityLabel,role:accessibilityRole,'aria-live':accessibilityLiveRegion},children);
 const Press=({children,disabled,accessibilityLabel,onPress}:{children?:React.ReactNode;disabled?:boolean;accessibilityLabel?:string;onPress?:()=>void})=>{
  const child=React.isValidElement<{children?:unknown}>(children)?children.props.children:null,label=accessibilityLabel??(typeof child==='string'?child:'');
  if(label&&onPress)h.actions.set(label,onPress);
  return React.createElement('button',{disabled,'aria-label':accessibilityLabel},children);
 };
 const content=(value:unknown)=>typeof value==='function'?React.createElement(value as React.ComponentType):value as React.ReactNode;
 return {View:Box,KeyboardAvoidingView:Box,Text:({children,accessibilityRole,accessibilityLiveRegion}:{children:React.ReactNode;accessibilityRole?:string;accessibilityLiveRegion?:string})=>React.createElement('span',{role:accessibilityRole,'aria-live':accessibilityLiveRegion},children),ScrollView:Box,Pressable:Press,TouchableOpacity:Press,Image:()=>React.createElement('img',{alt:'Artwork'}),
 TextInput:({accessibilityLabel,value,placeholder}:{accessibilityLabel?:string;value?:string;placeholder?:string})=>React.createElement('input',{'aria-label':accessibilityLabel,defaultValue:value,placeholder}),
 Modal:({visible,children}:{visible:boolean;children:React.ReactNode})=>visible?React.createElement('div',null,children):null,
 FlatList:({data,renderItem,ListHeaderComponent,ListFooterComponent,ListEmptyComponent}:{data:unknown[];renderItem:(info:{item:unknown;index:number})=>React.ReactNode;ListHeaderComponent?:unknown;ListFooterComponent?:unknown;ListEmptyComponent?:unknown})=>React.createElement('div',null,content(ListHeaderComponent),...(data.length?data.slice(0,4).map((item,index)=>React.createElement(React.Fragment,{key:index},renderItem({item,index}))):[content(ListEmptyComponent)]),content(ListFooterComponent)),
 Animated:{Value:class { constructor(_value:number){} },View:Box},
 ActivityIndicator:({accessibilityLabel}:{accessibilityLabel?:string})=>React.createElement('span',{'aria-label':accessibilityLabel??'Loading'}),
 StyleSheet:{create:(value:unknown)=>value,absoluteFill:{},absoluteFillObject:{},hairlineWidth:1},Platform:{OS:'android'},Alert:{alert:vi.fn()},Linking:{openURL:vi.fn()},useWindowDimensions:()=>h.dimensions};
});
vi.mock('react-native-safe-area-context',()=>({SafeAreaView:({children}:{children:React.ReactNode})=>React.createElement('main',null,children),useSafeAreaInsets:()=>({left:0,right:0,top:0,bottom:0})}));
vi.mock('lucide-react-native',()=>new Proxy({}, {get:(_target,key)=>key==='then'?undefined:key==='__esModule'?true:()=>React.createElement('i',{'aria-hidden':true}),has:()=>true}));
vi.mock('expo-router',()=>({useRouter:()=>({push:h.push,replace:h.push,back:vi.fn(),canGoBack:()=>true}),useLocalSearchParams:()=>h.params,useFocusEffect:()=>{}}));
vi.mock('../../../design/GlassSurface',()=>({GlassSurface:({children,style}:{children:React.ReactNode;style?:unknown})=>{h.surfaces.push(style);return React.createElement('section',null,children);}}));
vi.mock('../../../design/NostalgicCassette',()=>({NostalgicCassette:()=>React.createElement('svg',{'aria-hidden':true,'data-memory':'cassette'})}));
vi.mock('../../../design/useReducedMotion',()=>({useReducedMotion:()=>true}));
vi.mock('../../../store/useLibraryStore',()=>({useLibraryStore:Object.assign((select:(value:typeof h.library)=>unknown)=>select(h.library),{getState:()=>h.library})}));
vi.mock('../../../store/usePlayerStore',()=>({usePlayerStore:Object.assign((select:(value:typeof h.player)=>unknown)=>select(h.player),{getState:()=>h.player})}));
vi.mock('../../../store/useCatalogStore',()=>({useCatalogStore:Object.assign((select:(value:unknown)=>unknown)=>select({revision:0,...h.page,pages:new Proxy({}, {get:()=>h.page})}),{getState:()=>({...h.page,load:h.load})})}));
vi.mock('../../../store/useDiscoveryStore',()=>({useDiscoveryStore:Object.assign((select:(value:typeof h.discovery)=>unknown)=>select(h.discovery),{getState:()=>h.discovery}),recommendations:{candidates:()=>h.page.tracks}}));
vi.mock('../../../catalog/use-catalog-page',()=>({useCatalogPage:(query:unknown)=>{h.queries.push(query);return h.page;}}));
vi.mock('../../../catalog/catalog-runtime',()=>({catalogEnabled:()=>true,catalogClient:{},catalogRepository:{},mediaLeases:{resolve:vi.fn(async()=>new Map())}}));
vi.mock('../../../catalog/artwork-recovery',()=>({artworkRecovery:{recover:vi.fn(async()=>{})}}));
vi.mock('../../kobra/MorphingHeart',()=>({MorphingHeart:()=>React.createElement('i',{'aria-hidden':true})}));
vi.mock('../../library/LikeButton',()=>({LikeButton:({title}:{title:string})=>React.createElement('button',{'aria-label':`Like ${title}`})}));
vi.mock('../../carousel/ArtworkCarousel',()=>({ArtworkCarousel:()=>React.createElement('div',{'aria-label':'Artwork carousel'})}));
vi.mock('../../kobra/KobraPlaybackControls',()=>({KobraPlaybackControls:()=>React.createElement('div',null,...['Previous track','Play','Next track'].map(label=>React.createElement('button',{key:label,'aria-label':label},label)))}));
vi.mock('../../../sharing/sharing',()=>({shareLinks:{},sharedContentLoader:{}}));
vi.mock('expo-modules-core',()=>({requireOptionalNativeModule:()=>null}));
import {demoCatalog} from '../../../catalog/demo-catalog';
import {PageHeader,EmptyState,LibraryNotice} from '../ui';
import {FeatureLinks} from '../FeatureLinks';
import {FilterRow} from '../../discovery/FilterRow';
import {syncCaption} from '../sync-caption';
import {colors} from '../../../design/theme';
import Home from '../../../screens/HomeScreen';
import Search from '../../../screens/SearchScreen';
import Library from '../../../screens/LibraryScreen';
import Warehouse from '../../../screens/WarehouseScreen';
import Collection from '../../../screens/CollectionScreen';
import Player from '../../../screens/PlayerScreen';
import Playlist from '../../../screens/PlaylistScreen';
import Discovery from '../../../screens/DiscoveryScreen';
import InstaMus from '../../../screens/InstaMusScreen';
import History from '../../../screens/HistoryScreen';
import Browse from '../../../screens/ProviderBrowseScreen';
import ProviderCollection from '../../../screens/ProviderCollectionScreen';
import Video from '../../../screens/VideoScreen';
import {SharedReview} from '../../../screens/SharedContentScreen';
const track:IPlayableTrack={id:'f5e75856-4598-8a85-8509-3e90deb1afe4',title:'Believer',artist:'Imagine Dragons',album:'Evolve',duration:204,url:'',artwork:'',catalogSource:'catalog'};
const html=(component:React.ComponentType)=>renderToStaticMarkup(React.createElement(component));
const text=(markup:string)=>markup.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
beforeEach(()=>{vi.clearAllMocks();h.surfaces=[];h.dimensions={width:412,height:915,fontScale:1};h.actions.clear();h.queries=[];h.page.query={};h.page.status='ready';h.page.error=null;h.page.hasMore=false;h.discovery.season='';h.discovery.decade='';h.discovery.mood=null;h.discovery.history=[];h.discovery.historyReady=true;h.discovery.historyError=null;h.params={};h.library.status='ready';h.library.error=null;h.library.sync={status:'synced',message:'Account copy is synchronized.',revision:1};h.library.data={likes:[track.id],favourites:[],bookmarks:[],warehouse:[track.id],warehouseStates:[],instamus:[],playlists:[{id:'p',name:'My playlist',trackIds:[track.id]}]};h.player.tracks=[track];h.player.errorMessage=null;h.page.tracks=[track];h.page.ids=[track.id];demoCatalog.upsert([{track,seasons:[],releaseYear:2018}]);});
describe('clean screen copy with mocked native rendering',()=>{
 it('keeps headers/back/actions and avoids automatic slogans or empty paragraphs',()=>{
  expect(text(renderToStaticMarkup(<PageHeader title="Search" back />))).toBe('Search');expect(renderToStaticMarkup(<PageHeader title="Search" back />)).toContain('aria-label="Back"');
  const empty=renderToStaticMarkup(<EmptyState title="No playlists yet" />);expect(text(empty)).toBe('No playlists yet');expect(empty).not.toContain('<span></span>');
 });
 it('keeps Home categories, artwork and Play while removing promo and category descriptions/counts',()=>{
  const markup=html(Home),copy=text(markup);for(const title of ['Bollywood for you','Through the decades','Seasons','Recently played','Bollywood songs'])if(title!=='Recently played')expect(copy).toContain(title);
  expect(copy).toContain('Play Bollywood');expect(copy).not.toMatch(/world slow down|little room|provider-reported|seasonal moods|YOUR SPACE|TRACKS|available$/i);expect(copy).not.toContain('1 tracks');
 });
 it('keeps all feature routes and accessible descriptions without duplicating visible card subtitles',()=>{
  const markup=renderToStaticMarkup(<FeatureLinks/>),copy=text(markup);for(const title of ['Your moment','Music videos','Explore catalog','Listening history','Your account','Open discovery'])expect(copy).toContain(title);
  expect(copy).not.toMatch(/LITTLE SOMETHING|Mood & discovery|Watch & listen|Reels & saved notes|Your confirmed plays/);expect(markup).toContain('aria-label="Your moment, Mood &amp; discovery"');
 });
 it('keeps Search inputs/filter actions, real song metadata and menus without result-count paragraphs',()=>{
  const markup=html(Search),copy=text(markup);expect(markup).toContain('Search songs, artists and albums');expect(copy).toContain('Believer');expect(copy).toContain('Imagine Dragons');expect(copy).toContain('Browse albums, artists and provider playlists');expect(markup).toContain('Like Believer');expect(markup).toContain('More actions for Believer');expect(copy).not.toMatch(/loaded track|Find something that stays|YOUR MUSIC IN ONE PLACE/);
 });
 it('keeps Library and Warehouse titles, filters, navigation actions and concise status',()=>{
  expect(text(html(Library))).toContain('Liked Tracks');const copy=text(html(Warehouse));for(const required of ['Music Warehouse','Active','Removed','Hidden','Find a song','Synced'])expect(copy).toContain(required);expect(copy).not.toMatch(/all together|SAFE, SOUND|keeps it available|references await|Active ·/);
 });
 it('keeps collection and playlist controls while removing redundant availability counts',()=>{
  h.params={kind:'likes'};expect(text(html(Collection))).toContain('Liked Tracks');expect(text(html(Collection))).not.toMatch(/available tracks|on this device/);
  h.params={id:'p'};const copy=text(html(Playlist));for(const required of ['My playlist','Play playlist','Rename playlist','Share playlist','Delete playlist'])expect(copy).toContain(required);expect(copy).not.toMatch(/available of|Use \+ to add|YOUR PERSONAL/);
 });
 it('keeps Player metadata, attribution, queue and accessible transport without redundant queue counts',()=>{
  const markup=html(Player),copy=text(markup);for(const required of ['Believer','Imagine Dragons','Evolve','Up next'])expect(copy).toContain(required);for(const label of ['Previous track','Play','Next track','Close player'])expect(markup).toContain(`aria-label="${label}"`);expect(copy).not.toMatch(/YOUR MUSIC|1 tracks/);
 });
 it('preserves full useful errors instead of truncating them to three words',()=>{
  h.player.errorMessage='The authorized source is unavailable. Reconnect and retry this exact song.';expect(text(html(Player))).toContain(h.player.errorMessage);expect(text(html(Player))).toContain('Try playback again');h.library.error='The collection could not be saved. Your previous version is intact.';expect(text(renderToStaticMarkup(<LibraryNotice/>))).toContain(h.library.error);
 });
 it('keeps Discovery, InstaMus and History actions and necessary manual-matching feedback',()=>{
  const discovery=text(html(Discovery));expect(discovery).not.toContain('How mixes work');expect(discovery).toContain('Recommended tracks');expect(discovery).not.toMatch(/Time ranks|location or weather|Recommended tracks ·/);
  const insta=html(InstaMus);expect(text(insta)).toContain('Manual matching');expect(insta).toContain('Instagram reel link');expect(text(insta)).toContain('Save reel');expect(insta).toContain('Save reel link and note');expect(text(insta)).not.toMatch(/loaded results|notes and manual selections|Saved reel links ·/);
  expect(text(html(History))).not.toMatch(/100 confirmed|No history is invented/);
 });
 it('keeps browse/video actions and exact shared-song identity without descriptive count copy',()=>{
  expect(text(html(Browse))).toContain('Albums');expect(text(html(Browse))).not.toContain('Explore the catalog');const video=text(html(Video));expect(video).toContain('Search music');expect(video).not.toContain('Retry videos');expect(video).not.toContain('Retry catalog');expect(video).not.toContain('right where you left them');
  const shared=text(renderToStaticMarkup(<SharedReview title={track.title} playlist={false} ids={[track.id]} tracks={[track]} unavailable={0} ready/>));expect(shared).toContain('Believer');expect(shared).toContain('Imagine Dragons');expect(shared).toContain('Play shared tracks');expect(shared).not.toMatch(/tracks have available metadata|Nothing is saved or played automatically/);
 });
});
describe('short routine sync copy',()=>{
 it('uses at most three words for routine status and retains actionable errors/conflicts',()=>{
  for(const status of ['synced','syncing','pending','blocked'] as const)expect(syncCaption({status,message:'Long redundant routine explanation.',revision:0}).split(/\s+/).length).toBeLessThanOrEqual(3);
  for(const status of ['offline','conflict'] as const){const message='The account could not synchronize. Review both copies before trying again.';expect(syncCaption({status,message,revision:0})).toBe(message);}
 });
});


// This is captured provider-derived season metadata, not a fabricated song/genre assignment.
const capturedSeasons=JSON.parse(readFileSync('apps/mobile/src/catalog/__tests__/fixtures/bycom-captured-metadata.json','utf8')) as {id:string;title:string;artistName:string;albumName:string|null;durationSeconds:number;seasonAffinities:string[]}[];
const rainSong=capturedSeasons.find(song=>song.seasonAffinities.includes('MONSOON'))!;
const rain:IPlayableTrack={id:rainSong.id,title:rainSong.title,artist:rainSong.artistName,album:rainSong.albumName??undefined,duration:rainSong.durationSeconds,url:'',artwork:'',catalogSource:'catalog'};
describe('seasonal category presentation and unchanged controls',()=>{
 it.each(SEASONS)('shows one %s category title with concise empty feedback and Back',season=>{
  h.params={kind:'season',value:season};const markup=html(Collection),copy=text(markup);
  expect(copy.match(new RegExp(`\\b${season}\\b`,'g'))).toHaveLength(1);expect(copy).not.toMatch(/available tracks|loaded tracks|seasonal mix|Try another selection/);
  expect(markup).toContain('aria-label="Back"');expect(copy).toContain('No songs yet');expect(markup).toContain('aria-live="polite"');expect(h.queries).toContainEqual(catalogQuery({season}));
 });
 it('keeps all five category actions and changes no playback during seasonal navigation',()=>{
  const copy=text(html(Home));expect(copy).toContain('Seasons');expect(copy).not.toContain('A sound for every season');
  for(const season of SEASONS){h.actions.get(`Browse ${season} mix`)!();expect(h.discovery.setSeason).toHaveBeenLastCalledWith(season);expect(h.push).toHaveBeenLastCalledWith({pathname:'/collection',params:{kind:'season',value:season}});}
  expect(h.player.playQueue).not.toHaveBeenCalled();
 });
 it('keeps real Monsoon title/artist and exact Play/Load More targets, without extra row metadata',()=>{
  demoCatalog.upsert([{track:rain,seasons:['Monsoon']}]);h.page.tracks=[rain];h.page.ids=[rain.id];h.params={kind:'season',value:'Monsoon'};h.page.query=catalogQuery({season:'Monsoon'});h.page.hasMore=true;
  const markup=html(Collection),copy=text(markup);expect(copy).toContain(rain.title);expect(copy).toContain(rain.artist);if(rain.album)expect(copy).not.toContain(`${rain.artist} · ${rain.album}`);expect(copy).not.toContain(`${Math.floor(rain.duration/60)}:${String(rain.duration%60).padStart(2,'0')}`);
  expect(markup).toContain(`aria-label="Like ${rain.title}"`);
  expect(h.actions.has(`More actions for ${rain.title}`)).toBe(true);h.actions.get('Load more tracks')!();expect(h.load).toHaveBeenCalledExactlyOnceWith(catalogQuery({season:'Monsoon'}),true);
  h.actions.get(`Play ${rain.title} by ${rain.artist}`)!();expect(h.player.playQueue).toHaveBeenCalledExactlyOnceWith([rain],rain.id,'Monsoon');expect(h.push).toHaveBeenLastCalledWith('/player');
 });
 it('retains ordinary row metadata outside seasonal views and compacts only seasonal headers',()=>{
  const plain=text(renderToStaticMarkup(<SongList tracks={[track]} label="Ordinary list"/>)),seasonal=text(renderToStaticMarkup(<SongList tracks={[track]} label="Season" minimalMetadata/>));
  expect(plain).toContain('Evolve');expect(plain).toContain('3:24');expect(seasonal).not.toContain('Evolve');expect(seasonal).not.toContain('3:24');expect(seasonal).toContain('Imagine Dragons');
  const normal=PageHeader({title:'Search'}),compact=PageHeader({title:'Monsoon',compact:true});expect(compact.props.style[0]).toBe(normal.props.style[0]);expect(compact.props.style[1]).toEqual({paddingTop:16,paddingBottom:12,gap:0});expect(normal.props.style[1]).toBe(false);
 });
 it('shows loading or a useful error/retry without a contradictory empty-state card',()=>{
  h.params={kind:'season',value:'Spring'};h.page.status='unavailable';let markup=html(Collection);expect(markup).toContain('Loading music catalog');expect(text(markup)).not.toContain('Music unavailable');
  h.page.status='loading';markup=html(Collection);expect(markup).toContain('Loading music catalog');expect(text(markup)).not.toMatch(/No songs yet|No available songs|Try another selection/);
  h.page.status='error';h.page.error='The seasonal catalog is offline. Reconnect and retry.';markup=html(Collection);expect(text(markup)).toContain(h.page.error);expect(text(markup)).toContain('Retry catalog');expect(text(markup)).not.toContain('No songs yet');h.actions.get('Retry catalog')!();expect(h.load).toHaveBeenLastCalledWith(catalogQuery({season:'Spring'}),false,true);
 });
});


describe('Stage 7 loading presentation with mocked native rendering',()=>{
 it('renders song skeletons only for first loads and keeps pending/empty/error states distinct',()=>{
  h.page.status='loading';h.page.tracks=[];h.page.ids=[];
  let markup=html(Search);expect(markup).toContain('role="progressbar"');expect(markup).toContain('Loading music catalog');expect(text(markup)).not.toContain('No matching tracks found');
  h.page.status='ready';markup=html(Search);expect(markup).not.toContain('role="progressbar"');expect(text(markup)).toContain('No matching tracks found');
  h.page.status='error';h.page.error='The music service is offline. Retry when connected.';markup=html(Search);expect(markup).not.toContain('role="progressbar"');expect(text(markup)).toContain(h.page.error);expect(text(markup)).toContain('Retry catalog');expect(text(markup)).not.toContain('No matching tracks found');
 });
 it('preserves visible songs/controls during pagination and refresh without skeleton replacement',()=>{
  h.page.status='loading';h.page.hasMore=true;const markup=html(Search);expect(markup).not.toContain('role="progressbar"');expect(text(markup)).toContain('Believer');expect(markup).toContain('Like Believer');expect(markup).toContain('Loading music catalog');expect(text(markup)).toContain('Loading…');expect(h.player.playQueue).not.toHaveBeenCalled();expect(h.load).not.toHaveBeenCalled();
  expect(html(Search)).not.toContain('role="progressbar"');
 });
 it('uses first-load artwork/list skeletons on Home while known categories remain usable',()=>{
  const spy=vi.spyOn(demoCatalog,'tracks').mockReturnValue([]);h.page.status='unavailable';h.page.tracks=[];h.page.ids=[];
  try{const markup=html(Home);expect(markup).toContain('Loading artwork');expect(markup).toContain('Loading music catalog');expect(text(markup)).not.toContain('No tracks yet');for(const season of SEASONS)expect(markup).toContain(`Browse ${season} mix`);expect(h.player.playQueue).not.toHaveBeenCalled();}finally{spy.mockRestore();}
 });
 it('keeps cached Home and Discovery content visible during background loading',()=>{
  h.page.status='loading';for(const component of [Home,Discovery]){const markup=html(component);expect(markup).not.toContain('role="progressbar"');expect(text(markup)).toContain('Believer');}
 });
 it('loads Library, Warehouse, saved links and playlist details with matching placeholders',()=>{
  h.library.status='loading';h.library.data.playlists=[];h.library.data.likes=[];h.library.data.warehouse=[];
  let markup=html(Library);expect(markup).toContain('Loading playlists');expect(text(markup)).not.toContain('No playlists yet');expect(text(markup)).toContain('Liked Tracks');
  markup=html(Warehouse);expect(markup).toContain('Loading Warehouse');expect(text(markup)).not.toContain('Save a song');
  markup=html(InstaMus);expect(markup).toContain('Loading saved links');expect(text(markup)).not.toContain('Keep a discovery for later');
  markup=html(Playlist);expect(markup).toContain('Loading playlist songs');expect(text(markup)).not.toContain('Playlist unavailable');
 });
 it('keeps saved playlists and Warehouse songs visible while their account copy is refreshing',()=>{
  h.library.status='loading';expect(html(Library)).not.toContain('role="progressbar"');expect(text(html(Library))).toContain('My playlist');expect(html(Warehouse)).not.toContain('role="progressbar"');expect(text(html(Warehouse))).toContain('Believer');h.params={id:'p'};expect(html(Playlist)).not.toContain('role="progressbar"');expect(text(html(Playlist))).toContain('My playlist');
 });
 it('returns real empty Library/Warehouse states when hydration completes; exposes errors rather than skeletons',()=>{
  h.library.data.playlists=[];h.library.data.warehouse=[];h.library.data.likes=[];expect(text(html(Library))).toContain('No playlists yet');expect(text(html(Warehouse))).toContain('Save a song');
  h.library.status='error';h.library.error='This account library could not be opened. Please retry.';for(const component of [Library,Warehouse]){const markup=html(component);expect(markup).not.toContain('role="progressbar"');expect(text(markup)).toContain(h.library.error);expect(text(markup)).toContain('Retry');}
 });
 it('adds history and provider-collection first-load skeletons without starting requests/playback at render',()=>{
  h.discovery.historyReady=false;const markup=html(History);expect(markup).toContain('Loading listening history');expect(text(markup)).not.toContain('No history yet');expect(h.player.playQueue).not.toHaveBeenCalled();expect(h.load).not.toHaveBeenCalled();h.discovery.historyReady=true;const collection=html(ProviderCollection);expect(collection).toContain('Loading collection songs');expect(collection).toContain('Loading artwork');expect(text(collection)).not.toContain('No available songs');
 });
});


describe('Stage 9 Home copy and preserved functionality',()=>{
 it('plays each recording once from Home even when provider IDs differ',()=>{
  h.page.tracks=[track,{...track,id:'duplicate-provider-recording'}];html(Home);
  h.actions.get('Play Bollywood')!();expect(h.player.playQueue).toHaveBeenCalledExactlyOnceWith([track],track.id,'Bollywood');
 });
 it('keeps clear section titles without slogans, decorative counts, duplicated headings or a leading card dot',()=>{
  const markup=html(Home),copy=text(markup);for(const title of ['Bollywood for you','Explore','Through the decades','Seasons','Bollywood songs'])expect(markup.split(`>${title}</span>`).length-1).toBe(1);expect(markup).toContain('role="header">Bollywood for you');
  expect(copy).not.toMatch(/Your space|\b\d+ tracks?\b|Discover your music|A space that['’]s yours|Find your rhythm|Find your feeling|[•●·]\s*Your music/i);
  expect(copy).toContain('Believer');expect(copy).toContain('Imagine Dragons');expect(h.player.playQueue).not.toHaveBeenCalled();
 });
 it('retains the exact Home play queue and pagination action after copy cleanup',()=>{
  h.page.hasMore=true;html(Home);h.actions.get('Load more music')!();expect(h.load).toHaveBeenCalledExactlyOnceWith({query:'Bollywood'},true);expect(h.player.playQueue).not.toHaveBeenCalled();
  h.actions.get('Play Bollywood')!();expect(h.player.playQueue).toHaveBeenCalledExactlyOnceWith([track],track.id,'Bollywood');expect(h.push).toHaveBeenLastCalledWith('/player');
 });
 it('retains every feature action and accessible description while using one meaningful Explore heading',()=>{
  html(Home);for(const [label,route]of [['Your moment, Mood & discovery','/discovery'],['Music videos, Watch & listen','/videos'],['Explore catalog, Artists & albums','/provider-browse'],['Listening history, Your confirmed plays','/history'],['Your account, Profile & collections','/profile']]){h.actions.get(label!)!();expect(h.push).toHaveBeenLastCalledWith(route);}
  expect(h.player.playQueue).not.toHaveBeenCalled();
 });
 it('keeps full library/catalog failures and retry controls instead of removing necessary feedback',()=>{
  h.library.error='Your saved library could not be updated. Please retry.';h.library.status='error';h.page.status='error';h.page.error='The catalog connection failed. Reconnect and retry.';
  const copy=text(html(Home));expect(copy).toContain(h.library.error);expect(copy).toContain(h.page.error);expect(copy).toContain('Retry');expect(copy).toContain('Retry catalog');
 });
 it('removes reserved artwork space on small screens and large fonts while preserving hero typography/palette',()=>{
  h.page.tracks=[{...track,artwork:'test-artwork'}]; // Render-only fixture; Image is mocked above.
  for(const dimensions of [{width:320,height:640,fontScale:1},{width:412,height:915,fontScale:1.5}]){
   h.dimensions=dimensions;h.surfaces=[];const markup=html(Home),hero=h.surfaces[0] as [{minHeight:number;marginTop:number;padding:number;borderRadius:number;backgroundColor:string},{minHeight:number;paddingBottom:number}];
   expect(hero[0]).toMatchObject({marginTop:18,padding:18,borderRadius:24,backgroundColor:colors.hero,minHeight:300});expect(hero[1]).toEqual({minHeight:0,paddingBottom:24});expect(markup).not.toContain('Loading artwork');expect(markup).not.toContain('data-memory="cassette"');expect(text(markup)).toContain('Play Bollywood');
  }
 });
});


describe('Stage 17 restrained nostalgic detail',()=>{
 it('shows one decorative cassette without adding text, navigation or autoplay',()=>{
  h.page.tracks=[{...track,artwork:'test-artwork'}]; // Render-only fixture; no media request.
  const markup=html(Home);expect(markup.match(/data-memory="cassette"/g)).toHaveLength(1);expect(markup).toContain('alt="Artwork"');expect(text(markup)).not.toMatch(/cassette|mixtape/i);expect(h.player.playQueue).not.toHaveBeenCalled();expect(h.push).not.toHaveBeenCalled();
 });
});


describe('Stage 10 Your Moment cleanup and responsive flow',()=>{
 it('keeps meaningful titles and filters without detail controls, explanations or decorative counts',()=>{
  const markup=html(Discovery),copy=text(markup);for(const title of ['Your moment','Morning','Mood','Season','Release years','Recently played','Recommended tracks'])expect(copy).toContain(title);
  expect(copy).not.toMatch(/Hide mix details|How mixes work|Keyword matching|Recent tracks deprioritized|Seasons are your choice|location or weather|no verified release year|appear in Undated|recommended tracks ·|\b\d+ tracks?\b/i);
  expect(markup).toContain('aria-label="Back"');expect(markup).toContain('Like Believer');expect(markup).toContain('More actions for Believer');expect(h.player.playQueue).not.toHaveBeenCalled();
 });
 it.each([['High Energy','Energy'],['Dil Se','Reflective'],['Peaceful','Focus'],['Chill & Relax','Calm']])('selects the valid %s vibe without starting stale audio', (title,mood)=>{
  html(Discovery);h.actions.get(`Vibe ${title}`)!();expect(h.discovery.setMood).toHaveBeenLastCalledWith(mood);expect(h.player.playQueue).not.toHaveBeenCalled();
 });
 it('does not substitute unrelated cached songs into an empty selected filter page',()=>{
  h.discovery.mood='Energy';h.page.tracks=[];h.page.ids=[];
  expect(text(html(Discovery))).toContain('No matching tracks');expect(text(html(Discovery))).not.toContain('Believer');
 });
 it('retains all mood/season/year filter actions, including Undated, without starting playback',()=>{
  html(Discovery);h.actions.get('Mood: Calm')!();expect(h.discovery.setMood).toHaveBeenLastCalledWith('Calm');h.discovery.mood='Calm';html(Discovery);h.actions.get('Mood: All')!();expect(h.discovery.setMood).toHaveBeenLastCalledWith(null);
  h.actions.get('Season: Monsoon')!();expect(h.discovery.setSeason).toHaveBeenLastCalledWith('Monsoon');h.actions.get('Release years: Undated')!();expect(h.discovery.setDecade).toHaveBeenLastCalledWith('Undated');expect(h.player.playQueue).not.toHaveBeenCalled();
 });
 it('preserves exact filtered Load More, clear-filter and history-navigation actions',()=>{
  h.discovery.season='Monsoon';h.page.hasMore=true;html(Discovery);h.actions.get('Load more recommendations')!();expect(h.load).toHaveBeenCalledExactlyOnceWith(catalogQuery({mood:null,season:'Monsoon',decade:''}),true);
  h.actions.get('Clear discovery filters')!();expect(h.discovery.clearFilters).toHaveBeenCalledOnce();
  h.actions.get('View full listening history')!();expect(h.push).toHaveBeenLastCalledWith('/history');expect(h.player.playQueue).not.toHaveBeenCalled();
 });
 it('shows real recent-track details and preserves explicit replay of the exact recent queue',()=>{
  h.discovery.history=[{trackId:track.id,playedAt:100}];const copy=text(html(Discovery));expect(copy.match(/Believer/g)).toHaveLength(2);expect(copy.match(/Imagine Dragons/g)).toHaveLength(2);expect(h.player.playQueue).not.toHaveBeenCalled();
  h.actions.get('Replay Believer')!();expect(h.player.playQueue).toHaveBeenCalledExactlyOnceWith([track],track.id,'Recently played music');
 });
 it('preserves complete history/catalog errors and retry actions instead of showing empty/loading history',()=>{
  h.discovery.historyError='Your listening history could not load. Reconnect and retry.';h.page.status='error';h.page.error='The recommendation service is offline. Please retry.';
  const copy=text(html(Discovery));expect(copy).toContain(h.discovery.historyError);expect(copy).toContain(h.page.error);expect(copy).not.toMatch(/No history yet|Loading history/);h.actions.get('Retry listening history')!();expect(h.discovery.retryHistory).toHaveBeenCalledOnce();expect(copy).toContain('Retry catalog');
 });
 it.each([{width:320,height:640,fontScale:1},{width:700,height:360,fontScale:1},{width:412,height:915,fontScale:1.5}])('stacks labels above scrollable chips for constrained layouts: %j',dimensions=>{
  h.dimensions=dimensions;const choose=vi.fn(),row=FilterRow({title:'Release years',values:['Undated'],selected:'',select:choose,responsive:true});
  expect(row.props.style[2]).toEqual({flexDirection:'column',alignItems:'stretch'});const [title,scroller]=row.props.children;expect(title.props.style[1]).toEqual({maxWidth:'100%',paddingRight:18});expect(scroller.props.style[1]).toEqual({minWidth:0});expect(scroller.props.horizontal).toBe(true);
  for(const chip of scroller.props.children)expect(chip.props.style[0].minHeight).toBe(44);scroller.props.children[1].props.onPress();expect(choose).toHaveBeenCalledExactlyOnceWith('Undated');expect(h.player.playQueue).not.toHaveBeenCalled();
 });
 it('keeps default filter presentation outside Your Moment and all existing chip typography/palette',()=>{
  h.dimensions={width:320,height:640,fontScale:1};const row=FilterRow({title:'Season',values:['Monsoon'],selected:'Monsoon',select:vi.fn()});expect(row.props.style[1]).toBe(false);expect(row.props.style[2]).toBe(false);
  const [,scroller]=row.props.children;expect(scroller.props.style[0]).toEqual({flex:1});expect(scroller.props.style[1]).toBe(false);const chip=scroller.props.children[1];expect(chip.props.style[1]).toBe(false);expect(chip.props.children.props.style).toEqual({color:colors.text,fontSize:11});
 });
});


describe('Stage 11 video catalog states',()=>{
 it('shows no playback retry for a healthy empty catalog or a loading request',()=>{
  let markup=html(Video);expect(text(markup)).toContain('No videos yet');expect(text(markup)).not.toMatch(/Retry videos|Try again|Retry catalog/);
  h.page.status='loading';markup=html(Video);expect(text(markup)).toContain('Loading videos…');expect(text(markup)).not.toMatch(/No videos yet|Try again|Retry catalog/);
 });
 it('shows a distinct catalog retry only after a real catalog failure, preserving Search navigation',()=>{
  h.page.status='error';h.page.error='Offline';const copy=text(html(Video));expect(copy).toContain('Videos unavailable');expect(copy).toContain('Retry catalog');expect(copy).not.toContain('Retry video');
  h.actions.get('Retry catalog')!();expect(h.load).toHaveBeenCalledExactlyOnceWith({hasVideo:true},false,true);h.actions.get('Search music')!();expect(h.push).toHaveBeenLastCalledWith('/search');expect(h.player.playQueue).not.toHaveBeenCalled();
 });
});


describe('Stage 12 InstaMus copy',()=>{
 it('uses one clear manual section and saved-reel title without promotional or repeated search headings',()=>{
  const markup=html(InstaMus),copy=text(markup);expect(copy).toContain('Manual matching');expect(copy).toContain('FavInsta library');expect(copy).toContain('No saved reels');expect(copy).toContain('Save reel');
  expect(copy).not.toMatch(/Find the song behind|Search the music catalog|Keep a discovery for later|Untitled reel discovery|Manually linked|on this device|\b\d+ (tracks|reels|matches)\b/);
  expect(markup).toContain('Instagram reel link');expect(markup).toContain('Song title, artist or discovery note');expect(markup).toContain('aria-label="Save reel link and note"');
 });
 it('keeps errors understandable without showing an empty saved-reels claim on a failed library load',()=>{
  h.library.status='error';h.library.error='Your saved discoveries could not load. Please retry.';const copy=text(html(InstaMus));expect(copy).toContain(h.library.error);expect(copy).toContain('Retry');expect(copy).not.toContain('No saved reels');
 });
});


describe('Stage 13 Explore copy and navigation context',()=>{
 it('uses the selected resource category instead of duplicating Explore Catalog and preserves the search field',()=>{
  const markup=html(Browse),copy=text(markup);expect(copy).toContain('Albums');expect(copy).not.toMatch(/Explore the catalog|Loading collections|Year unavailable|development provider/);expect(markup).toContain('Search albums, artists and playlists');expect(markup).toContain('aria-label="Back"');
 });
 it('avoids promotional/provider-loading subtitles on collection details and keeps the essential play action',()=>{
  const markup=html(ProviderCollection),copy=text(markup);expect(copy).not.toMatch(/Finding your music|Provider collection|Saved song references remain/);expect(copy).toContain('Play collection');expect(markup).toContain('Loading collection songs');
 });
});
