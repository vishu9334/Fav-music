import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({
  slots:[] as unknown[],index:0,effects:[] as Array<()=>void|(()=>void)>,keyboard:false,
  listeners:new Map<string,()=>void>(),removed:vi.fn(),path:'/',navigate:vi.fn(),emit:vi.fn(),
  width:320,height:640,fontScale:1,insets:{bottom:24,left:16,right:12},
  root:{index:0,routes:[{name:'(tabs)',state:{index:0,routes:['index','search','library','warehouse'].map(name=>({name,params:undefined as Record<string,string>|undefined}))}}]},
  player:{tracks:[{id:'existing-track'}],activeTrackIndex:0,togglePlayPause:vi.fn(),skipToNext:vi.fn(),playQueue:vi.fn()},
}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
  useState:(initial:unknown)=>{const i=h.index++;if(!(i in h.slots))h.slots[i]=typeof initial==='function'?initial():initial;return [h.slots[i],(value:unknown)=>{h.slots[i]=value;}];},
  useEffect:(effect:()=>void|(()=>void))=>{const i=h.index++;if(!(i in h.slots)){h.slots[i]=true;h.effects.push(effect);}},
}));
vi.mock('react-native',()=>({View:'View',Pressable:'Pressable',Text:'Text',StyleSheet:{create:(v:unknown)=>v,hairlineWidth:1},useWindowDimensions:()=>({width:h.width,height:h.height,fontScale:h.fontScale}),
  Keyboard:{isVisible:()=>h.keyboard,addListener:(name:string,callback:()=>void)=>{h.listeners.set(name,callback);return{remove:()=>{h.listeners.delete(name);h.removed();}};}},
}));
vi.mock('expo-router',()=>({Tabs:'Tabs',usePathname:()=>h.path,useRouter:()=>({navigate:h.navigate}),useRootNavigationState:()=>h.root}));
vi.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>h.insets}));
vi.mock('lucide-react-native',()=>({SkipForward:'SkipForward'}));
vi.mock('../../../design/GlassSurface',()=>({GlassSurface:'GlassSurface'}));
vi.mock('../../../design/Artwork',()=>({Artwork:'Artwork'}));
vi.mock('../../kobra/MorphingPlayPause',()=>({MorphingPlayPause:'MorphingPlayPause'}));
vi.mock('../../../design/useReducedMotion',()=>({useReducedMotion:()=>true}));
vi.mock('../../../store/usePlayerStore',()=>({usePlayerStore:Object.assign((select:(state:typeof h.player)=>unknown)=>select(h.player),{getState:()=>h.player})}));
vi.mock('../ui',()=>({colors:{},IconButton:'IconButton',ui:{grow:{flex:1}}}));
vi.mock('../BottomTabStrip',()=>({BottomTabStrip:'BottomTabStrip',bottomTabs:{index:{},search:{},library:{},warehouse:{}}}));
import { AppDock, AppTabBar } from '../AppTabBar';
type Element=React.JSX.Element;
const render=()=>{h.index=0;h.effects=[];const tree=AppDock()!;return {tree,mount:()=>h.effects.map(effect=>effect())};};
const strip=(tree:Element)=>tree.props.children[1].props.children as Element;
beforeEach(()=>{vi.clearAllMocks();h.slots=[];h.index=0;h.effects=[];h.listeners.clear();h.keyboard=false;h.path='/';h.root.routes[0]!.state.index=0;for(const route of h.root.routes[0]!.state.routes)route.params=undefined;h.width=320;h.height=640;h.fontScale=1;h.emit.mockReturnValue({defaultPrevented:false});});
describe('dock navigation and Android keyboard contracts (mocked runtime)',()=>{
  it('navigates only to existing routes; active tab is a no-op and no player action runs',()=>{
    const {tree}=render(),tabs=strip(tree);expect(tabs.props.selected).toBe('index');tabs.props.select('index');expect(h.navigate).not.toHaveBeenCalled();
    for(const name of ['search','library','warehouse'])tabs.props.select(name);expect(h.navigate.mock.calls).toEqual([['/search'],['/library'],['/warehouse']]);
    expect(h.player.togglePlayPause).not.toHaveBeenCalled();expect(h.player.skipToNext).not.toHaveBeenCalled();expect(h.player.playQueue).not.toHaveBeenCalled();
  });
  it('keeps navigation but hides the duplicate mini-player beneath room chat', () => {
    h.path='/rooms'; const {tree}=render();
    expect(tree.props.children[0]).toBe(false);
    expect(strip(tree).type).toBe('BottomTabStrip');
  });
  it('reuses saved route params when returning to a mounted tab',()=>{
    const params={query:'Believer'};h.root.routes[0]!.state.routes[1]!.params=params;
    const {tree}=render();strip(tree).props.select('search');expect(h.navigate).toHaveBeenCalledExactlyOnceWith({pathname:'/search',params});expect(h.root.routes[0]!.state.routes[1]!.params).toBe(params);
  });
  it('keeps the true owning tab highlighted on detail screens and can return to it',()=>{
    h.path='/playlist';h.root.routes[0]!.state.index=2;const {tree}=render(),tabs=strip(tree);expect(tabs.props.selected).toBe('library');tabs.props.select('library');expect(h.navigate).toHaveBeenCalledExactlyOnceWith('/library');
  });
  it('preserves safe insets and hides/restores the same dock subtree during keyboard entry',()=>{
    let frame=render();const cleanups=frame.mount(),type=frame.tree.type,childType=strip(frame.tree).type;
    expect(frame.tree.props.style[2]).toEqual({paddingBottom:24,paddingLeft:16,paddingRight:12});expect(frame.tree.props.style[3]).toBe(false);
    h.listeners.get('keyboardDidShow')!();frame=render();expect(frame.tree.props.style[3]).toEqual({display:'none'});expect(frame.tree.props.importantForAccessibility).toBe('no-hide-descendants');expect(frame.tree.type).toBe(type);expect(strip(frame.tree).type).toBe(childType);
    h.listeners.get('keyboardDidHide')!();frame=render();expect(frame.tree.props.style[3]).toBe(false);expect(frame.tree.props.importantForAccessibility).toBe('auto');
    cleanups.forEach(cleanup=>cleanup?.());expect(h.listeners.size).toBe(0);expect(h.removed).toHaveBeenCalledTimes(2);expect(h.player.playQueue).not.toHaveBeenCalled();
  });
  it('handles an already visible keyboard without flashing the dock; preserves existing hidden routes',()=>{
    h.keyboard=true;expect(render().tree.props.style[3]).toEqual({display:'none'});
    h.path='/login';expect(render().tree).toBeNull();h.path='/player';expect(render().tree).toBeNull();
  });
  it('uses horizontal flow only when mini-player and four touch targets fit after safe areas',()=>{
    h.width=740;h.height=360;expect(render().tree.props.style[1]).toEqual({flexDirection:'row',alignItems:'center'});
    h.fontScale=1.5;expect(render().tree.props.style[1]).toBe(false);
  });
  it('keeps tab-bar preventDefault, route params and long presses; never resets the selected route',()=>{
    const navigate=vi.fn(),routes=[{key:'home-key',name:'index'},{key:'search-key',name:'search',params:{query:'Believer'}}];
    const props={state:{index:0,routes},descriptors:{'search-key':{options:{tabBarAccessibilityLabel:'Search music'}}},navigation:{emit:h.emit,navigate}} as unknown as Parameters<typeof AppTabBar>[0];
    h.index=0;const tree=AppTabBar(props),tabs=tree.props.children[1];expect(tabs.props.items[1].label).toBe('Search music');
    tabs.props.select('index');expect(h.emit).not.toHaveBeenCalled();tabs.props.select('search');expect(h.emit).toHaveBeenCalledWith({type:'tabPress',target:'search-key',canPreventDefault:true});expect(navigate).toHaveBeenCalledWith('search',{query:'Believer'});
    h.emit.mockReturnValue({defaultPrevented:true});navigate.mockClear();tabs.props.select('search');expect(navigate).not.toHaveBeenCalled();tabs.props.longPress('search');expect(h.emit).toHaveBeenLastCalledWith({type:'tabLongPress',target:'search-key'});
  });
});
