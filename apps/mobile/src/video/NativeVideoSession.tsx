import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { VideoView } from 'expo-video';
import {
  Check,
  Gauge,
  Languages,
  Maximize,
  Minimize,
  MoreVertical,
  RotateCcw,
  RotateCw,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react-native';
import { useStore } from 'zustand';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PlaybackState } from '@aadat/contracts';
import TrackPlayer, { State } from 'react-native-track-player';
import { AudioPlaybackService } from '../services/playback/AudioPlaybackService';
import { mediaPlaybackCoordinator } from '../services/playback/MediaPlaybackCoordinator';
import { usePlayerStore } from '../store/usePlayerStore';
import { useReducedMotion } from '../design/useReducedMotion';
import { KobraPlaybackControls } from '../components/kobra/KobraPlaybackControls';
import { Scrubber } from '../components/player/Scrubber';
import { Button, colors, IconButton, PageHeader, ui } from '../components/app/ui';
import { ExpoVideoEngine } from './ExpoVideoEngine';
import { VideoPlaybackService } from './VideoPlaybackService';
import { FullscreenController } from './FullscreenController';
import { VideoPosterCarousel } from './VideoPosterCarousel';
import type { VideoItem } from './video.contract';
import { videoSessionKey } from './video-session-key';
import { canRetryVideo, VideoPosterGate } from './video-presentation';
import {
  type AudioTrackInfo,
  getNativeScreenBrightness,
  getNativeSystemVolume,
  getVideoAudioTracks,
  setNativeScreenBrightness,
  setNativeSystemVolume,
  switchVideoAudioTrack,
} from './local-video-storage';

interface Session { engine: ExpoVideoEngine; service: VideoPlaybackService; fullscreen: FullscreenController }

