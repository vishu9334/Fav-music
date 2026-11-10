import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(()=>({state:{scopeVersion:1,status:'ready',data:{likes:[] as string[]},toggle:vi.fn()},reduced:false}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),memo:(component:unknown)=>component}));
vi.mock('react-native',()=>({Pressable:'Pressable'}));
vi.mock('../../../design/styles',()=>({ui:{iconButton:{minHeight:44,minWidth:44},pressed:{opacity:.65},disabled:{opacity:.4}}}));
vi.mock('../../../store/useLibraryStore',()=>({useLibraryStore:Object.assign((select:(state:typeof h.state)=>unknown)=>select(h.state),{getState:()=>h.state})}));
vi.mock('../../../store/usePlayerStore',()=>({usePlayerStore:(select:(state:{isReducedMotion:boolean})=>unknown)=>select({isReducedMotion:h.reduced})}));
vi.mock('../../kobra/MorphingHeart',()=>({MorphingHeart:'MorphingHeart'}));
import { LikeButton } from '../LikeButton';
// memo is an identity in this hook-free component contract harness.
const render = LikeButton as (props: Parameters<typeof LikeButton>[0]) => import('react').JSX.Element;
beforeEach(()=>{h.state={scopeVersion:1,status:'ready',data:{likes:[]},toggle:vi.fn()};h.reduced=false;});
describe('shared heart control contract (mocked React Native)',()=>{
  it('reflects the shared selected state and exposes the same accessible action across surfaces',()=>{
    let row=render({trackId:'song',title:'Song'}),player=render({trackId:'song',title:'Song'});
    expect(row.props.accessibilityLabel).toBe('Like Song');row.props.onPress();expect(h.state.toggle).toHaveBeenCalledWith('likes','song');
    h.state.data.likes=['song'];row=render({trackId:'song',title:'Song'});player=render({trackId:'song',title:'Song'});
    for(const control of [row,player]){expect(control.props.accessibilityState.selected).toBe(true);expect(control.props.accessibilityLabel).toBe('Unlike Song');expect(control.props.children.props.selected).toBe(true);}
    expect(row.props.style({pressed:false})).toEqual([{minHeight:44,minWidth:44},false,false]);
  });
  it('ignores an old rendered callback after account change and disables locked/loading actions',()=>{
    const stale=render({trackId:'song',title:'Song'});h.state.scopeVersion++;stale.props.onPress();expect(h.state.toggle).not.toHaveBeenCalled();
    for(const status of ['loading','locked']){h.state.status=status;const control=render({trackId:'song',title:'Song'});expect(control.props.disabled).toBe(true);control.props.onPress();}
    expect(h.state.toggle).not.toHaveBeenCalled();
  });
  it('passes the app-wide reduced-motion preference without adding individual lifecycle listeners',()=>{
    h.reduced=true;expect(render({trackId:'song',title:'Song'}).props.children.props.reduced).toBe(true);
  });
});
