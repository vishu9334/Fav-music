import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
const h = vi.hoisted(() => ({
  reduced: false, fontScale: 1, focus: [] as Array<() => (() => void)>,
  listeners: new Set<(state:string)=>void>(), remove: vi.fn(), set: vi.fn(), cancel: vi.fn(), start: vi.fn(), stop: vi.fn(),
  timing: vi.fn(), loop: vi.fn(),
}));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), memo:(component:unknown)=>component, useRef:(value:unknown)=>({current:value}), useCallback:(fn:unknown)=>fn }));
vi.mock('react-native', () => ({
  View: 'View', StyleSheet: {create:(value:unknown)=>value,hairlineWidth:1}, useWindowDimensions:()=>({width:320,height:640,fontScale:h.fontScale}),
  AppState:{currentState:'active',addEventListener:(_event:string,handler:(state:string)=>void)=>{h.listeners.add(handler);return {remove:()=>{h.listeners.delete(handler);h.remove();}};}},
  Animated:{View:'AnimatedView',Value:class { setValue=h.set;stopAnimation=h.cancel; },timing:h.timing,sequence:(steps:unknown)=>steps,loop:h.loop},
}));
vi.mock('expo-router',()=>({useFocusEffect:(callback:()=>()=>void)=>{h.focus.push(callback);}}));
vi.mock('../../../design/useReducedMotion',()=>({useReducedMotion:()=>h.reduced}));
import { ArtworkSkeleton as ArtworkComponent, CategoryGridSkeleton as CategoryComponent, PlaylistListSkeleton as PlaylistComponent, SavedLinksSkeleton as LinksComponent, SongCardSkeleton as CardComponent, SongListSkeleton as SongComponent } from '../Skeleton';
import { catalogPending } from '../loading-state';
type Element = React.JSX.Element;
// memo is identity in this harness; production exotic-component types return ReactNode.
const ArtworkSkeleton=ArtworkComponent as (props:React.ComponentProps<typeof ArtworkComponent>)=>Element;
const CategoryGridSkeleton=CategoryComponent as (props:React.ComponentProps<typeof CategoryComponent>)=>Element;
const PlaylistListSkeleton=PlaylistComponent as (props:React.ComponentProps<typeof PlaylistComponent>)=>Element;
const SavedLinksSkeleton=LinksComponent as (props:React.ComponentProps<typeof LinksComponent>)=>Element;
const SongCardSkeleton=CardComponent as (props:React.ComponentProps<typeof CardComponent>)=>Element;
const SongListSkeleton=SongComponent as (props:React.ComponentProps<typeof SongComponent>)=>Element;
const group=(tree:Element)=>(tree.type as (props:unknown)=>Element)(tree.props);
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();h.reduced=false;h.fontScale=1;h.focus=[];h.listeners.clear();h.loop.mockReturnValue({start:h.start,stop:h.stop});});
afterEach(()=>vi.useRealTimers());
describe('skeleton layout and animation contracts (mocked native runtime)',()=>{
  it('reserves real row/artwork geometry at small widths and accommodates large fonts',()=>{
    let tree=SongListSkeleton({count:6}),rows=tree.props.children;
    expect(rows).toHaveLength(6);const row=rows[0].props.children[0];
    expect(row.props.style[0]).toMatchObject({paddingLeft:18,paddingRight:6,paddingVertical:10,gap:12});
    expect(row.props.style[1].minHeight).toBe(76);expect(row.props.children[0].props.style).toEqual({width:46,height:46,borderRadius:10});
    h.fontScale=2;tree=SongListSkeleton({});expect(tree.props.children[0].props.children[0].props.style[1].minHeight).toBe(88);
    expect(ArtworkSkeleton({size:110}).props.style).toEqual({width:110,height:110});
  });
  it('matches playlist/resource cards and wrapped category grid geometry; caps placeholder budgets',()=>{
    expect(SongListSkeleton({count:100}).props.children).toHaveLength(8);
    const playlist=PlaylistListSkeleton({count:100}),row=playlist.props.children[0];expect(playlist.props.children).toHaveLength(6);
    expect(row.props.style[0]).toMatchObject({marginHorizontal:20,paddingVertical:14,borderRadius:24});
    expect(row.props.children[0].props.style).toEqual({width:58,height:62,borderRadius:18});
    expect(PlaylistListSkeleton({resource:true}).props.children[0].props.children[0].props.style.width).toBe(64);expect(PlaylistListSkeleton({resource:true}).props.children[0].props.style[1].minHeight).toBe(98);h.fontScale=2;expect(PlaylistListSkeleton({resource:true}).props.children[0].props.style[1].minHeight).toBe(150);h.fontScale=1;
    const grid=CategoryGridSkeleton({count:5}).props.children;expect(grid.props.style).toMatchObject({flexWrap:'wrap',gap:8,paddingHorizontal:18});expect(grid.props.children).toHaveLength(5);
    expect(SongCardSkeleton({}).props.children[0].props.style.aspectRatio).toBe(1);
    expect(SavedLinksSkeleton({}).props.label).toBe('Loading saved links');
  });
  it('exposes one busy progress region without interactive or individually announced shapes',()=>{
    const frame=group(SongListSkeleton({}));expect(frame.props).toMatchObject({pointerEvents:'none',accessible:true,accessibilityRole:'progressbar',accessibilityLabel:'Loading music catalog',accessibilityState:{busy:true}});
    expect(frame.props.children.props).toMatchObject({accessible:false,importantForAccessibility:'no-hide-descendants'});
  });
  it('does not flash on fast requests; uses one noninteractive native pulse per group on slow requests',()=>{
    group(SongListSkeleton({}));const cleanup=h.focus[0]!();vi.advanceTimersByTime(159);expect(h.start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);expect(h.loop).toHaveBeenCalledTimes(1);expect(h.start).toHaveBeenCalledOnce();expect(h.timing).toHaveBeenCalledTimes(2);
    for(const [,config]of h.timing.mock.calls)expect(config).toMatchObject({useNativeDriver:true,isInteraction:false,duration:950});
    cleanup();expect(h.stop).toHaveBeenCalledOnce();expect(h.cancel).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels before the appearance delay on a fast completion or navigation away',()=>{
    group(SongListSkeleton({}));const cleanup=h.focus[0]!();cleanup();vi.advanceTimersByTime(2000);
    expect(h.start).not.toHaveBeenCalled();expect(h.listeners.size).toBe(0);expect(h.remove).toHaveBeenCalledOnce();
  });
  it('shows a static accessible skeleton for reduced motion without scheduling animation',()=>{
    h.reduced=true;group(CategoryGridSkeleton({}));const cleanup=h.focus[0]!();vi.advanceTimersByTime(160);
    expect(h.set).toHaveBeenLastCalledWith(0.65);expect(h.loop).not.toHaveBeenCalled();expect(h.start).not.toHaveBeenCalled();cleanup();
  });
  it('stops in background, resumes only when active, and removes listeners on blur/unmount',()=>{
    group(PlaylistListSkeleton({}));const cleanup=h.focus[0]!();vi.advanceTimersByTime(160);expect(h.start).toHaveBeenCalledTimes(1);
    for(const listener of h.listeners)listener('background');expect(h.stop).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
    for(const listener of h.listeners)listener('active');vi.advanceTimersByTime(160);expect(h.start).toHaveBeenCalledTimes(2);cleanup();expect(h.listeners.size).toBe(0);expect(h.stop).toHaveBeenCalledTimes(2);
  });
  it('treats configured initial/debounced loading as pending, never unavailable configuration/errors/empty results',()=>{
    expect(catalogPending('unavailable',null,true)).toBe(true);expect(catalogPending('loading',null,true)).toBe(true);
    for(const status of ['error','ready'])expect(catalogPending(status,null,true)).toBe(false);
    expect(catalogPending('loading','Offline',true)).toBe(false);expect(catalogPending('unavailable',null,false)).toBe(false);
  });
});
