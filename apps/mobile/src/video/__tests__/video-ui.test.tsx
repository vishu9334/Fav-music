import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoItem } from '../video.contract';
const h=vi.hoisted(()=>({
  slots:[] as unknown[],index:0,jobs:[] as Array<()=>void>,width:320,height:640,reduced:false,
  create:vi.fn(),dispose:vi.fn(),select:vi.fn(async()=>{}),toggle:vi.fn(async()=>{}),next:vi.fn(async()=>{}),previous:vi.fn(async()=>{}),seek:vi.fn(async()=>{}),retry:vi.fn(async()=>{}),pause:vi.fn(async()=>{}),timing:vi.fn((value:number,_config:unknown)=>value),
  video:{index:0,playbackState:'PAUSED',position:2,duration:8,buffered:6,error:null as string|null,busy:false},
}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
  useState:(initial:unknown)=>{const i=h.index++;if(!(i in h.slots))h.slots[i]={value:typeof initial==='function'?initial():initial};const slot=h.slots[i] as {value:unknown};return[slot.value,(next:unknown)=>{slot.value=typeof next==='function'?next(slot.value):next;}];},
  useRef:(value:unknown)=>{const i=h.index++;return h.slots[i]??(h.slots[i]={current:value});},
  useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const i=h.index++,old=h.slots[i] as {deps:unknown[];cleanup?:()=>void}|undefined;if(old&&deps.length===old.deps.length&&deps.every((v,n)=>v===old.deps[n]))return;h.jobs.push(()=>{old?.cleanup?.();h.slots[i]={deps,cleanup:effect()};});},
  useMemo:(fn:()=>unknown)=>fn(),
  useCallback:(fn:(...args:unknown[])=>unknown)=>fn,
}));
vi.mock('react-native',()=>({View:'View',Text:'Text',Image:'Image',Modal:'Modal',ScrollView:'ScrollView',ActivityIndicator:'ActivityIndicator',TextInput:'TextInput',Pressable:'Pressable',StyleSheet:{create:(v:unknown)=>v,absoluteFill:{position:'absolute'},hairlineWidth:1},
  useWindowDimensions:()=>({width:h.width,height:h.height,fontScale:1}),AppState:{addEventListener:()=>({remove:vi.fn()})},
  PanResponder:{create:(config:Record<string, unknown>)=>({panHandlers:{},...config})},
  Platform:{OS:'ios'},
  NativeModules:{},
}));
vi.mock('react-native-safe-area-context',()=>({SafeAreaView:'SafeAreaView',SafeAreaProvider:'SafeAreaProvider',useSafeAreaInsets:()=>({left:0,right:0,top:0,bottom:0})}));
vi.mock('expo-status-bar',()=>({StatusBar:'StatusBar'}));
vi.mock('expo-video',()=>({VideoView:'VideoView'}));
vi.mock('lucide-react-native', () => ({
  Maximize: 'Maximize',
  Minimize: 'Minimize',
  MoreVertical: 'MoreVertical',
  X: 'X',
  Film: 'Film',
  Video: 'Video',
  RotateCw: 'RotateCw',
  RotateCcw: 'RotateCcw',
  Gauge: 'Gauge',
  Languages: 'Languages',
  Sun: 'Sun',
  Volume2: 'Volume2',
  VolumeX: 'VolumeX',
  Check: 'Check',
  SkipBack: 'SkipBack',
  SkipForward: 'SkipForward',
}));
vi.mock('zustand',()=>({useStore:(store:{getState:()=>unknown},select:(state:unknown)=>unknown)=>select(store.getState())}));
vi.mock('react-native-reanimated',()=>({default:{View:'AnimatedView',FlatList:'AnimatedFlatList'},useSharedValue:(value:number)=>{const i=h.index++;return h.slots[i]??(h.slots[i]={value});},useAnimatedStyle:(fn:()=>unknown)=>fn(),useAnimatedScrollHandler:()=>vi.fn(),withTiming:h.timing}));
vi.mock('react-native-track-player',()=>({default:{getPlayWhenReady:vi.fn(async()=>false),getPlaybackState:vi.fn(async()=>({state:'paused'}))},State:{Playing:'playing'}}));
vi.mock('../../services/playback/AudioPlaybackService',()=>({AudioPlaybackService:{getInstance:()=>({pause:vi.fn(async()=>{})})}}));
vi.mock('../../services/playback/MediaPlaybackCoordinator',()=>({mediaPlaybackCoordinator:{}}));
vi.mock('../../store/usePlayerStore',()=>({usePlayerStore:(select:(state:{isReducedMotion:boolean})=>unknown)=>select({isReducedMotion:h.reduced})}));
vi.mock('../../design/useReducedMotion',()=>({useReducedMotion:()=>h.reduced}));
vi.mock('../../design/GlassSurface',()=>({GlassSurface:'GlassSurface'}));
vi.mock('../../components/kobra/KobraPlaybackControls',()=>({KobraPlaybackControls:'KobraPlaybackControls'}));
vi.mock('../../components/player/Scrubber',()=>({Scrubber:'Scrubber'}));
vi.mock('../../components/app/ui',()=>({Button:'Button',IconButton:'IconButton',PageHeader:'PageHeader',colors:{line:'#393241',muted:'#BDB4C8',card:'#1e1e24',text:'#ffffff',raised:'#2a2a34',accent:'#ff0055'},ui:{screen:{flex:1},grow:{flex:1,minWidth:0},body:{},sectionTitle:{},subtitle:{}}}));
vi.mock('../ExpoVideoEngine',()=>({ExpoVideoEngine:class {player={};constructor(){h.create();}dispose=h.dispose;}}));
vi.mock('../VideoPlaybackService',()=>({VideoPlaybackService:class {
  state={getState:()=>h.video};select=h.select;toggle=h.toggle;next=h.next;previous=h.previous;seek=h.seek;retry=h.retry;pause=h.pause;
  constructor(private engine:{dispose:()=>void},public items:readonly VideoItem[]){}dispose(){this.engine.dispose();}
}}));
vi.mock('../FullscreenController',()=>({FullscreenController:class {constructor(_adapter:unknown,private changed:(full:boolean)=>void){}enter=vi.fn(async()=>{this.changed(true);});exit=vi.fn(async()=>{this.changed(false);});dispose=vi.fn(async()=>{});}}));
vi.mock('../VideoPosterCarousel',()=>({VideoPosterCarousel:'VideoPosterCarousel'}));
import { NativeVideoSession, VideoSurface } from '../NativeVideoSession';
type Element=React.JSX.Element;
const items:readonly VideoItem[]=[{id:'one',title:'Original clip fixture',description:'Unit metadata',source:{kind:'asset',asset:1},poster:1},{id:'two',title:'Second clip fixture',description:'Unit metadata',source:{kind:'asset',asset:2}}];
function renderSession(value=items){h.index=0;h.jobs=[];const tree=NativeVideoSession({orientationAvailable:true,items:value});h.jobs.forEach(job=>job());return tree;}
function nodes(node:unknown):Element[]{if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);const el=node as Element;return[el,...nodes(el.props?.children)];}
const named=(tree:Element,name:string)=>nodes(tree).find(node=>typeof node.type==='function'&&node.type.name===name)!;
const prepare=()=>{renderSession();const tree=renderSession();return nodes(tree).find(node=>node.type===VideoSurface)!.props.session as React.ComponentProps<typeof VideoSurface>['session'];};
function surface(session:React.ComponentProps<typeof VideoSurface>['session'],fullscreen=false,toggleFullscreen=vi.fn(),orientationAvailable=true){h.slots=[];h.index=0;h.jobs=[];const tree=VideoSurface({session,items,fullscreen,orientationAvailable,toggleFullscreen});h.jobs.forEach(job=>job());return tree;}
beforeEach(()=>{vi.clearAllMocks();h.slots=[];h.index=0;h.jobs=[];h.width=320;h.height=640;h.reduced=false;h.video={index:0,playbackState:'PAUSED',position:2,duration:8,buffered:6,error:null,busy:false};});
afterEach(()=>{for(const slot of h.slots){const value=slot as {cleanup?:()=>void}|undefined;value?.cleanup?.();}});
describe('native video UI and session lifecycle (mocked native views)',()=>{
  it('uses the same audio/video glass controls and wires Play/Pause, Previous, Next and Seek to the service',()=>{
    const session=prepare(),tree=surface(session),transport=named(tree,'VideoTransport'),timeline=named(tree,'VideoTimeline');
    const controls=(transport.type as (props:unknown)=>Element)(transport.props),scrubber=(timeline.type as (props:unknown)=>Element)(timeline.props);
    expect(controls.type).toBe('KobraPlaybackControls');controls.props.onPlayPause();controls.props.onPrevious();controls.props.onNext();scrubber.props.onSeek(4);
    expect(h.toggle).toHaveBeenCalledOnce();expect(h.previous).toHaveBeenCalledOnce();expect(h.next).toHaveBeenCalledOnce();expect(h.seek).toHaveBeenCalledExactlyOnceWith(4);
    expect(scrubber.props).toMatchObject({position:2,duration:8,buffered:6,disabled:false});
    h.video.busy=true;const busy=(timeline.type as (props:unknown)=>Element)(timeline.props);expect(busy.props.disabled).toBe(true);
  });
  it('keeps transport, captions and actions outside the video canvas in portrait and scrolling fullscreen',()=>{
    const session=prepare();for(const full of [false,true]){const tree=surface(session,full),video=nodes(tree).find(node=>node.type==='VideoView')!,canvas=nodes(tree).find(node=>Array.isArray(node.props?.children)&&node.props.children.includes(video))!;
      expect(video.props).toMatchObject({contentFit:'contain',nativeControls:false,allowsFullscreen:false,allowsPictureInPicture:false});expect(named(canvas,'VideoTransport')).toBeUndefined();expect(nodes(canvas).some(node=>node.type==='Text'||node.type==='Button')).toBe(false);
      expect(named(tree,'VideoTransport')).toBeTruthy();if(full)expect(nodes(tree).some(node=>node.type==='ScrollView')).toBe(true);
    }
  });
  it('shows Try again only for an actionable playback error and wires explicit recovery rather than toggle',()=>{
    const session=prepare();let tree=surface(session);expect(nodes(tree).some(node=>node.props?.title==='Try again')).toBe(false);
    h.video.error='This video could not be played.';h.video.playbackState='ERROR';tree=surface(session);const retry=nodes(tree).find(node=>node.props?.title==='Try again')!;retry.props.onPress();expect(h.retry).toHaveBeenCalledOnce();expect(h.toggle).not.toHaveBeenCalled();
    h.video.busy=true;tree=surface(session);expect(nodes(tree).some(node=>node.props?.title==='Try again')).toBe(false);
    h.video.busy=false;h.video.playbackState='BUFFERING';tree=surface(session);expect(nodes(tree).some(node=>node.props?.title==='Try again')).toBe(false);
  });
  it('keeps a single engine/session through metadata updates and fullscreen entry/exit',async()=>{
    prepare();let tree=renderSession(items.map(item=>({...item,title:item.title+' updated'})));expect(h.create).toHaveBeenCalledOnce();expect(h.select).toHaveBeenCalledExactlyOnceWith(0);
    let view=nodes(tree).find(node=>node.type===VideoSurface)!;view.props.toggleFullscreen();await Promise.resolve();tree=renderSession();const views=nodes(tree).filter(node=>node.type===VideoSurface);expect(views).toHaveLength(1);expect(views[0]!.props.fullscreen).toBe(true);
    views[0]!.props.toggleFullscreen();await Promise.resolve();tree=renderSession();expect(nodes(tree).filter(node=>node.type===VideoSurface)).toHaveLength(1);expect(h.create).toHaveBeenCalledOnce();expect(h.dispose).not.toHaveBeenCalled();
  });
  it('never renders a released old player for a new source; disposes the old engine once',()=>{
    prepare();const changed=items.map((item,index)=>index===0?{...item,source:{kind:'asset' as const,asset:3}}:item);
    const transition=renderSession(changed);expect(nodes(transition).some(node=>node.type===VideoSurface)).toBe(false);expect(h.dispose).toHaveBeenCalledOnce();expect(h.create).toHaveBeenCalledTimes(2);
    const ready=renderSession(changed);expect(nodes(ready).filter(node=>node.type===VideoSurface)).toHaveLength(1);expect(h.toggle).not.toHaveBeenCalled();expect(h.next).not.toHaveBeenCalled();
  });
  it('keeps essential fullscreen action/error feedback and supports reduced motion',()=>{
    const session=prepare();h.reduced=true;const toggle=vi.fn(),tree=surface(session,true,toggle);const fullscreen=nodes(tree).find(node=>node.props?.label==='Exit fullscreen')!;fullscreen.props.onPress();expect(toggle).toHaveBeenCalledOnce();
    expect(h.timing).toHaveBeenLastCalledWith(0,{duration:0});expect(nodes(tree).some(node=>node.props?.accessibilityLabel==='Video paused')).toBe(true);
  });
  it('never disables fullscreen exit even when entry capability is unavailable',()=>{
    const session=prepare();const enter=nodes(surface(session,false,vi.fn(),false)).find(node=>node.props?.label==='Enter fullscreen')!;expect(enter.props.disabled).toBe(true);
    const exit=nodes(surface(session,true,vi.fn(),false)).find(node=>node.props?.label==='Exit fullscreen')!;expect(exit.props.disabled).toBe(false);
  });
  it('ignores stale fullscreen failures after changing source instead of poisoning the new session',async()=>{
    const session=prepare();let reject!:(error:Error)=>void;vi.mocked(session.fullscreen.enter).mockReturnValueOnce(new Promise<void>((_resolve,fail)=>{reject=fail;}));
    const tree=renderSession();nodes(tree).find(node=>node.type===VideoSurface)!.props.toggleFullscreen();
    const changed=items.map((item,index)=>index===0?{...item,source:{kind:'asset' as const,asset:3}}:item);renderSession(changed);reject(new Error('Old rotation failed'));await Promise.resolve();await Promise.resolve();
    const next=renderSession(changed);expect(nodes(next).some(node=>node.props?.children==='Fullscreen is unavailable. Please try again.')).toBe(false);expect(h.create).toHaveBeenCalledTimes(2);expect(h.dispose).toHaveBeenCalledOnce();
  });
});
