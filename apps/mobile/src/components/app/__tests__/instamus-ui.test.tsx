import type React from 'react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPlayableTrack } from '../../../data/sample-tracks';
import type { InstaMusNote } from '../../../library/library.contract';
const h=vi.hoisted(()=>({
 slots:[] as unknown[],index:0,jobs:[] as Array<()=>void>,queryCalls:[] as unknown[],
 params:{} as {reel?:string},push:vi.fn(),load:vi.fn(async()=>{}),open:vi.fn(async()=>{}),share:vi.fn(async()=>{}),alert:vi.fn(),play:vi.fn(async()=>{}),allowPress:vi.fn(()=>true),
 search:vi.fn(),get:vi.fn(),save:vi.fn(async()=>true),remove:vi.fn(async()=>{}),
 library:{scopeVersion:1,status:'ready',data:{instamus:[] as InstaMusNote[]}},
 page:{query:{query:''},status:'ready',hasMore:false,error:null as string|null},
}));
vi.mock('react',async original=>{
 const cache=(factory:()=>unknown,deps:unknown[])=>{const i=h.index++,old=h.slots[i] as {deps:unknown[];value:unknown}|undefined;if(!old||deps.length!==old.deps.length||deps.some((value,index)=>value!==old.deps[index]))h.slots[i]={deps,value:factory()};return(h.slots[i] as {value:unknown}).value;};
 return {...await original<typeof import('react')>(),useState:(initial:unknown)=>{const i=h.index++;if(!(i in h.slots))h.slots[i]={value:typeof initial==='function'?initial():initial};const slot=h.slots[i] as {value:unknown};return[slot.value,(value:unknown)=>{slot.value=typeof value==='function'?value(slot.value):value;}];},
 useRef:(value:unknown)=>{const i=h.index++;return h.slots[i]??(h.slots[i]={current:value});},useMemo:cache,useCallback:(callback:unknown,deps:unknown[])=>cache(()=>callback,deps),
 useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const i=h.index++,old=h.slots[i] as {deps:unknown[];cleanup?:()=>void}|undefined;if(old&&deps.length===old.deps.length&&deps.every((v,n)=>v===old.deps[n]))return;h.jobs.push(()=>{old?.cleanup?.();h.slots[i]={deps,cleanup:effect()};});},
 };
});
vi.mock('react-native',()=>({View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',FlatList:'FlatList',StyleSheet:{create:(v:unknown)=>v,hairlineWidth:1},Alert:{alert:h.alert},Linking:{openURL:h.open}}));
vi.mock('react-native-safe-area-context',()=>({SafeAreaView:'SafeAreaView'}));
vi.mock('expo-router',()=>({useRouter:()=>({push:h.push}),useLocalSearchParams:()=>h.params}));
vi.mock('../../../components/loading/Skeleton',()=>({SongListSkeleton:'SongListSkeleton',SavedLinksSkeleton:'SavedLinksSkeleton'}));
vi.mock('../../../components/catalog/CatalogNotice',()=>({CatalogNotice:'CatalogNotice'}));
vi.mock('../../../components/catalog/SongList',()=>({SongRow:'SongRow'}));
vi.mock('../../../components/library/LibrarySheets',()=>({TrackActionsSheet:'TrackActionsSheet'}));
vi.mock('../ShareButton',()=>({ShareButton:'ShareButton'}));
vi.mock('../../../design/GlassSurface',()=>({GlassSurface:'GlassSurface'}));
vi.mock('../ui',()=>({Button:'Button',PageHeader:'PageHeader',colors:{muted:'#BDB4C8',panel:'#17151D',text:'#FAF7FF',line:'#393241'},ui:{sectionTitle:{fontSize:16},subtitle:{fontSize:12},body:{},screen:{flex:1}}}));
vi.mock('../../../store/useLibraryStore',()=>({useLibraryStore:Object.assign((select:(state:typeof h.library)=>unknown)=>select(h.library),{getState:()=>({...h.library,saveInstaMus:h.save,removeInstaMus:h.remove})})}));
vi.mock('../../../store/usePlayerStore',()=>({usePlayerStore:{getState:()=>({playQueue:h.play})}}));
vi.mock('../../../store/useCatalogStore',()=>({useCatalogStore:Object.assign(()=>0,{getState:()=>({load:h.load})})}));
vi.mock('../../../catalog/use-catalog-page',()=>({useCatalogPage:(query:unknown,delay:number,active:boolean)=>{h.queryCalls.push({query,delay,active});return h.page;}}));
vi.mock('../../../catalog/catalog-runtime',()=>({catalogEnabled:()=>true}));
vi.mock('../../../catalog/demo-catalog',()=>({demoCatalog:{search:h.search,get:h.get}}));
vi.mock('../../../sharing/sharing',()=>({shareLinks:{shareReel:h.share}}));
vi.mock('../../lists/use-list-interaction',()=>{const guard={allowPress:h.allowPress};return{useListInteraction:()=>({guard,list:{current:null},handlers:{}})};});
import InstaMus from '../../../screens/InstaMusScreen';
import { Button } from '../../../design/controls';
const captured=JSON.parse(readFileSync('apps/mobile/src/sharing/__tests__/fixtures/real-track-pages.json','utf8')).tracks[0] as {id:string;title:string;artist:string};
const track:IPlayableTrack={...captured,duration:204,album:'Evolve',url:'',artwork:'',catalogSource:'catalog'};
const reel='https://www.instagram.com/reel/Ab_12-/'; // Existing synthetic reference-validation fixture; never opened over the network.
type Element=React.JSX.Element;
function nodes(node:unknown):Element[]{if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);const element=node as Element;return[element,...nodes(element.props?.children)];}
const texts=(node:unknown):string=>{if(typeof node==='string')return node;if(!node||typeof node!=='object')return'';if(Array.isArray(node))return node.map(texts).join(' ');const el=node as Element;return[el.props?.title,texts(el.props?.children)].filter(Boolean).join(' ');};
function render(){h.index=0;h.jobs=[];const tree=InstaMus();h.jobs.forEach(job=>job());const list=nodes(tree).find(node=>node.type==='FlatList')!;return{tree,list,header:list.props.ListHeaderComponent as Element};}
function input(header:Element,label:string){return nodes(header).find(node=>node.type==='TextInput'&&node.props.accessibilityLabel===label)!;}
function button(tree:Element,title:string){return nodes(tree).find(node=>node.type==='Button'&&node.props.title===title)!;}
function search(query=track.title){let view=render();input(view.header,'Instagram reel link').props.onChangeText(reel);input(view.header,'Song title, artist or discovery note').props.onChangeText(query);h.page.query.query=query;return render();}
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
beforeEach(()=>{vi.clearAllMocks();h.slots=[];h.index=0;h.jobs=[];h.queryCalls=[];h.params={};h.library={scopeVersion:1,status:'ready',data:{instamus:[]}};h.page={query:{query:''},status:'ready',error:null,hasMore:false};h.allowPress.mockReturnValue(true);h.search.mockReturnValue([track]);h.get.mockImplementation(id=>id===track.id?track:undefined);h.save.mockResolvedValue(true);render();});
describe('Stage 12 InstaMus UI/functionality contracts (mocked native runtime)',()=>{
 it('retains clear sections and accessible fields, with no promotion or empty search-result heading',()=>{
  const view=render(),copy=texts(view.header);expect(copy).toContain('Manual matching');expect(copy).not.toMatch(/Find the song behind|Search the music catalog|Search results|on this device/);
  expect(button(view.header,'Save reel').props).toMatchObject({accessibilityLabel:'Save reel link and note',disabled:true});expect(input(view.header,'Instagram reel link').props.placeholder).toBe('Paste reel link');expect(texts(view.list.props.ListFooterComponent)).toBe('No saved reels');
 });
 it('keeps query pagination and explicit playback; no typing/navigation request starts music',()=>{
  h.page.hasMore=true;const view=search();expect(h.queryCalls.at(-1)).toEqual({query:{query:track.title},delay:300,active:true});expect(h.play).not.toHaveBeenCalled();expect(texts(view.header)).toContain('Search results');
  const row=view.list.props.renderItem({item:view.list.props.data[0]}),song=nodes(row).find(node=>node.type==='SongRow')!;expect(song.props.minimalMetadata).toBe(true);song.props.onPlayTrack(track);expect(h.play).toHaveBeenCalledExactlyOnceWith([track],track.id,'InstaMus search');expect(h.push).toHaveBeenLastCalledWith('/player');
  const more=view.list.props.renderItem({item:{kind:'more',key:'control:more'}});button(more,'Load more matches').props.onPress();expect(h.load).toHaveBeenCalledExactlyOnceWith({query:track.title},true);
 });
 it('keeps stable match callbacks when editing a reel; rejects stale search-result and scroll-release play taps',()=>{
  let view=search();const row=view.list.props.renderItem({item:view.list.props.data[0]}),song=nodes(row).find(node=>node.type==='SongRow')!;
  input(view.header,'Instagram reel link').props.onChangeText(reel+'?utm_source=fixture');view=render();const next=nodes(view.list.props.renderItem({item:view.list.props.data[0]})).find(node=>node.type==='SongRow')!;expect(next.props.onPlayTrack).toBe(song.props.onPlayTrack);expect(next.props.onMenuTrack).toBe(song.props.onMenuTrack);
  h.allowPress.mockReturnValue(false);song.props.onPlayTrack(track);expect(h.play).not.toHaveBeenCalled();h.allowPress.mockReturnValue(true);h.search.mockReturnValue([]);input(view.header,'Song title, artist or discovery note').props.onChangeText('No match');render();song.props.onPlayTrack(track);expect(h.play).not.toHaveBeenCalled();
 });
 it('saves the same reel/note and manual canonical match, with short success text only after completion',async()=>{
  let view=search();button(view.header,'Save reel').props.onPress();expect(h.save).toHaveBeenCalledWith(reel,track.title,null);await settle();view=render();expect(texts(view.header)).toContain('Reel saved');
  const row=view.list.props.renderItem({item:view.list.props.data[0]}),link=button(row,'Link and bookmark');expect(link.props.accessibilityLabel).toBe(`Link and bookmark ${track.title}`);link.props.onPress();await settle();view=render();expect(h.save).toHaveBeenLastCalledWith(reel,track.title,track.id);expect(texts(view.header)).toContain('Linked and bookmarked');expect(h.play).not.toHaveBeenCalled();
 });
 it('never announces saved success after a failed save or account-scope change',async()=>{
  let view=search();h.save.mockResolvedValueOnce(false);button(view.header,'Save reel').props.onPress();await settle();view=render();expect(texts(view.header)).not.toContain('Reel saved');
  let release!:(saved:boolean)=>void;h.save.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{release=resolve;}));button(view.header,'Save reel').props.onPress();h.library.scopeVersion++;release(true);await settle();view=render();expect(texts(view.header)).not.toContain('Reel saved');
 });
 it('keeps saved reference, real linked title/artist and user note, removing duplicate match descriptions',()=>{
  const note={reelUrl:reel,query:track.title,trackId:track.id};h.library.data.instamus=[note];const view=render(),card=view.list.props.renderItem({item:{key:'note:'+reel,kind:'note',note}}),copy=texts(card);
  expect(copy.split(track.title).length-1).toBe(1);expect(copy).toContain(track.artist);expect(copy).toContain(reel);expect(copy).not.toMatch(/Manually linked|Not linked|on this device/);
  nodes(card).find(node=>node.type==='Pressable')!.props.onPress();const loaded=render();expect(input(loaded.header,'Instagram reel link').props.value).toBe(reel);expect(input(loaded.header,'Song title, artist or discovery note').props.value).toBe(track.title);
  const userNote={...note,query:'Keep this chorus'};const noted=view.list.props.renderItem({item:{key:'note:'+reel,kind:'note',note:userNote}});expect(texts(noted)).toContain(userNote.query);
 });
 it('preserves saved-reel sharing and guarded confirmation before removing a reference',async()=>{
  const note={reelUrl:reel,query:track.title,trackId:track.id};h.library.data.instamus=[note];const view=render(),card=view.list.props.renderItem({item:{key:'note:'+reel,kind:'note',note}});
  await nodes(card).find(node=>node.type==='ShareButton')!.props.share();expect(h.share).toHaveBeenCalledExactlyOnceWith(reel);button(card,'Remove reel').props.onPress();expect(h.remove).not.toHaveBeenCalled();
  const buttons=h.alert.mock.calls[0]![2] as Array<{text:string;onPress?:()=>void}>;h.library.scopeVersion++;buttons.find(item=>item.text==='Remove')!.onPress!();await settle();expect(h.remove).not.toHaveBeenCalled();
 });
 it('preserves empty/loading/errors and safe Instagram reference opening without any recognition provider',async()=>{
  h.library.status='loading';expect(render().list.props.ListFooterComponent.type).toBe('SavedLinksSkeleton');h.library.status='error';expect(render().list.props.ListFooterComponent).toBeNull();h.library.status='ready';
  h.search.mockReturnValue([]);h.page.status='loading';let view=search('Missing song');expect(nodes(view.header).some(node=>node.type==='SongListSkeleton')).toBe(true);expect(texts(view.header)).not.toContain('Sorry, this song was not found.');h.page.status='ready';view=render();expect(texts(view.header)).toContain('Sorry, this song was not found.');
  h.page.status='error';h.page.error='Offline';view=render();expect(nodes(view.header).some(node=>node.type==='SongListSkeleton')).toBe(false);expect(nodes(view.header).find(node=>node.type==='CatalogNotice')!.props.query).toEqual({query:'Missing song'});
  button(view.header,'Open original reel').props.onPress();await settle();expect(h.open).toHaveBeenCalledExactlyOnceWith(reel);
  input(view.header,'Instagram reel link').props.onChangeText('https://evil.example/reel/a/');view=render();expect(()=>button(view.header,'Open original reel').props.onPress()).not.toThrow();expect(h.open).toHaveBeenCalledTimes(1);expect(texts(render().header)).toMatch(/Instagram|HTTPS|invalid/i);
 });
 it('forwards a full accessibility label while preserving default shared button appearance/actions',()=>{
  const action=vi.fn(),label=`Link and bookmark ${track.title}`,button=Button({title:'Link and bookmark',accessibilityLabel:label,onPress:action});expect(button.props.accessibilityLabel).toBe(label);button.props.onPress();expect(action).toHaveBeenCalledOnce();const plain=Button({title:'Play',onPress:action});expect(plain.props.accessibilityLabel).toBeUndefined();expect(button.props.style({pressed:false})).toEqual(plain.props.style({pressed:false}));
 });
});
