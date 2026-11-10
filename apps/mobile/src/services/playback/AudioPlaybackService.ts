import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  PlaybackProgressUpdatedEvent,
  RepeatMode,
  State,
} from 'react-native-track-player';
import { PlaybackState } from '@aadat/contracts';
import {
  ErrorListener,
  IAudioPlaybackService,
  IPlaybackProgress,
  ProgressListener,
  RepeatChangeListener,
  RepeatCycleMode,
  StateChangeListener,
  TrackChangeListener,
} from './types';
import type { IPlayableTrack } from '../../data/sample-tracks';
import { mediaPlaybackCoordinator } from './MediaPlaybackCoordinator';
import { resolveCatalogTracks } from '../../catalog/catalog-runtime';

function mapNativeStateToDomain(state: State): PlaybackState {
  switch (state) {
    case State.Playing: return PlaybackState.PLAYING;
    case State.Paused: return PlaybackState.PAUSED;
    case State.Buffering: return PlaybackState.BUFFERING;
    case State.Loading: return PlaybackState.LOADING;
    case State.Stopped:
    case State.Ended: return PlaybackState.STOPPED;
    case State.Error: return PlaybackState.ERROR;
    default: return PlaybackState.IDLE;
  }
}

type Selection = { index: number; restart: boolean; position?: number };
interface SelectionOptions {
  allowEmpty?: boolean;
  debounce?: boolean;
  force?: boolean;
  rethrow?: boolean;
  valid?: () => boolean;
  automatic?: boolean;
}

/** Shared authority for screen, notification and interruption commands. */
export class AudioPlaybackService implements IAudioPlaybackService {
  private static instance: AudioPlaybackService | null = null;
  private isInitialized = false;
  private isPlayerSetup = false;
  private currentState = PlaybackState.IDLE;
  private tracks: readonly IPlayableTrack[] = [];
  private currentTrackIndex = 0;
  private progress: IPlaybackProgress = { position: 0, duration: 0, buffered: 0 };
  private pendingOperation: Promise<void> = Promise.resolve();
  private isExecuting = false;
  private commandVersion = 0;
  private needsSourceRefresh = false;
  private wantsPlayback = false;
  private hasPlaybackIntent = false;
  private transportVersion = 0;
  private stopRequested = false;
  private selectionVersion = 0;
  private selectionGestureRevision = 0;
  private selectionPending = false;
  private selectionTask: Promise<void> = Promise.resolve();
  private desiredTracks: readonly IPlayableTrack[] = [];
  private desiredSelection: Promise<Selection> = Promise.resolve({ index: 0, restart: false });
  private syncTask: Promise<void> | null = null;
  private syncRequested = false;
  private publishedTracks: readonly IPlayableTrack[] | null = null;
  private publishedIndex = -1;
  private selectionError: Error | null = null;
  private readonly recovered = new Set<string>();
  private sourceResolver = resolveCatalogTracks;
  private subscriptions: Array<{ remove(): void }> = [];

  private readonly stateListeners = new Set<StateChangeListener>();
  private readonly trackListeners = new Set<TrackChangeListener>();
  private readonly errorListeners = new Set<ErrorListener>();
  private readonly progressListeners = new Set<ProgressListener>();
  private readonly repeatListeners = new Set<RepeatChangeListener>();
  private repeatMode: RepeatCycleMode = 'off';
  private repeatCountRemaining = 0;
  private lastLoopDetectionTime = 0;
  private lastObservedPosition = 0;

  private constructor() {}

  public static getInstance(): AudioPlaybackService {
    if (!AudioPlaybackService.instance) {
      AudioPlaybackService.instance = new AudioPlaybackService();
    }
    return AudioPlaybackService.instance;
  }

  /** Explicit cached queue injection before startup; never invents a default catalog. */
  public configureInitialQueue(tracks: readonly IPlayableTrack[]): void {
    if (this.isInitialized) throw new Error('Initial queue must be configured before player startup');
    this.tracks = [...tracks];
    this.desiredTracks = this.tracks;
  }