const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export function NativeVideoSession({ orientationAvailable, items, back, onRefresh }: {
  orientationAvailable: boolean;
  items: readonly VideoItem[];
  back?: () => void;
  onRefresh?: () => void;
}): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const playbackKey = videoSessionKey(items);
  const [stored, setStored] = useState<{ key: string; value: Session } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = stored?.key === playbackKey ? stored.value : null;
  const generation = useRef(0);

  useEffect(() => {
    let alive = true;
    let active: Session | null = null;
    generation.current++;
    setFullscreen(false);
    setError(null);

    try {
      const engine = new ExpoVideoEngine();
      const service = new VideoPlaybackService(engine, items, mediaPlaybackCoordinator, async () => {
        await AudioPlaybackService.getInstance().pause();
        if (await TrackPlayer.getPlayWhenReady() || (await TrackPlayer.getPlaybackState()).state === State.Playing) {
          throw new Error('Audio did not pause. Video was kept silent. Please retry.');
        }
      });
      const controller = new FullscreenController({
        current: async () => {
          const orientation = await import('expo-screen-orientation');
          const lock = await orientation.getOrientationLockAsync();
          return lock === orientation.OrientationLock.UNKNOWN ? orientation.OrientationLock.DEFAULT : lock;
        },
        landscape: async () => {
          const orientation = await import('expo-screen-orientation');
          await orientation.lockAsync(orientation.OrientationLock.LANDSCAPE);
        },
        restore: async (lock) => {
          const orientation = await import('expo-screen-orientation');
          await orientation.lockAsync(lock);
        },
      }, (value) => {
        if (alive) setFullscreen(value);
      });

      active = { engine, service, fullscreen: controller };
      setStored({ key: playbackKey, value: active });
      void service.select(0);
    } catch {
      setError('Video is unavailable. Please reopen this screen.');
    }

    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && active) {
        void active.service.pause();
        void active.fullscreen.exit().catch(() => {
          if (alive) setError('The screen could not be restored. Please try again.');
        });
      }
    });

    return () => {
      alive = false;
      generation.current++;
      appState.remove();
      active?.service.dispose();
      void active?.fullscreen.dispose().catch(() => console.warn('[Video] Orientation restoration needs retry.'));
    };
  }, [playbackKey]);

  const report = (action: Promise<void>, clear = false) => {
    const version = generation.current;
    void action.then(() => { if (clear && version === generation.current) setError(null); })
      .catch(() => { if (version === generation.current) setError('Fullscreen is unavailable. Please try again.'); });
  };

  const header = back ? (
    <View style={{ padding: 20, gap: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Button title="Back" secondary onPress={back} />
        <Text accessibilityRole="header" style={ui.title}>Music videos</Text>
      </View>
      {onRefresh && <IconButton icon={RotateCw} label="Refresh videos" onPress={onRefresh} />}
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
      <View style={{ flex: 1 }}>
        <PageHeader back title="Music videos" subtitle="Local storage · Offline" />
      </View>
      {onRefresh && <IconButton icon={RotateCw} label="Refresh videos" onPress={onRefresh} />}
    </View>
  );

  if (!session) {
    return (
      <SafeAreaView style={ui.screen} edges={back ? ['top', 'left', 'right'] : ['left', 'right']}>
        {header}
        {error ? <Text style={[ui.body, { padding: 20 }]}>{error}</Text> : <ActivityIndicator color={colors.accent} accessibilityLabel="Preparing native video" />}
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar hidden={fullscreen} />
      <SafeAreaView style={ui.screen} edges={back ? ['top', 'left', 'right'] : ['left', 'right']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {header}
          {!fullscreen && (
            <VideoSurface
              items={items}
              session={session}
              fullscreen={false}
              toggleFullscreen={() => report(session.fullscreen.enter())}
              orientationAvailable={orientationAvailable}
            />
          )}
          {error && (
            <View style={styles.notice}>
              <Text style={ui.body}>{error}</Text>
              <Button title="Restore screen" secondary onPress={() => report(session.fullscreen.exit(), true)} />
            </View>
          )}
          <VideoQueue items={items} session={session} />
        </ScrollView>
      </SafeAreaView>
      <Modal
        visible={fullscreen}
        animationType={reducedMotion ? 'none' : 'fade'}
        hardwareAccelerated
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        onRequestClose={() => report(session.fullscreen.exit())}
      >
        {fullscreen && (
          <SafeAreaProvider>
            <SafeAreaView style={ui.screen}>
              <VideoSurface
                items={items}
                session={session}
                fullscreen
                toggleFullscreen={() => report(session.fullscreen.exit())}
                orientationAvailable={orientationAvailable}
              />
              {error && (
                <View style={{ padding: 12, gap: 8 }}>
                  <Text style={ui.body} accessibilityLiveRegion="polite">{error}</Text>
                  <Button title="Exit fullscreen" secondary onPress={() => report(session.fullscreen.exit(), true)} />
                </View>
              )}
            </SafeAreaView>
          </SafeAreaProvider>
        )}
      </Modal>
    </>
  );
}

function VideoTimeline({ service }: { service: VideoPlaybackService }): React.JSX.Element {
  const position = useStore(service.state, (s) => s.position);
  const duration = useStore(service.state, (s) => s.duration);
  const buffered = useStore(service.state, (s) => s.buffered);
  const busy = useStore(service.state, (s) => s.busy);
  return (
    <Scrubber
      position={position}
      duration={duration}
      buffered={buffered}
      disabled={busy || duration <= 0}
      showTimeLabels={false}
      onSeek={(seconds) => { void service.seek(seconds); }}
    />
  );
}

function VideoTransport({ service }: { service: VideoPlaybackService }): React.JSX.Element {
  const playbackState = useStore(service.state, (s) => s.playbackState);
  const busy = useStore(service.state, (s) => s.busy);
  const reduced = usePlayerStore((s) => s.isReducedMotion);
  return (
    <KobraPlaybackControls
      variant="seek"
      playbackState={playbackState}
      disabled={busy}
      reducedMotion={reduced}
      onPlayPause={() => { void service.toggle(); }}
      onPrevious={() => { void service.previous(); }}
      onNext={() => { void service.next(); }}
    />
  );
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function VideoSurface({ items, session, fullscreen, toggleFullscreen, orientationAvailable }: {
  items: readonly VideoItem[];
  session: Session;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  orientationAvailable: boolean;
}): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { engine, service } = session;
  const [contentWidth, setContentWidth] = useState(Math.max(1, width - insets.left - insets.right));
  const index = useStore(service.state, (s) => s.index);
  const state = useStore(service.state, (s) => s.playbackState);
  const position = useStore(service.state, (s) => s.position);
  const duration = useStore(service.state, (s) => s.duration);
  const error = useStore(service.state, (s) => s.error);
  const busy = useStore(service.state, (s) => s.busy);
  const reduced = useReducedMotion(usePlayerStore((s) => s.isReducedMotion));
  const item = items[index] ?? service.items[index];
  const gate = useRef(new VideoPosterGate()).current;
  const showPoster = gate.visible(item?.id ?? '', state);
  const opacity = useSharedValue(showPoster ? 1 : 0);

  // In-player overlay controls visibility & auto-hide
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Playback speed state (0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showSpeedModal, setShowSpeedModal] = useState(false);

  // Audio track & language state
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
  const [showAudioModal, setShowAudioModal] = useState(false);

  // Consolidated options modal for fullscreen Three-Dot menu
  const [showOptionsModal, setShowOptionsModal] = useState(false);

  // VLC Touch Gestures: Left = Brightness, Right = Volume
  const [brightness, setBrightness] = useState(0.7);
  const [volume, setVolume] = useState(0.85);
  const [hudType, setHudType] = useState<'brightness' | 'volume' | 'seek-back' | 'seek-forward' | null>(null);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchSide = useRef<'left' | 'right' | null>(null);
  const initialBrightnessRef = useRef<number>(0.7);
  const initialVolumeRef = useRef<number>(0.85);

  useEffect(() => {
    opacity.value = withTiming(showPoster ? 1 : 0, { duration: reduced ? 0 : 180 });
  }, [showPoster, reduced, opacity]);

  // Controls auto-hide timer (3.5 seconds)
  const resetControlsTimer = () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (state === PlaybackState.PLAYING) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  };

  useEffect(() => {
    if (state === PlaybackState.PLAYING) {
      resetControlsTimer();
    } else {
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    }
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [state]);

  // Load initial brightness and system volume
  useEffect(() => {
    void getNativeScreenBrightness().then((b) => { if (b > 0) setBrightness(b); });
    void getNativeSystemVolume().then((v) => { if (v >= 0) setVolume(v); });
  }, []);

  // Load audio tracks for current video
  useEffect(() => {
    let alive = true;
    const uri = item?.source.kind === 'local' ? item.source.uri : '';
    if (uri) {
      void getVideoAudioTracks(uri).then((tracks) => {
        if (alive) {
          setAudioTracks(tracks);
          const sel = tracks.findIndex((t) => t.selected);
          setSelectedAudioIndex(sel >= 0 ? sel : 0);
        }
      });
    } else {
      setAudioTracks([]);
    }
    return () => { alive = false; };
  }, [item?.id, item?.source]);

  const latestBrightnessRef = useRef(brightness);
  latestBrightnessRef.current = brightness;
  const latestVolumeRef = useRef(volume);
  latestVolumeRef.current = volume;

  const showHud = (type: 'brightness' | 'volume' | 'seek-back' | 'seek-forward') => {
    setHudType(type);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => { setHudType(null); }, 1200);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_e, gesture) => Math.abs(gesture.dy) > 4,
    onMoveShouldSetPanResponderCapture: (_e, gesture) => Math.abs(gesture.dy) > 4,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      const { locationX } = evt.nativeEvent;
      const cardWidth = Math.max(1, contentWidth - 40);
      touchSide.current = locationX < cardWidth / 2 ? 'left' : 'right';
      touchStartY.current = evt.nativeEvent.locationY;
      initialBrightnessRef.current = latestBrightnessRef.current;
      initialVolumeRef.current = latestVolumeRef.current;
    },
    onPanResponderMove: (_e, gesture) => {
      const deltaY = -gesture.dy; // swipe UP = positive
      const sensitivity = 160; // 160px for full scale
      if (touchSide.current === 'left') {
        const nextB = Math.max(0.05, Math.min(1.0, initialBrightnessRef.current + deltaY / sensitivity));
        setBrightness(nextB);
        void setNativeScreenBrightness(nextB);
        showHud('brightness');
      } else if (touchSide.current === 'right') {
        const nextV = Math.max(0.0, Math.min(1.0, initialVolumeRef.current + deltaY / sensitivity));
        setVolume(nextV);
        service.setVolume(nextV);
        void setNativeSystemVolume(nextV);
        showHud('volume');
      }
    },
    onPanResponderRelease: (evt, gesture) => {
      touchSide.current = null;
      if (Math.abs(gesture.dx) < 15 && Math.abs(gesture.dy) < 15) {
        const now = Date.now();
        const delta = now - lastTapRef.current;
        lastTapRef.current = now;
        if (delta < 320) {
          const { locationX } = evt.nativeEvent;
          const cardWidth = Math.max(1, contentWidth - 40);
          if (locationX < cardWidth / 2) {
            void service.seekRelative(-10);
            showHud('seek-back');
          } else {
            void service.seekRelative(10);
            showHud('seek-forward');
          }
        } else {
          setShowControls((prev) => {
            const next = !prev;
            if (next && state === PlaybackState.PLAYING) {
              if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
              controlsTimerRef.current = setTimeout(() => { setShowControls(false); }, 3500);
            }
            return next;
          });
        }
      }
    },
  }), [contentWidth, service, state]);

  const posterStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const playbackError = state === PlaybackState.ERROR ? error : null;

  // VLC HUD floating indicator overlay
  const vlcHudOverlay = hudType ? (
    <View pointerEvents="none" style={styles.hudOverlayContainer}>
      {hudType === 'brightness' && (
        <View style={[styles.hudPill, { alignSelf: 'flex-start', marginLeft: 24 }]}>
          <Sun size={24} color={colors.accent} />
          <View style={styles.hudBarTrack}>
            <View style={[styles.hudBarFill, { height: `${Math.round(brightness * 100)}%` }]} />
          </View>
          <Text style={styles.hudText}>{Math.round(brightness * 100)}%</Text>
        </View>
      )}
      {hudType === 'volume' && (
        <View style={[styles.hudPill, { alignSelf: 'flex-end', marginRight: 24 }]}>
          {volume === 0 ? <VolumeX size={24} color="#FF5555" /> : <Volume2 size={24} color={colors.accent} />}
          <View style={styles.hudBarTrack}>
            <View style={[styles.hudBarFill, { height: `${Math.round(volume * 100)}%` }]} />
          </View>
          <Text style={styles.hudText}>{Math.round(volume * 100)}%</Text>
        </View>
      )}
      {hudType === 'seek-back' && (
        <View style={styles.seekBadge}>
          <RotateCcw size={22} color={colors.accent} />
          <Text style={styles.seekText}>-10s</Text>
        </View>
      )}
      {hudType === 'seek-forward' && (
        <View style={styles.seekBadge}>
          <RotateCw size={22} color={colors.accent} />
          <Text style={styles.seekText}>+10s</Text>
        </View>
      )}
    </View>
  ) : null;

  // Dedicated canvas view holding ONLY VideoView and poster (never VideoTransport or Text/Button)
  const canvas = (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={engine.player}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        startsPictureInPictureAutomatically={false}
        contentFit="contain"
        style={StyleSheet.absoluteFill}
      />
      <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, posterStyle]}>
        {item?.poster && <Image source={item.poster} resizeMode="contain" fadeDuration={0} style={{ width: '100%', height: '100%' }} />}
      </Animated.View>
    </View>
  );

  const attribution = item?.source.kind === 'catalog' || item?.source.kind === 'https'
    ? item.source.attribution
    : item?.source.kind === 'local'
      ? (item.source.attribution ?? 'My files')
      : '';

  const audioPillLabel = audioTracks.length > 1
    ? (audioTracks[selectedAudioIndex]?.label || 'Dual Audio')
    : audioTracks.length === 1
      ? (audioTracks[0]?.label || 'Audio')
      : 'Audio';

  // Video player box with authentic in-player Kobra / VLC controls overlay
  const videoPlayer = (
    <View
      style={{
        height: fullscreen ? height : Math.max(220, Math.min((contentWidth - 40) * 9 / 16, height * 0.48)),
        backgroundColor: colors.mediaBackground,
        marginHorizontal: fullscreen ? 0 : 20,
        borderRadius: fullscreen ? 0 : 24,
        overflow: 'hidden',
        borderWidth: fullscreen ? 0 : 1,
        borderColor: colors.line,
        position: 'relative',
      }}
    >
      {canvas}

      {/* Touch gesture receiver for swipes and double-taps */}
      <View
        collapsable={false}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
        {...panResponder.panHandlers}
      />

      {/* In-player video controls overlay */}
      {showControls && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {/* Top overlay: Title & Fullscreen Three-Dot Menu (No duplicate speed or screen size icons) */}
          <View style={[styles.videoTopOverlay, { paddingTop: fullscreen ? Math.max(16, insets.top + 10) : 12 }]}>
            <View style={ui.grow}>
              <Text numberOfLines={1} style={styles.videoTopTitle} accessibilityRole="header">
                {item?.title ?? 'Video unavailable'}
              </Text>
              {attribution ? <Text numberOfLines={1} style={styles.videoTopSub}>{attribution}</Text> : null}
            </View>
            {fullscreen && (
              <View style={styles.topActionsRow}>
                <IconButton
                  icon={MoreVertical}
                  label="Video options"
                  onPress={() => setShowOptionsModal(true)}
                />
              </View>
            )}
          </View>

          {/* Center 3 liquid water glass morphic buttons */}
          <View pointerEvents="box-none" style={styles.videoCenterOverlay}>
            <VideoTransport service={service} />
          </View>

          {/* Bottom overlay: Scrubber + Controls row */}
          <View style={[styles.videoBottomOverlay, { paddingBottom: fullscreen ? Math.max(20, insets.bottom + 12) : 6 }]}>
            <View style={styles.timelineWrapper}>
              <VideoTimeline service={service} />
            </View>
            <View style={styles.bottomControlBar}>
              <View style={styles.bottomLeftGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={state === PlaybackState.PLAYING ? 'Pause' : 'Play'}
                  onPress={() => { void service.toggle(); }}
                  style={styles.bottomMiniBtn}
                >
                  <Text style={styles.bottomMiniPlayText}>{state === PlaybackState.PLAYING ? '❚❚' : '▶'}</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={volume === 0 ? 'Unmute' : 'Mute'}
                  onPress={() => {
                    const nextV = volume === 0 ? 0.8 : 0;
                    setVolume(nextV);
                    service.setVolume(nextV);
                    void setNativeSystemVolume(nextV);
                    showHud('volume');
                  }}
                  style={styles.bottomMiniBtn}
                >
                  {volume === 0 ? <VolumeX size={17} color="#FF5555" /> : <Volume2 size={17} color="#FFFFFF" />}
                </Pressable>

                <Text style={styles.bottomTimestamp}>
                  {formatVideoTime(position)} / {formatVideoTime(duration)}
                </Text>
              </View>

              <View style={styles.bottomRightGroup}>
                {/* In portrait, secondary controls reside in the bottom bar */}
                {!fullscreen && (
                  <>
                    {audioTracks.length > 1 && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Audio track and language"
                        onPress={() => setShowOptionsModal(true)}
                        style={[styles.bottomSpeedPill, styles.bottomAudioPill]}
                      >
                        <Languages size={12} color={colors.accent} />
                        <Text style={styles.bottomAudioPillText}>Dual Audio</Text>
                      </Pressable>
                    )}

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Playback speed: ${playbackSpeed}x`}
                      onPress={() => setShowSpeedModal(true)}
                      style={styles.bottomSpeedPill}
                    >
                      <Text style={styles.bottomSpeedPillText}>{playbackSpeed}x</Text>
                    </Pressable>
                  </>
                )}

                {/* Single authoritative Fullscreen Enter / Exit button */}
                <IconButton
                  icon={fullscreen ? Minimize : Maximize}
                  label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  disabled={!orientationAvailable && !fullscreen}
                  onPress={toggleFullscreen}
                />
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Floating VLC HUD Overlay */}
      {vlcHudOverlay}

      {/* Consolidated Options overlay for fullscreen Three-Dot menu (Audio & Language + Playback Speed) */}
      {showOptionsModal && (
        <View style={[StyleSheet.absoluteFill, styles.modalBackdrop, { zIndex: 10000 }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowOptionsModal(false)} />
          <View style={[styles.modalCard, fullscreen && styles.modalCardFullscreen]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Video Options</Text>
              <Pressable onPress={() => setShowOptionsModal(false)} hitSlop={12}>
                <X size={18} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 16 }} bounces={false} showsVerticalScrollIndicator={false}>
              {/* Section 1: Audio & Language */}
              <View style={styles.optionsSection}>
                <View style={styles.optionsSectionHeader}>
                  <Languages size={16} color={colors.accent} />
                  <Text style={styles.optionsSectionTitle}>Audio & Language</Text>
                </View>
                {audioTracks.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {audioTracks.map((tr) => {
                      const active = tr.index === selectedAudioIndex;
                      return (
                        <Pressable
                          key={tr.id || tr.index}
                          onPress={() => {
                            setSelectedAudioIndex(tr.index);
                            void switchVideoAudioTrack(tr.language, tr.index);
                            setShowOptionsModal(false);
                          }}
                          style={[styles.audioOptionRow, active && styles.audioOptionActive]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.audioOptionTitle, active && styles.audioOptionTitleActive]}>
                              {tr.label}
                            </Text>
                            <Text style={styles.audioOptionSubtitle}>
                              Language: {tr.language.toUpperCase()}
                            </Text>
                          </View>
                          {active && <Check size={18} color={colors.accent} />}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.audioOptionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.audioOptionTitle}>{audioPillLabel}</Text>
                      <Text style={styles.audioOptionSubtitle}>
                        Original stereo audio track. Multi-language tracks appear here for dual-audio videos.
                      </Text>
                    </View>
                    <Check size={18} color={colors.accent} />
                  </View>
                )}
              </View>

              {/* Section 2: Playback Speed */}
              <View style={styles.optionsSection}>
                <View style={styles.optionsSectionHeader}>
                  <Gauge size={16} color={colors.accent} />
                  <Text style={styles.optionsSectionTitle}>Playback Speed</Text>
                </View>
                <View style={styles.speedOptionsGrid}>
                  {PLAYBACK_SPEEDS.map((sp) => {
                    const active = playbackSpeed === sp;
                    return (
                      <Pressable
                        key={sp}
                        onPress={() => {
                          setPlaybackSpeed(sp);
                          service.setPlaybackRate(sp);
                          setShowOptionsModal(false);
                        }}
                        style={[styles.speedOptionButton, active && styles.speedOptionActive]}
                      >
                        <Text style={[styles.speedOptionText, active && styles.speedOptionTextActive]}>
                          {sp === 1.0 ? '1.0x (Normal)' : `${sp}x`}
                        </Text>
                        {active && <Check size={16} color={colors.accent} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );

  const content = (
    <>
      {videoPlayer}

      {playbackError && (
        <Text style={styles.status} accessibilityLiveRegion="polite">{playbackError}</Text>
      )}

      <View
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        style={styles.accessibleStatus}
        accessibilityLabel={
          state === PlaybackState.BUFFERING ? 'Buffering video'
          : state === PlaybackState.LOADING ? 'Loading video'
          : state === PlaybackState.PLAYING ? 'Video playing'
          : state === PlaybackState.STOPPED ? 'Video finished, Play to replay'
          : 'Video paused'
        }
      />

      {canRetryVideo(state, error, busy) && (
        <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
          <Button title="Try again" secondary onPress={() => { void service.retry(); }} />
        </View>
      )}

      {/* Downloaded videos carousel below the video player */}
      <VideoQueue items={items} session={session} />

      {/* Speed selection modal */}
      <Modal
        visible={showSpeedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSpeedModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSpeedModal(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Playback Speed</Text>
              <Pressable onPress={() => setShowSpeedModal(false)} hitSlop={8}>
                <X size={18} color={colors.muted} />
              </Pressable>
            </View>
            <View style={styles.speedOptionsGrid}>
              {PLAYBACK_SPEEDS.map((sp) => {
                const active = playbackSpeed === sp;
                return (
                  <Pressable
                    key={sp}
                    onPress={() => {
                      setPlaybackSpeed(sp);
                      service.setPlaybackRate(sp);
                      setShowSpeedModal(false);
                    }}
                    style={[styles.speedOptionButton, active && styles.speedOptionActive]}
                  >
                    <Text style={[styles.speedOptionText, active && styles.speedOptionTextActive]}>
                      {sp === 1.0 ? '1.0x (Normal)' : `${sp}x`}
                    </Text>
                    {active && <Check size={16} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Audio Track & Language selection modal */}
      <Modal
        visible={showAudioModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAudioModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAudioModal(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Audio Tracks & Language</Text>
              <Pressable onPress={() => setShowAudioModal(false)} hitSlop={8}>
                <X size={18} color={colors.muted} />
              </Pressable>
            </View>
            {audioTracks.length > 0 ? (
              <View style={{ gap: 8 }}>
                {audioTracks.map((tr) => {
                  const active = tr.index === selectedAudioIndex;
                  return (
                    <Pressable
                      key={tr.id || tr.index}
                      onPress={() => {
                        setSelectedAudioIndex(tr.index);
                        void switchVideoAudioTrack(tr.language, tr.index);
                        setShowAudioModal(false);
                      }}
                      style={[styles.audioOptionRow, active && styles.audioOptionActive]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.audioOptionTitle, active && styles.audioOptionTitleActive]}>
                          {tr.label}
                        </Text>
                        <Text style={styles.audioOptionSubtitle}>
                          Language: {tr.language.toUpperCase()}
                        </Text>
                      </View>
                      {active && <Check size={18} color={colors.accent} />}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={{ paddingVertical: 12 }}>
                <Text style={styles.audioOptionTitle}>{audioPillLabel}</Text>
                <Text style={[styles.audioOptionSubtitle, { marginTop: 4 }]}>
                  Original stereo audio track. Dual audio tracks will appear here when playing multi-language videos.
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );

  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setContentWidth((old) => old === next ? old : next);
      }}
      style={fullscreen ? { flex: 1, backgroundColor: colors.mediaBackground } : { gap: 4 }}
    >
      {fullscreen ? (
        <ScrollView scrollEnabled={false} contentContainerStyle={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : content}
    </View>
  );
}

function VideoQueue({ items, session }: { items: readonly VideoItem[]; session: Session }): React.JSX.Element | null {
  const index = useStore(session.service.state, (s) => s.index);
  const busy = useStore(session.service.state, (s) => s.busy);
  const state = useStore(session.service.state, (s) => s.playbackState);
  const reduced = usePlayerStore((s) => s.isReducedMotion);

  if (items.length < 1) return null;

  return (
    <View style={{ marginTop: 24 }}>
      <View style={styles.queueHeader}>
        <Text style={[ui.sectionTitle, { paddingHorizontal: 20 }]} accessibilityRole="header">Downloaded videos</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{items.length} {items.length === 1 ? 'video' : 'videos'}</Text>
        </View>
      </View>
      <VideoPosterCarousel
        items={items}
        index={index}
        reduced={reduced}
        disabled={busy}
        select={(selected) => {
          void session.service.select(selected, state === PlaybackState.PLAYING);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { margin: 20, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8 },
  topActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  videoTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  videoTopTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  videoTopSub: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  videoCenterOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoBottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 6,
    paddingTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  timelineWrapper: {
    width: '100%',
    marginBottom: -12,
  },
  bottomControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 4,
  },
  bottomLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bottomMiniBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomMiniPlayText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  bottomTimestamp: {
    color: '#E0E0E6',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  bottomRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomSpeedPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  bottomSpeedPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomAudioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(233, 255, 96, 0.12)',
    borderColor: colors.accent,
    borderWidth: 1,
  },
  bottomAudioPillText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E1E28',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#343444',
  },
  pillButtonActive: {
    backgroundColor: 'rgba(233, 255, 96, 0.12)',
    borderColor: colors.accent,
  },
  pillText: {
    color: '#E0E0E6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pillTextActive: {
    color: colors.accent,
  },
  controls: { marginHorizontal: 20, marginTop: 8, paddingTop: 8 },
  resolutionBadge: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  accessibleStatus: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  status: { color: colors.muted, textAlign: 'center', fontSize: 12, paddingHorizontal: 20, paddingVertical: 12 },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
    marginBottom: 4,
  },
  countBadge: {
    backgroundColor: colors.raised,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  countText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hudOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudPill: {
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 20, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    width: 48,
    gap: 8,
  },
  hudBarTrack: {
    width: 6,
    height: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  hudBarFill: {
    width: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  hudText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  seekBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10, 10, 20, 0.85)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(233, 255, 96, 0.4)',
  },
  seekText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#12121E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2D2D3D',
    gap: 16,
  },
  modalCardFullscreen: {
    maxHeight: '90%',
    maxWidth: 540,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 24,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  optionsSection: {
    gap: 10,
  },
  optionsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  optionsSectionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  speedOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  speedOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C2A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    width: '48%',
    borderWidth: 1,
    borderColor: '#303042',
  },
  speedOptionActive: {
    backgroundColor: 'rgba(233, 255, 96, 0.14)',
    borderColor: colors.accent,
  },
  speedOptionText: {
    color: '#E0E0E6',
    fontSize: 13,
    fontWeight: '600',
  },
  speedOptionTextActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  audioOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C2A',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303042',
  },
  audioOptionActive: {
    backgroundColor: 'rgba(233, 255, 96, 0.12)',
    borderColor: colors.accent,
  },
  audioOptionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  audioOptionTitleActive: {
    color: colors.accent,
  },
  audioOptionSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
});
