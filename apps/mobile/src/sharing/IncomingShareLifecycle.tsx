import {useEffect} from 'react';
import {AppState,DeviceEventEmitter,NativeModules} from 'react-native';
import {useRouter} from 'expo-router';
import {incomingReelShare,incomingTrackPayload} from './incoming-share';
import {shareLinks} from './sharing';
import {AuthModule} from '../auth/auth.module';
import {useLibraryStore} from '../store/useLibraryStore';

export function IncomingShareLifecycle():null{
 const router=useRouter();
 useEffect(()=>{
  let alive=true,busy=false,lastPayload='',lastAt=0;
  const consume=()=>{
   const state=AuthModule.getController().getSnapshot(),owner=state.user?.id;
   const library=useLibraryStore.getState();
   if(!owner||state.status!=='authenticated'||library.status!=='ready'||library.scope!==owner||busy)return;
   const module=NativeModules.AadatShare as {consume?:()=>Promise<string|null>}|undefined;
   if(!module?.consume)return;
   busy=true;
   void module.consume().then(text=>{
     if(!alive||AuthModule.getController().getSnapshot().user?.id!==owner)return;
     const payload=incomingTrackPayload(text,value=>shareLinks.parse(value));
     if(payload){
       const now=Date.now();
       if(payload!==lastPayload||now-lastAt>1000){
         lastPayload=payload;
         lastAt=now;
         router.push({pathname:'/shared',params:{payload}});
       }
       return;
     }
     const share=incomingReelShare(text);
     if(share){
       const now=Date.now();
       const dedupeKey=`${share.reelUrl}:${share.metadata??''}`;
       if(dedupeKey!==lastPayload||now-lastAt>1000){
         lastPayload=dedupeKey;
         lastAt=now;
         router.push({pathname:'/instamus',params:{reel:share.reelUrl,query:share.metadata??'',import:'1',owner}});
       }
     }
   }).catch(()=>{}).finally(()=>{busy=false;});
  };
  const event=DeviceEventEmitter.addListener('aadatShareAvailable',consume),foreground=AppState.addEventListener('change',state=>{if(state==='active')consume();}),auth=AuthModule.getController().subscribe(consume),library=useLibraryStore.subscribe(consume);consume();
  return()=>{alive=false;event.remove();foreground.remove();auth();library();};
 },[router]);return null;
}