  /** Repeated screen mounts adopt the native queue without resetting playback. */
  public initialize(): Promise<void> {
    return this.perform(async () => { if (this.tracks.length) await this.ensureQueue(); else if ((await TrackPlayer.getQueue()).length) await TrackPlayer.reset(); }, true);
  }

  public loadQueue(tracks: readonly IPlayableTrack[], startIndex = 0): Promise<void> {
    return this.selectQueue(tracks, startIndex, false);
  }

  /** Queue and autoplay are one intent, so an older request cannot resume after Pause. */
  public playQueue(tracks: readonly IPlayableTrack[], startIndex = 0): Promise<void> {
    return this.selectQueue(tracks, startIndex, true);
  }

  public getTracks(): readonly IPlayableTrack[] { return this.tracks; }
  public selectionGeneration(): number { return this.selectionGestureRevision; }

  private selectQueue(tracks: readonly IPlayableTrack[], startIndex: number, play: boolean): Promise<void> {
    if (play && !tracks.length) return this.noTracks();
    this.transportVersion++; this.hasPlaybackIntent = true; this.wantsPlayback = play; this.stopRequested = false; this.recovered.clear();
    const index = tracks.length && Number.isFinite(startIndex)
      ? Math.max(0, Math.min(Math.trunc(startIndex), tracks.length - 1)) : 0;
    return this.select(tracks, Promise.resolve({ index, restart: false }), { debounce: play, rethrow: true, allowEmpty: !play });
  }

  public play(): Promise<void> {
    if (!(this.selectionPending ? this.desiredTracks : this.tracks).length) return this.noTracks();
    this.transportVersion++; this.hasPlaybackIntent = true; this.wantsPlayback = true; this.stopRequested = false; this.recovered.clear();
    return this.select(this.selectionPending ? this.desiredTracks : this.tracks, this.target(), { force: this.needsSourceRefresh });
  }

  public pause(): Promise<void> {
    this.commandVersion++;
    const version = ++this.transportVersion;
    this.hasPlaybackIntent = true;
    this.selectionError = null;
    this.wantsPlayback = false;
    this.stopRequested = false;
    return this.perform(() => TrackPlayer.pause(), false, () => version === this.transportVersion);
  }

  /** Stop unloads playback, while retaining the queue and selected track. */
  public stop(): Promise<void> {
    this.commandVersion++;
    const version = ++this.transportVersion;
    this.hasPlaybackIntent = true;
    this.selectionError = null;
    this.wantsPlayback = false;
    this.stopRequested = true;
    return this.perform(async () => {
      await TrackPlayer.stop();
    }, false, () => version === this.transportVersion);
  }

  public togglePlayPause(): Promise<void> {
    if (!this.hasPlaybackIntent) {
      const version = ++this.transportVersion;
      this.hasPlaybackIntent = true;
      this.wantsPlayback = this.currentState !== PlaybackState.PLAYING;
      return (this.isInitialized ? Promise.resolve() : this.initialize()).then(() => TrackPlayer.getPlaybackState()).then(({ state }) => {
        if (version !== this.transportVersion) return;
        return state === State.Playing || state === State.Buffering || state === State.Loading ? this.pause() : this.play();
      });
    }
    // Loading/buffering is still a play intent; a second tap means Pause.
    const pause = this.wantsPlayback && (this.selectionPending || ![PlaybackState.STOPPED, PlaybackState.ERROR].includes(this.currentState));
    return pause ? this.pause() : this.play();
  }

