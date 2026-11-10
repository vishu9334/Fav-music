import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  slots:[] as unknown[], index:0, effects:[] as Array<()=>void|(()=>void)>, reduced:false,
  timing:vi.fn(), start:vi.fn(), stop:vi.fn(), values:[] as Array<{value:number;setValue:ReturnType<typeof vi.fn>;stopAnimation:ReturnType<typeof vi.fn>}>,
}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),memo:(value:unknown)=>value,
  useState:(initial:unknown)=>{const index=h.index++;if(!(index in h.slots))h.slots[index]=typeof initial==='function'?initial():initial;return [h.slots[index],(value:unknown)=>{h.slots[index]=typeof value==='function'?value(h.slots[index]):value;}];},
  useRef:(value:unknown)=>{const index=h.index++;return h.slots[index]??(h.slots[index]={current:value});},
  useEffect:(effect:()=>void|(()=>void))=>{h.effects.push(effect);},
}));
vi.mock('react-native',()=>({View:'View',Pressable:'Pressable',Text:'Text',StyleSheet:{create:(v:unknown)=>v,hairlineWidth:1},
  Animated:{View:'AnimatedView',Value:class {value:number;constructor(value:number){this.value=value;h.values.push(this);}setValue=vi.fn((value:number)=>{this.value=value;});stopAnimation=vi.fn();},timing:h.timing,parallel:()=>({start:h.start,stop:h.stop})},
}));
vi.mock('lucide-react-native',()=>({Home:'HomeIcon',Search:'SearchIcon',Library:'LibraryIcon',Boxes:'WarehouseIcon'}));
vi.mock('../../../design/useReducedMotion',()=>({useReducedMotion:()=>h.reduced}));
import { BottomTabStrip as Component } from '../BottomTabStrip';
import { colors } from '../../../design/theme';
import type { BottomTabName } from '../bottom-navigation';
type Element=React.JSX.Element;
const Strip=Component as (props:React.ComponentProps<typeof Component>)=>Element;
const render=(selected:BottomTabName|null,select=vi.fn())=>{h.index=0;h.effects=[];const tree=Strip({selected,select});const cleanup=h.effects.map(effect=>effect());return {tree,cleanup:()=>cleanup.forEach(stop=>stop?.())};};
const tabs=(tree:Element)=>tree.props.children[1] as Element[];
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);vi.clearAllMocks();h.slots=[];h.index=0;h.values=[];h.reduced=false;});
afterEach(()=>vi.useRealTimers());
describe('shared native bottom-tab presentation',()=>{
  it('gives every tab identical bounds/alignment and one compact background instead of per-icon circles',()=>{
    const {tree,cleanup}=render('search'),items=tabs(tree),highlight=tree.props.children[0];
    expect(items).toHaveLength(4);expect(items.map(tab=>tab.props.accessibilityLabel)).toEqual(['Home','Search','Library','Warehouse']);
    const style=items[0]!.props.style({pressed:false})[0];expect(style).toMatchObject({minWidth:48,minHeight:58,alignItems:'center',paddingHorizontal:2,paddingVertical:4});
    for(const item of items)expect(item.props.style({pressed:false})[0]).toBe(style);
    expect(highlight.props.style[0]).toMatchObject({width:44,height:30,borderRadius:11});expect(highlight.props.pointerEvents).toBe('none');
    expect(items.map(item=>item.props.children[0].props.style)).toEqual(Array(4).fill(items[0]!.props.children[0].props.style));cleanup();
  });
  it('keeps selected semantics, icon contrast and complete accessible labels for all four tabs',()=>{
    for(const name of ['index','search','library','warehouse'] as const){const {tree,cleanup}=render(name);expect(tabs(tree).filter(tab=>tab.props.accessibilityState.selected)).toHaveLength(1);for(const tab of tabs(tree)){const icon=tab.props.children[0].props.children;expect(icon.props.color).toBe(tab.props.accessibilityState.selected?colors.accent:colors.muted);expect(tab.props.accessibilityRole).toBe('tab');}cleanup();}
  });
  it('starts at measured position without mount motion; animates selection on the native driver and cancels stale work',()=>{
    let frame=render('index');expect(h.timing).not.toHaveBeenCalled();frame.tree.props.onLayout({nativeEvent:{layout:{width:320}}});frame.cleanup();
    frame=render('index');expect(h.timing).not.toHaveBeenCalled();frame.cleanup();
    frame=render('warehouse');expect(h.timing).toHaveBeenCalledTimes(2);for(const [,config]of h.timing.mock.calls)expect(config).toMatchObject({useNativeDriver:true,isInteraction:false});expect(h.start).toHaveBeenCalledOnce();
    frame.cleanup();expect(h.stop).toHaveBeenCalledOnce();
  });
  it('settles directly for reduced motion and after rotation instead of flying across the resized bar',()=>{
    h.reduced=true;let frame=render('index');frame.tree.props.onLayout({nativeEvent:{layout:{width:320}}});frame.cleanup();frame=render('search');expect(h.timing).not.toHaveBeenCalled();frame.cleanup();
    h.reduced=false;frame=render('search');frame.tree.props.onLayout({nativeEvent:{layout:{width:700}}});frame.cleanup();vi.clearAllMocks();frame=render('search');expect(h.timing).not.toHaveBeenCalled();frame.cleanup();
  });
  it('coalesces duplicate presses without delayed navigation and immediately accepts a different tab',()=>{
    const select=vi.fn(),{tree,cleanup}=render('index',select),items=tabs(tree);items[1]!.props.onPress();items[1]!.props.onPress();items[2]!.props.onPress();expect(select.mock.calls).toEqual([['search'],['library']]);vi.advanceTimersByTime(1000);expect(select).toHaveBeenCalledTimes(2);cleanup();
  });
});
