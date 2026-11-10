import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { ScrollInteraction, listPositions } from './scroll-interaction';
export function useListInteraction<T>(key:string,ready=true){
  const guard=useRef(new ScrollInteraction()).current;
  const list=useRef<FlatList<T>>(null),laidOut=useRef(false);
  const current=useRef({key,restore:true,ready});
  if(current.current.key!==key)current.current={key,restore:true,ready};
  current.current.ready=ready;
  const restore=useCallback(()=>{
    const state=current.current,offset=listPositions.get(state.key);
    if(!state.restore||!list.current||!laidOut.current||(!state.ready&&offset>0))return;
    list.current.scrollToOffset({offset,animated:false});state.restore=false;
  },[]);
  useEffect(()=>{restore();},[key,ready,restore]);
  const onScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{if(!current.current.restore)listPositions.set(current.current.key,event.nativeEvent.contentOffset.y);},[]);
  const onContentSizeChange=useCallback(()=>{laidOut.current=true;restore();},[restore]);
  const beginDrag=useCallback(()=>{current.current.restore=false;guard.beginDrag();},[guard]);
  const beginMomentum=useCallback(()=>{current.current.restore=false;guard.beginMomentum();},[guard]);
  const handlers=useMemo(()=>({onScrollBeginDrag:beginDrag,onScrollEndDrag:guard.endDrag,onMomentumScrollBegin:beginMomentum,onMomentumScrollEnd:guard.endMomentum,onScroll,onContentSizeChange,scrollEventThrottle:64}),[guard,beginDrag,beginMomentum,onScroll,onContentSizeChange]);
  return {guard,list,handlers};
}