  public seekTo(positionSeconds: number): Promise<void> {
    this.commandVersion++;
    const version = this.selectionVersion, pending = this.selectionTask;
    return pending.catch(() => {}).then(() => this.perform(async () => {
      if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
        throw new Error('Seek position must be a finite, non-negative number');
      }
      await this.ensureQueue();
      await TrackPlayer.seekTo(positionSeconds);
    }, false, () => version === this.selectionVersion));
  }

  public skipToNext(): Promise<void> {
    this.resetRepeatForNewTrack();
    const tracks = this.selectionPending ? this.desiredTracks : this.tracks;
    if (!tracks.length) return this.noTracks();
    const target = this.target().then(({ index }) => ({ index: (index + 1) % tracks.length, restart: true }));
    return this.select(tracks, target, { debounce: true });
  }

  public skipToPrevious(): Promise<void> {
    this.resetRepeatForNewTrack();
    const tracks = this.selectionPending ? this.desiredTracks : this.tracks;
    if (!tracks.length) return this.noTracks();
    const position = !this.selectionPending && this.isPlayerSetup ? TrackPlayer.getProgress().then(p => p.position) : Promise.resolve(0);
    const target = Promise.all([this.target(), position]).then(([{ index }, seconds]) => ({
      index: seconds > 3 ? index : (index - 1 + tracks.length) % tracks.length, restart: true,
    }));
    return this.select(tracks, target, { debounce: true });
  }

  public skipToIndex(index: number): Promise<void> {
    this.resetRepeatForNewTrack();
    const tracks = this.selectionPending ? this.desiredTracks : this.tracks;
    if (!tracks.length) return this.noTracks();
    if (!Number.isInteger(index) || index < 0 || index >= tracks.length) {
      return this.perform(async () => { throw new Error('Track index is outside the playback queue'); });
    }
    return this.select(tracks, Promise.resolve({ index, restart: false }), { debounce: true });
  }

  private resetRepeatForNewTrack(): void {
    if (this.repeatMode !== 'off') {
      this.repeatCountRemaining = this.repeatMode === '1' ? 1 : this.repeatMode === '2' ? 2 : Infinity;
      try {
        if (this.isPlayerSetup) void TrackPlayer.setRepeatMode(RepeatMode.Track);
      } catch {}
      this.notifyRepeatChange();
    }
  }

  private noTracks(): Promise<void> {
    this.commandVersion++;
    // Invalid notification input must never cancel a pending account/queue clear.
    return this.perform(async () => { throw new Error('No tracks are available for playback'); });
  }

  public getPlaybackState(): PlaybackState {
    return this.currentState;
  }

  public onStateChange(listener: StateChangeListener): () => void {
    this.stateListeners.add(listener);
    listener(this.currentState);
    return () => { this.stateListeners.delete(listener); };
  }

  public onTrackChange(listener: TrackChangeListener): () => void {
    this.trackListeners.add(listener);
    listener(this.currentTrackIndex);
    return () => { this.trackListeners.delete(listener); };
  }

  public onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    listener(this.progress);
    return () => { this.progressListeners.delete(listener); };
  }

  public onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => { this.errorListeners.delete(listener); };
  }

  public getRepeatMode(): RepeatCycleMode {
    return this.repeatMode;
  }

  public getRepeatCountRemaining(): number {
    return this.repeatCountRemaining;
  }

  public onRepeatChange(listener: RepeatChangeListener): () => void {
    this.repeatListeners.add(listener);
    listener(this.repeatMode, this.repeatCountRemaining);
    return () => { this.repeatListeners.delete(listener); };
  }

  public async setRepeatCycleMode(mode: RepeatCycleMode): Promise<void> {
    this.repeatMode = mode;
    if (mode === '1') {
      this.repeatCountRemaining = 1;
    } else if (mode === '2') {
      this.repeatCountRemaining = 2;
    } else if (mode === 'infinite') {
      this.repeatCountRemaining = Infinity;
    } else {
      this.repeatCountRemaining = 0;
    }
    try {
      if (this.isPlayerSetup) {
        await TrackPlayer.setRepeatMode(mode === 'off' ? RepeatMode.Off : RepeatMode.Track);
      }
    } catch {
      // non-fatal
    }
    this.notifyRepeatChange();
  }

  public async toggleRepeatCycle(): Promise<RepeatCycleMode> {
    const cycle: RepeatCycleMode[] = ['off', '1', '2', 'infinite'];
    const currentIndex = cycle.indexOf(this.repeatMode);
    const nextMode = cycle[(currentIndex + 1) % cycle.length] ?? 'off';
    await this.setRepeatCycleMode(nextMode);
    return nextMode;
  }

  private notifyRepeatChange(): void {
    for (const listener of this.repeatListeners) {
      try {
        listener(this.repeatMode, this.repeatCountRemaining);
      } catch (error) {
        console.error('[AudioPlaybackService] Repeat listener error:', error);
      }
    }
  }

  public async handleTrackLooped(): Promise<void> {
    const now = Date.now();
    if (now - this.lastLoopDetectionTime < 2500) {
      return;
    }
    this.lastLoopDetectionTime = now;

    if (this.repeatMode === 'off') return;

    if (this.repeatMode === 'infinite') {
      return;
    }

    if (this.repeatCountRemaining > 1) {
      this.repeatCountRemaining -= 1;
      this.notifyRepeatChange();
    } else if (this.repeatCountRemaining === 1) {
      this.repeatCountRemaining = 0;
      this.repeatMode = 'off';
      try {
        await TrackPlayer.setRepeatMode(RepeatMode.Off);
      } catch {}
      this.notifyRepeatChange();
    }
  }

  public destroy(): Promise<void> {
    this.commandVersion++;
    this.selectionVersion++; this.transportVersion++; this.selectionPending = false;
    this.syncRequested = false;
    this.wantsPlayback = false;
    return this.serialize(async () => {
      if (this.isPlayerSetup) await TrackPlayer.reset();
      this.subscriptions.forEach((subscription) => subscription.remove());
      this.subscriptions = [];
      this.isInitialized = false;
      this.currentState = PlaybackState.IDLE;
      this.progress = { position: 0, duration: 0, buffered: 0 };
      this.publishedTracks = null; this.publishedIndex = -1;
      this.selectionError = null;
      this.stateListeners.clear();
      this.trackListeners.clear();
      this.progressListeners.clear();
      this.errorListeners.clear();
      this.repeatListeners.clear();
      this.repeatMode = 'off';
      this.repeatCountRemaining = 0;
    });
  }

  /** Queue mutations and transport commands must never overlap. */
  private serialize(operation: () => Promise<void>): Promise<void> {
    const result = this.pendingOperation.then(async () => {
      this.isExecuting = true;
      try {
        await operation();
      } finally {
        this.isExecuting = false;
        if (this.syncRequested && !this.selectionPending && !this.syncTask) void this.reconcile();
      }
    });
    // A failed command must not poison later recovery attempts.
    this.pendingOperation = result.catch(() => {});
    return result;
  }

  private perform(operation: () => Promise<void>, rethrow = false, current: () => boolean = () => true, selectionCommit = false): Promise<void> {
    return this.serialize(async () => {
      try {
        if (!current()) return;
        await this.initializeNative();
        if (!current()) return;
        await operation();
        if (current()) await this.synchronizeNative(current, selectionCommit || !this.selectionPending);
      } catch (error) {
        if (!current()) return;
        this.updateState(PlaybackState.ERROR);
        this.notify(this.errorListeners, this.publicError(error));
        if (rethrow) throw error;
      }
    });
  }
  private withAudioAuthority(operation: () => Promise<void>, current: () => boolean = () => true): Promise<void> {
    if (!current()) return Promise.resolve();
    const ownership = mediaPlaybackCoordinator.intentVersion + 1;
    return mediaPlaybackCoordinator.audio(operation, () => current() && mediaPlaybackCoordinator.intentVersion === ownership).catch((error: unknown) => {
      if (!current()) return;
      this.updateState(PlaybackState.ERROR);
      this.notify(this.errorListeners, this.publicError(error));
    });
  }

  private async initializeNative(): Promise<void> {
    if (this.isInitialized) return;
    if (!this.isPlayerSetup) {
      try {
        await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
      } catch (error) {
        // A headless JS service may attach to an already running native player.
        if ((error as { code?: string } | null)?.code !== 'player_already_initialized') {
          throw error;
        }
      }
      this.isPlayerSetup = true;
    }
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext,
        Capability.SkipToPrevious, Capability.SeekTo, Capability.Stop],
      compactCapabilities: [Capability.SkipToPrevious, Capability.Play,
        Capability.Pause, Capability.SkipToNext],
      progressUpdateEventInterval: 1,
    });
    this.registerEventListeners();
    try {
      await TrackPlayer.setRepeatMode(this.repeatMode === 'off' ? RepeatMode.Off : RepeatMode.Track);
    } catch {}
    this.isInitialized = true;
  }

  private async ensureQueue(): Promise<void> {
    if (this.tracks.length === 0) throw new Error('No tracks are available for playback');
    const queue = await TrackPlayer.getQueue();
    const matches = queue.length === this.tracks.length && queue.every((track, index) =>
      track.id === this.tracks[index]?.id && track.url === this.tracks[index]?.url
    );
    const index = await TrackPlayer.getActiveTrackIndex();
    if (matches && index !== undefined && index >= 0 && index < queue.length) {
      this.currentTrackIndex = index;
      return;
    }

    // Preserve the intended selection: add/reset can emit a temporary index 0.
    const restoreIndex = Math.max(0, Math.min(this.currentTrackIndex, this.tracks.length - 1));
    if (!matches) {
      if (queue.length > 0) await TrackPlayer.reset();
      await TrackPlayer.add([...this.tracks]);
    }
    await TrackPlayer.skip(restoreIndex);
  }

  /** Native source preparation is outside the mutation lock: Pause never waits for HTTP. */
  private target(): Promise<Selection> {
    if (this.selectionPending) return this.desiredSelection;
    if (!this.isPlayerSetup) return Promise.resolve({ index: this.currentTrackIndex, restart: false });
    return TrackPlayer.getActiveTrackIndex().then(index => ({ index: index ?? this.currentTrackIndex, restart: false }));
  }

  private select(tracks: readonly IPlayableTrack[], target: Promise<Selection>, {
    debounce = false, force = false, rethrow = false, valid = () => true, automatic = false, allowEmpty = false,
  }: SelectionOptions = {}): Promise<void> {
    if (!automatic) this.commandVersion++;
    this.selectionError = null;
    const version = ++this.selectionVersion, ownership = mediaPlaybackCoordinator.intentVersion;
    this.selectionGestureRevision++;
    const current = () => version === this.selectionVersion && valid();
    const requested = [...tracks];
    this.desiredTracks = requested; this.desiredSelection = target; this.selectionPending = true;
    const task = (async () => {
      if (debounce) await new Promise<void>(resolve => setTimeout(resolve, 70));
      else await Promise.resolve();
      if (!current()) return;
      const selection = await target;
      if (!current()) return;
      if (!requested.length) {
        if (!allowEmpty) throw new Error('No tracks are available for playback');
        await this.perform(async () => { this.tracks = []; this.currentTrackIndex = 0; await TrackPlayer.reset(); }, rethrow, current, true);
        return;
      }
      if (!Number.isInteger(selection.index) || selection.index < 0 || selection.index >= requested.length) throw new Error('Track index is outside the playback queue');
      const resolved = await this.sourceResolver(requested, force);
      if (!current()) return;
      if (resolved.length !== requested.length || resolved.some((track, i) => track.id !== requested[i]?.id || !track.url)) throw new Error('These tracks have no authorized playable sources.');
      const apply = () => this.perform(async () => {
        await this.applySources(resolved, selection, current);
        if (!current()) return;
        this.needsSourceRefresh = false;
        const state = await TrackPlayer.getPlaybackState();
        if (!current()) return;
        if (this.wantsPlayback && mediaPlaybackCoordinator.owner !== 'video') {
          if (state.state === State.Stopped || state.state === State.Error) await TrackPlayer.retry();
          if (!current() || !this.wantsPlayback) return;
          await TrackPlayer.play();
          if (!this.wantsPlayback) await TrackPlayer.pause();
        } else if (this.stopRequested) await TrackPlayer.stop();
        else if ([State.Playing, State.Buffering, State.Loading].includes(state.state)) await TrackPlayer.pause();
      }, rethrow, current, true);
      // An explicit newer video request must win even while its media is still loading.
      if (automatic && ownership !== mediaPlaybackCoordinator.intentVersion) return;
      if (this.wantsPlayback && ownership === mediaPlaybackCoordinator.intentVersion) {
        await this.withAudioAuthority(apply, current);
      } else {
        // Queue preparation is allowed while paused/video owns audio, autoplay is not.
        await this.perform(async () => {
          await TrackPlayer.pause();
          if (current()) await this.applySources(resolved, selection, current);
          if (current() && this.stopRequested) await TrackPlayer.stop();
          else if (current()) await TrackPlayer.pause();
        }, rethrow, current, true);
      }
    })().catch((error: unknown) => {
      if (!current()) return;
      this.selectionError = this.publicError(error);
      this.updateState(PlaybackState.ERROR); this.notify(this.errorListeners, this.selectionError);
      if (rethrow) throw error;
    }).finally(() => {
      if (version === this.selectionVersion) {
        this.selectionPending = false;
        if (this.syncRequested) void this.reconcile();
      }
    });
    this.selectionTask = task;
    return task;
  }

  private async applySources(resolved: readonly IPlayableTrack[], selection: Selection, current: () => boolean): Promise<void> {
    const queue = await TrackPlayer.getQueue(), active = await TrackPlayer.getActiveTrackIndex();
    if (!current()) return;
    const same = queue.length === resolved.length && queue.every((track, i) => track.id === resolved[i]?.id);
    const selected = same && active === selection.index;
    const changed = !same || queue.some((track, i) => track.url !== resolved[i]?.url);
    const position = selected && !selection.restart ? selection.position ?? (await TrackPlayer.getProgress()).position : 0;
    if (!current()) return;
    // Do not let the native playWhenReady flag briefly autoplay a paused selection.
    if (!this.wantsPlayback || changed) await TrackPlayer.pause();
    if (!current()) return;
    if (changed) {
      if (queue.length) await TrackPlayer.reset();
      if (!current()) return;
      await TrackPlayer.add([...resolved]);
    }
    if (!current()) return;
    const index = await TrackPlayer.getActiveTrackIndex();
    if (!current()) return;
    if (index !== selection.index) await TrackPlayer.skip(selection.index);
    if (!current()) return;
    if (selection.restart) await TrackPlayer.seekTo(0);
    else if (changed && selected && position > 0) await TrackPlayer.seekTo(position);
    if (!current()) return;
    if (this.currentTrackIndex !== selection.index || this.tracks.length !== resolved.length || this.tracks.some((track, i) => track.id !== resolved[i]?.id)) this.selectionGestureRevision++;
    this.tracks = resolved; this.currentTrackIndex = selection.index;
  }

  /** Injectable for native-contract tests; production uses ID-based catalog leases. */
  public configureSourceResolver(resolver: typeof resolveCatalogTracks): void { this.sourceResolver = resolver; }
  public commandGeneration(): number { return this.commandVersion; }
  private recoverExpiredSource(): void {
    const track = this.tracks[this.currentTrackIndex];
    if (!this.wantsPlayback || track?.catalogSource !== 'catalog' || this.recovered.has(track.id) || mediaPlaybackCoordinator.owner === 'video') return;
    this.recovered.add(track.id);
    const version = this.commandVersion;
    void this.select(this.tracks, Promise.resolve({ index: this.currentTrackIndex, restart: false, position: this.progress.position }), {
      force: true, automatic: true, valid: () => version === this.commandVersion && this.wantsPlayback,
    });
  }

  private async synchronizeNative(current: () => boolean = () => true, publishSelection = !this.selectionPending): Promise<void> {
    const index = await TrackPlayer.getActiveTrackIndex();
    const progress = index === undefined ? { position: 0, duration: 0, buffered: 0 } : await TrackPlayer.getProgress();
    const state = await TrackPlayer.getPlaybackState();
    if (!current()) return;
    if (index !== await TrackPlayer.getActiveTrackIndex()) { this.syncRequested = true; return; }
    if (!current()) return;
    if (!this.hasPlaybackIntent) this.wantsPlayback = state.state === State.Playing || state.state === State.Buffering;
    if (publishSelection && index !== undefined && index >= 0 && index < this.tracks.length) {
      this.currentTrackIndex = index;
      if (this.publishedIndex !== index || this.publishedTracks !== this.tracks) {
        this.publishedIndex = index; this.publishedTracks = this.tracks;
        this.notify(this.trackListeners, index);
      }
    } else if (publishSelection && !this.tracks.length && this.publishedTracks !== this.tracks) {
      this.publishedTracks = this.tracks; this.publishedIndex = 0;
      this.notify(this.trackListeners, 0);
    }
    if (publishSelection) this.updateProgress(progress);
    this.updateState(this.selectionError ? PlaybackState.ERROR : mapNativeStateToDomain(state.state));
    if (publishSelection && state.state === State.Error) {
      this.needsSourceRefresh = true;
      this.notify(this.errorListeners, this.publicError(state.error.message));
      if (/403|410|expired|signature/i.test(`${state.error.code} ${state.error.message}`)) this.recoverExpiredSource();
    }
  }

  private reconcile(): Promise<void> {
    if (!this.isInitialized) { this.syncRequested = false; return Promise.resolve(); }
    this.syncRequested = true;
    if (this.isExecuting || this.selectionPending) return Promise.resolve();
    if (this.syncTask) return this.syncTask;
    this.syncRequested = false;
    const version = this.commandVersion;
    const task = this.perform(async () => {}, false, () => version === this.commandVersion && !this.selectionPending)
      .finally(() => {
        if (this.syncTask === task) this.syncTask = null;
        if (this.syncRequested && !this.selectionPending) void this.reconcile();
      });
    this.syncTask = task;
    return task;
  }

  private registerEventListeners(): void {
    if (this.subscriptions.length > 0) return;
    this.subscriptions = [
      TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
        if (!this.hasPlaybackIntent && !this.isExecuting && !this.selectionPending) {
          this.wantsPlayback = event.state === State.Playing || event.state === State.Buffering;
        }
        if (event.state === State.Ended && this.repeatMode !== 'off' && this.repeatCountRemaining > 0) {
          void (async () => {
            await this.handleTrackLooped();
            await TrackPlayer.seekTo(0);
            await TrackPlayer.play();
          })();
        }
        return this.reconcile();
      }),
      TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event: any) => {
        if (
          this.repeatMode !== 'off' &&
          event &&
          ((event.index !== undefined && event.index === this.currentTrackIndex && event.lastIndex === this.currentTrackIndex) ||
           (event.lastPosition !== undefined && event.lastPosition > 3 && event.index === this.currentTrackIndex))
        ) {
          void this.handleTrackLooped();
        }
        return this.reconcile();
      }),
      TrackPlayer.addEventListener(Event.PlaybackProgressUpdated,
        (event: PlaybackProgressUpdatedEvent) => {
          if (this.repeatMode !== 'off' && event.track === this.currentTrackIndex) {
            const duration = this.progress.duration;
            if (this.lastObservedPosition > Math.max(5, duration - 3) && event.position < 2) {
              void this.handleTrackLooped();
            }
            this.lastObservedPosition = event.position;
          }
          if (!this.isExecuting && !this.selectionPending && event.track === this.currentTrackIndex) {
            this.updateProgress(event);
          } else if (event.track === this.currentTrackIndex) {
            this.syncRequested = true;
          }
        }),
      TrackPlayer.addEventListener(Event.PlaybackError, () => this.reconcile()),
      ...(Event.PlaybackQueueEnded
        ? [
            TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
              if (this.repeatMode !== 'off' && this.repeatCountRemaining > 0) {
                void (async () => {
                  await this.handleTrackLooped();
                  await TrackPlayer.seekTo(0);
                  await TrackPlayer.play();
                })();
              }
            }),
          ]
        : []),
    ];
  }

  private updateState(state: PlaybackState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.notify(this.stateListeners, state);
  }
  private publicError(error: unknown): Error {
    return new Error((error instanceof Error ? error.message : String(error)).replace(/https?:\/\/\S+/g, '[media source]'));
  }

  private updateProgress(progress: IPlaybackProgress): void {
    this.progress = { position: progress.position, duration: progress.duration, buffered: progress.buffered };
    this.notify(this.progressListeners, this.progress);
  }

  private notify<T>(listeners: Set<(value: T) => void>, value: T): void {
    for (const listener of listeners) {
      try { listener(value); } catch (error) {
        console.error('[AudioPlaybackService] Listener error:', error);
      }
    }
  }
}
