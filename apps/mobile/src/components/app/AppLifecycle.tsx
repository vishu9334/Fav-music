import { useEffect } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useDiscoveryStore } from '../../store/useDiscoveryStore';
import { PlaybackHistoryObserver } from '../../discovery/playback-history.observer';
import { nativeHistorySource } from '../../discovery/native-history-source';
import { useCatalogStore } from '../../store/useCatalogStore';
import { catalogClient, catalogEnabled } from '../../catalog/catalog-runtime';
import { isCatalogId } from '../../catalog/catalog-api';

/** One app-wide lifecycle; tab/player navigation never tears down background audio. */
export function AppLifecycle(): null {
  useEffect(() => {
    const observer = new PlaybackHistoryObserver(nativeHistorySource, (id) => useDiscoveryStore.getState().recordPlayed(id));
    observer.start();
    void useDiscoveryStore.getState().initializeHistory();
    void usePlayerStore.getState().initializePlayer();
    void useCatalogStore.getState().initialize();
    let active=true, syncTimer:ReturnType<typeof setTimeout>|undefined, restoring='', historyScope=-1;
    const collectionsChanged=()=>{
      const state=useLibraryStore.getState();if(state.status!=='ready'||!state.scope)return;
      const data=state.data,version=state.scopeVersion;
      if (historyScope !== version) { historyScope = version; void useDiscoveryStore.getState().initializeHistory(); }
      const ids=[...new Set([...data.likes,...data.favourites,...data.bookmarks,...data.warehouse,...data.playlists.flatMap(p=>p.trackIds),...(data.history??[]).map(h=>h.trackId)])].filter(isCatalogId).sort();
      const key=`${version}:${ids.join(',')}`;
      if(catalogEnabled()&&key!==restoring){restoring=key;void catalogClient.restore(ids,()=>active&&useLibraryStore.getState().scopeVersion===version).catch(()=>{});}
      if(syncTimer)clearTimeout(syncTimer);
      syncTimer=setTimeout(()=>{if(active&&useLibraryStore.getState().scopeVersion===version)void useLibraryStore.getState().synchronize();},1500);
    };
    const unsubscribe=useLibraryStore.subscribe((next,prior)=>{
      if(next.scopeVersion!==prior.scopeVersion||next.status!==prior.status||JSON.stringify(next.data)!==JSON.stringify(prior.data))collectionsChanged();
    });
    void useLibraryStore.getState().initialize().then(collectionsChanged);
    const update = (enabled: boolean) => usePlayerStore.getState().setReducedMotion(enabled);
    void AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    let timer: ReturnType<typeof setInterval> | undefined;
    const stopClock = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
    const startClock = () => { stopClock(); useDiscoveryStore.getState().refreshTime(); observer.refresh(); timer = setInterval(() => useDiscoveryStore.getState().refreshTime(), 60_000); };
    if (AppState.currentState === 'active' || AppState.currentState === null) startClock();
    const appState = AppState.addEventListener('change', (state) => {if(state==='active'){startClock();collectionsChanged();}else stopClock();});
    return () => { active=false;unsubscribe();if(syncTimer)clearTimeout(syncTimer);subscription.remove(); appState.remove(); stopClock(); observer.stop(); };
  }, []);
  return null;
}
