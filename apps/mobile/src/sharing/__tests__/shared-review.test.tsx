import React from 'react';
import {createRequire} from 'node:module';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string};
const h=vi.hoisted(()=>({buttons:new Map<string,()=>void>(),push:vi.fn(),library:{scopeVersion:1,status:'ready',data:{bookmarks:[] as string[],playlists:[] as {name:string}[]},toggle:vi.fn(),createPlaylist:vi.fn()},player:{tracks:[] as {id:string}[],activeTrackIndex:0,errorMessage:null as string|null,playQueue:vi.fn(async()=>{})}}));
vi.mock('react-native',()=>({View:'div',Text:'span',ScrollView:'div'}));
vi.mock('react-native-safe-area-context',()=>({SafeAreaView:'main'}));
vi.mock('expo-router',()=>({useRouter:()=>({push:h.push}),useLocalSearchParams:()=>({})}));
vi.mock('../../design/GlassSurface',()=>({GlassSurface:({children}:{children:React.ReactNode})=>React.createElement('div',null,children)}));
vi.mock('../../components/app/ui',()=>({ui:{},Button:({title,onPress,disabled}:{title:string;onPress:()=>void;disabled:boolean})=>{h.buttons.set(title,onPress);return React.createElement('button',{disabled},title);},PageHeader:()=>null,EmptyState:()=>null}));
vi.mock('../../store/useLibraryStore',()=>({useLibraryStore:Object.assign((select:(value:typeof h.library)=>unknown)=>select(h.library),{getState:()=>h.library})}));
vi.mock('../../store/usePlayerStore',()=>({usePlayerStore:{getState:()=>h.player}}));
vi.mock('../sharing',()=>({shareLinks:{},sharedContentLoader:{}}));
import { SharedReview } from '../../screens/SharedContentScreen';
import type { IPlayableTrack } from '../../data/sample-tracks';
const id='f5e75856-4598-8a85-8509-3e90deb1afe4',track:IPlayableTrack={id,title:'Believer',artist:'Imagine Dragons',duration:204,url:'',artwork:'',catalogSource:'catalog'};
function render(){renderToStaticMarkup(React.createElement(SharedReview,{title:'Believer',playlist:false,ids:[id],tracks:[track],unavailable:0,ready:true}));return h.buttons.get('Play shared tracks')!;}
beforeEach(()=>{vi.clearAllMocks();h.buttons.clear();h.library.scopeVersion=1;h.player.tracks=[track];h.player.errorMessage=null;h.player.playQueue.mockResolvedValue(undefined);});
describe('shared-track play navigation with mocked native player',()=>{
  it('waits for the exact queue, prevents rapid duplicate navigation, and never auto-plays on render',async()=>{
    const press=render();expect(h.player.playQueue).not.toHaveBeenCalled();let release!:()=>void;h.player.playQueue.mockImplementationOnce(()=>new Promise<void>(r=>{release=r;}));
    press();press();expect(h.player.playQueue).toHaveBeenCalledTimes(1);expect(h.push).not.toHaveBeenCalled();release();await vi.waitFor(()=>expect(h.push).toHaveBeenCalledExactlyOnceWith('/player'));
    expect(h.player.playQueue).toHaveBeenCalledWith([track],id,'Believer');
  });
  it('does not navigate for a superseded account or a different active song',async()=>{
    let release!:()=>void;h.player.playQueue.mockImplementationOnce(()=>new Promise<void>(r=>{release=r;}));render()();h.library.scopeVersion++;release();await Promise.resolve();expect(h.push).not.toHaveBeenCalled();
    h.player.tracks=[{id:'different'}];render()();await Promise.resolve();await Promise.resolve();expect(h.push).not.toHaveBeenCalled();
  });
  it('does not navigate on a failed player request',async()=>{
    h.player.playQueue.mockRejectedValueOnce(new Error('Source unavailable'));render()();await Promise.resolve();await Promise.resolve();expect(h.push).not.toHaveBeenCalled();
  });
});
