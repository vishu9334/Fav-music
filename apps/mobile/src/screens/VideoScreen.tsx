import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, EmptyState, PageHeader, ui } from '../components/app/ui';
import { useCatalogStore } from '../store/useCatalogStore';
import { demoCatalog } from '../catalog/demo-catalog';
import { useCatalogPage } from '../catalog/use-catalog-page';
import { catalogClient, catalogEnabled } from '../catalog/catalog-runtime';
import { isCatalogId } from '../catalog/catalog-api';
import type { VideoItem } from '../video/video.contract';
import {
  createLocalVideoItem,
  getAllAvailableVideos,
  getLocalStorageVideos,
} from '../video/local-video-storage';

/** This route is safe to import in an older APK; no expo-video import executes here. */
export default function VideoScreen(): React.JSX.Element {
  const router = useRouter();
  const videoPage = useCatalogPage({ hasVideo: true });
  const [focused, setFocused] = useState(false);
  const params = useLocalSearchParams<{ trackId?: string; videoUri?: string; title?: string }>();
  const revision = useCatalogStore((s) => s.revision), [metadataError, setMetadataError] = useState(false);
  const [metadataRetry, setMetadataRetry] = useState(0);
  const [localStorageVideos, setLocalStorageVideos] = useState<readonly VideoItem[]>([]);
  void revision;

  const loadLocalVideos = useCallback(() => {
    let active = true;
    void getLocalStorageVideos().then((found) => {
      if (active) setLocalStorageVideos(found);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    return loadLocalVideos();
  }, [loadLocalVideos]);

  const knownTrack = typeof params.trackId === 'string' ? demoCatalog.get(params.trackId) : undefined;
  void knownTrack;
  useEffect(() => {
    setMetadataError(false);
    if (typeof params.trackId !== 'string' || !isCatalogId(params.trackId)) return;
    let active = true;
    void catalogClient.restore([params.trackId]).catch(() => { if (active) setMetadataError(true); });
    return () => { active = false; };
  }, [params.trackId, metadataRetry]);

  const paramVideo = useMemo<VideoItem | null>(() => {
    if (!params.videoUri) return null;
    return createLocalVideoItem(params.videoUri, params.title);
  }, [params.videoUri, params.title]);

  // Exclusively show local downloaded videos ("my file that video only", NOT online videos)
  const items = useMemo((): readonly VideoItem[] => {
    return getAllAvailableVideos([], localStorageVideos, paramVideo);
  }, [localStorageVideos, paramVideo]);

  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const native = useMemo(() => {
    try {
      return {
        video: !!requireOptionalNativeModule('ExpoVideo'),
        orientation: Platform.OS === 'android' || !!requireOptionalNativeModule('ExpoScreenOrientation'),
      };
    }
    catch { return { video: false, orientation: Platform.OS === 'android' }; }
  }, []);
  const catalogError = metadataError || videoPage.status === 'error' || !!videoPage.error;
  const loading = !catalogError && catalogEnabled() && (videoPage.status === 'loading' || videoPage.status === 'unavailable');
  if (!items.length) {
    return (
      <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}>
        <ScrollView>
          <PageHeader back title="My Videos" subtitle="Local device storage" />
          <EmptyState
            title={catalogError ? 'Videos unavailable' : loading ? 'Loading videos…' : 'No videos yet'}
            message={catalogError ? 'Check your connection and try again.' : 'Videos downloaded to your device storage (Downloads / Movies) will appear here automatically.'}
          >
            <Button title="Search music" onPress={() => router.push('/search')} />
            {catalogError && (
              <Button
                title="Retry catalog"
                secondary
                disabled={!catalogEnabled()}
                onPress={() => {
                  setMetadataError(false);
                  setMetadataRetry(value => value + 1);
                  void useCatalogStore.getState().load({ hasVideo: true }, false, true);
                }}
              />
            )}
            <Button title="Rescan device storage" secondary onPress={loadLocalVideos} />
          </EmptyState>
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (native.video && focused) {
    try {
      const Session = (require('../video/NativeVideoSession') as typeof import('../video/NativeVideoSession')).NativeVideoSession;
      return <VideoBoundary><Session orientationAvailable={native.orientation} items={items} onRefresh={loadLocalVideos} /></VideoBoundary>;
    } catch { return <Unavailable />; }
  }
  if (native.video) return <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}><PageHeader back title="My Videos" subtitle="Video paused" /></SafeAreaView>;
  return <Unavailable />;
}
function Unavailable(): React.JSX.Element {
  return (
    <SafeAreaView style={ui.screen} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <PageHeader back title="My Videos" />
        <EmptyState title="Video unavailable" message="Update the app to play videos." />
      </ScrollView>
    </SafeAreaView>
  );
}
class VideoBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  public override state = { failed: false };
  public static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  public override render(): React.ReactNode { return this.state.failed ? <Unavailable /> : this.props.children; }
}
