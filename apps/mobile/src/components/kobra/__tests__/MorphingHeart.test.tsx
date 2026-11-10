import { beforeEach, describe, expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({
  effects: [] as Array<()=>void|(()=>void)>, refs: [] as Array<{current:unknown}>, values: [] as Array<{value:number}>, refIndex:0, valueIndex:0,
  cancel: vi.fn(), timing:vi.fn((value:number,_config:unknown)=>value), sequence:vi.fn((...values:number[])=>values.at(-1)!),
}));
vi.mock('react', async original => ({...await original<typeof import('react')>(),
  memo: (component:unknown)=>component,
  useEffect:(effect:()=>void|(()=>void))=>harness.effects.push(effect),
  useRef:(value:unknown)=>harness.refs[harness.refIndex++]??(harness.refs[harness.refIndex-1]={current:value}),
}));
vi.mock('react-native-svg',()=>({default:'Svg',Path:'Path'}));
vi.mock('react-native-reanimated',()=>({default:{View:'AnimatedView',createAnimatedComponent:()=> 'AnimatedPath'},
  useSharedValue:(value:number)=>harness.values[harness.valueIndex++]??(harness.values[harness.valueIndex-1]={value}),
  useAnimatedProps:(compute:()=>unknown)=>compute(),useAnimatedStyle:(compute:()=>unknown)=>compute(),
  cancelAnimation:harness.cancel,withTiming:harness.timing,withSequence:harness.sequence,
}));
import { MorphingHeart } from '../MorphingHeart';
function render(selected:boolean,reduced=false){harness.refIndex=0;harness.valueIndex=0;harness.effects=[];const tree=MorphingHeart({selected,reduced}) as import('react').JSX.Element;const cleanups=harness.effects.map(effect=>effect());return {tree,cleanup:()=>cleanups.forEach(cleanup=>cleanup?.())};}
beforeEach(()=>{harness.values=[];harness.refs=[];vi.clearAllMocks();});
describe('heart animation scheduling (mocked UI runtime)',()=>{
  it('does not pulse on row mount, animates fill and unfill once, and cancels superseded motion',()=>{
    let frame=render(false);expect(harness.sequence).not.toHaveBeenCalled();frame.cleanup();
    frame=render(true);expect(harness.timing).toHaveBeenCalledWith(1,{duration:220});expect(harness.sequence).toHaveBeenCalledTimes(1);expect(harness.values.map(v=>v.value)).toEqual([1,1]);frame.cleanup();
    frame=render(false);expect(harness.timing).toHaveBeenCalledWith(0,{duration:220});expect(harness.sequence).toHaveBeenCalledTimes(2);expect(harness.cancel).toHaveBeenCalledTimes(10);frame.cleanup();
  });
  it('settles immediately without scale or fill animation when reduced motion is enabled',()=>{
    const first=render(false,true);first.cleanup();const last=render(true,true);
    expect(harness.timing).not.toHaveBeenCalled();expect(harness.sequence).not.toHaveBeenCalled();expect(harness.values.map(v=>v.value)).toEqual([1,1]);last.cleanup();
  });
  it('uses one SVG heart path with no circular overlay or per-frame React state',()=>{
    const {tree,cleanup}=render(true);const svg=tree.props.children;
    expect(tree.type).toBe('AnimatedView');expect(svg.type).toBe('Svg');expect(svg.props.children.type).toBe('AnimatedPath');
    expect(Array.isArray(svg.props.children)).toBe(false);expect(tree.props.pointerEvents).toBe('none');cleanup();
  });
});
