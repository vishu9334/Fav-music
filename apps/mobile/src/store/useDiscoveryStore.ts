import { PlaybackState, WarehouseStatus } from '@aadat/contracts';
import { demoCatalog } from '../catalog/demo-catalog';
import { AccountHistoryRepository } from '../discovery/account-history.repository';
import { RecommendationService } from '../discovery/recommendation.service';
import { createDiscoveryStore } from './createDiscoveryStore';
import { usePlayerStore } from './usePlayerStore';
import { useLibraryStore } from './useLibraryStore';
import { catalogClient, catalogEnabled } from '../catalog/catalog-runtime';
import { catalogQuery } from '../catalog/catalog-query';

export const recommendations = new RecommendationService(demoCatalog);
let realDiscoveryAvailable = false;
export function excludedDiscoveryIds(): string[] {
  return [...useLibraryStore.getState().data.warehouseStates.filter((entry) => entry.status !== WarehouseStatus.ACTIVE).map((entry) => entry.trackId),
    ...(!realDiscoveryAvailable ? demoCatalog.tracks().filter((track) => track.catalogSource === 'catalog').map((track) => track.id) : [])];
}
export const useDiscoveryStore = createDiscoveryStore(()=>new AccountHistoryRepository(), recommendations, {
  prepare: async (context) => {
    if (useLibraryStore.getState().status !== 'ready') await useLibraryStore.getState().initialize();
    if (useLibraryStore.getState().status !== 'ready') return false;
    await catalogClient.initialize(); realDiscoveryAvailable = false;
    if (catalogEnabled()) try { await catalogClient.page(catalogQuery(context)); realDiscoveryAvailable = true; } catch { /* Saved references remain; unavailable streams are not substituted. */ }
    return true;
  },
  currentId: () => { const state = usePlayerStore.getState(); return state.playbackState === PlaybackState.IDLE ? undefined : state.tracks[state.activeTrackIndex]?.id; },
  play: async (tracks, id, label) => {
    await usePlayerStore.getState().playQueue(tracks, id, label);
    const state = usePlayerStore.getState();
    const isPlayingOrBuffering =
      state.playbackState === PlaybackState.PLAYING ||
      state.playbackState === PlaybackState.BUFFERING ||
      state.playbackState === PlaybackState.LOADING;
    return (
      isPlayingOrBuffering &&
      state.tracks[state.activeTrackIndex]?.id === id &&
      !state.errorMessage
    );
  },
}, excludedDiscoveryIds);

// Wire account lifecycle to listening history: reset and rehydrate across account switches and restarts
let activeScope: string | null = useLibraryStore.getState().scope;
let activeVersion = useLibraryStore.getState().scopeVersion;
useLibraryStore.subscribe((state) => {
  if (state.scope !== activeScope || state.scopeVersion !== activeVersion || (state.status === 'ready' && !useDiscoveryStore.getState().historyReady && state.scope)) {
    activeScope = state.scope;
    activeVersion = state.scopeVersion;
    useDiscoveryStore.getState().resetForAccount();
    if (state.status === 'ready' && state.scope) {
      void useDiscoveryStore.getState().initializeHistory();
    }
  }
});
