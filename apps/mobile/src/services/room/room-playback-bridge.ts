import {
  PlaybackState,
  PlaybackSyncPayload,
  SYNC_DRIFT_HARD_SEEK_THRESHOLD_SEC,
  SYNC_DRIFT_TOLERANCE_THRESHOLD_SEC,
  TrackDto,
  RoomDto,
  RoomQueueItemDto,
} from '@aadat/contracts';
import { AudioPlaybackService } from '../playback/AudioPlaybackService';
import { IAudioPlaybackService } from '../playback/types';
import { IPlayableTrack, SAMPLE_TRACKS } from '../../data/sample-tracks';
import { demoCatalog } from '../../catalog/demo-catalog';
import { catalogClient } from '../../catalog/catalog-runtime';
import { RoomSocketClient } from './room-socket.client';
import { useRoomStore } from '../../store/useRoomStore';
import { usePlayerStore } from '../../store/usePlayerStore';

function knownTrack(id: string): IPlayableTrack | undefined {
  return demoCatalog.get(id) ?? SAMPLE_TRACKS.find(track => track.id === id);
}

export function mapTrackDtoToPlayable(track: TrackDto): IPlayableTrack {
  const known = knownTrack(track.id);
  return {
    id: track.id,
    url: track.audioPlaybackUrl ?? known?.url ?? '',
    title: track.title,
    artist: track.artistName,
    artwork: track.artworkUrl ?? known?.artwork ?? '',
    duration: track.durationSeconds || known?.duration || 0,
    album: track.albumName ?? undefined,
    // SoundHelix demos are streams; only bundled assets use the local resolver.
    catalogSource: known?.catalogSource ?? (track.audioPlaybackUrl || SAMPLE_TRACKS.some(t => t.id === track.id) ? undefined : 'catalog'),
  };
}

export class RoomPlaybackBridge {
  private static instance: RoomPlaybackBridge | null = null;
  private readonly audioService: IAudioPlaybackService;
  private readonly getCurrentPosition: () => number;
  private socketClient: RoomSocketClient | null = null;
  private currentUserId: string | null = null;
  private currentRoomId: string | null = null;
  private currentTrackId: string | null = null;
  private lastProcessedServerTimestamp = 0;
  private isAttached = false;
  private pendingSync: Promise<void> = Promise.resolve();
  private commandRevision = 0;

  private async resolveTrack(trackId: string, queue = useRoomStore.getState().queue): Promise<IPlayableTrack> {
    const queued = queue.find(item => item.trackId === trackId);
    if (queued) return mapTrackDtoToPlayable(queued.track);
    const roomTrack = useRoomStore.getState().currentRoom?.currentTrack;
    if (roomTrack?.id === trackId) return mapTrackDtoToPlayable(roomTrack);
    const known = knownTrack(trackId);
    if (known) return known;
    await catalogClient.restore([trackId]);
    const restored = knownTrack(trackId);
    if (!restored) throw new Error('This room song is unavailable. Search for another song.');
    return restored;
  }

  private synchronize(operation: () => Promise<void>): Promise<void> {
    const result = this.pendingSync.then(operation);
    this.pendingSync = result.catch(() => {});
    return result;
  }

  private canControl(roomId: string): boolean {
    const state = useRoomStore.getState();
    return this.isAttached && state.isRoomActive && state.currentRoom?.id === roomId && state.isController;
  }

  public constructor(
    audioService: IAudioPlaybackService = AudioPlaybackService.getInstance(),
    getCurrentPosition: () => number = () => usePlayerStore.getState().position
  ) {
    this.audioService = audioService;
    this.getCurrentPosition = getCurrentPosition;
  }

  public static getInstance(): RoomPlaybackBridge {
    if (!RoomPlaybackBridge.instance) {
      RoomPlaybackBridge.instance = new RoomPlaybackBridge();
    }
    return RoomPlaybackBridge.instance;
  }

  /**
   * Binds the bridge to an active room socket client and user session.
   */
  public attach(socketClient: RoomSocketClient, userId: string): void {
    this.socketClient = socketClient;
    this.currentUserId = userId;
    this.isAttached = true;
  }

  public detach(): void {
    ++this.commandRevision;
    this.socketClient = null;
    this.currentUserId = null;
    this.currentRoomId = null;
    this.currentTrackId = null;
    this.lastProcessedServerTimestamp = 0;
    this.isAttached = false;
  }

  /**
   * Synchronizes room session on join or snapshot.
   */
  public onRoomJoined(payload: { room: RoomDto; currentPlayback: PlaybackSyncPayload | null; queue: RoomQueueItemDto[] }): Promise<void> {
    return this.synchronize(() => this.applyRoomJoined(payload));
  }

  private async applyRoomJoined(payload: {
    room: RoomDto;
    currentPlayback: PlaybackSyncPayload | null;
    queue: RoomQueueItemDto[];
  }): Promise<void> {
    this.currentRoomId = payload.room.id;
    this.lastProcessedServerTimestamp = payload.currentPlayback?.serverTimestamp ?? Date.now();

    const targetTrackId = payload.currentPlayback?.trackId ?? payload.room.currentTrackId;
    if (targetTrackId) {
      const playable = await this.resolveTrack(targetTrackId, payload.queue);
      await this.audioService.loadQueue([playable], 0);
      this.currentTrackId = targetTrackId;

      if (payload.currentPlayback) {
        if (payload.currentPlayback.playbackState === PlaybackState.PLAYING) {
          const elapsedSinceBroadcastSec = Math.max(
            0,
            (Date.now() - payload.currentPlayback.serverTimestamp) / 1000
          );
          const targetPos = payload.currentPlayback.positionSeconds + elapsedSinceBroadcastSec;
          await this.audioService.seekTo(targetPos);
          await this.audioService.play();
        } else {
          await this.audioService.seekTo(payload.currentPlayback.positionSeconds);
          await this.audioService.pause();
        }
      } else {
        await this.audioService.pause();
      }
    } else {
      this.currentTrackId = null;
      await this.audioService.pause();
    }
  }

  /**
   * Cleans up room-authoritative playback when leaving a room session.
   * Ensures room audio does not leak into personal playback outside the room.
   */
  public onRoomLeft(): Promise<void> {
    ++this.commandRevision;
    return this.synchronize(() => this.applyRoomLeft());
  }

  private async applyRoomLeft(): Promise<void> {
    await this.audioService.pause();
    await this.audioService.loadQueue([]);
    this.currentRoomId = null;
    this.currentTrackId = null;
    this.lastProcessedServerTimestamp = 0;
  }

  /**
   * Handles server-authoritative playback sync broadcast.
   * Discards stale packets and applies drift compensation without unintended autoplay.
   */
  public onServerPlaybackSync(payload: PlaybackSyncPayload): Promise<void> {
    return this.synchronize(() => this.applyServerPlaybackSync(payload));
  }

  private async applyServerPlaybackSync(sync: PlaybackSyncPayload): Promise<void> {
    const isRoomActive = useRoomStore.getState().isRoomActive;
    if (!isRoomActive || sync.roomId !== useRoomStore.getState().currentRoom?.id || (this.currentRoomId && sync.roomId !== this.currentRoomId)) return;

    // Discard stale out-of-order packets
    if (sync.serverTimestamp && sync.serverTimestamp < this.lastProcessedServerTimestamp) {
      return;
    }
    this.lastProcessedServerTimestamp = sync.serverTimestamp;

    const trackChanged = !!sync.trackId && sync.trackId !== this.currentTrackId;
    if (trackChanged) {
      const playable = await this.resolveTrack(sync.trackId);
      await this.audioService.loadQueue([playable], 0);
      this.currentTrackId = sync.trackId;
      useRoomStore.getState().setCurrentTrack(sync.trackId);
    }

    const isController = sync.activeControllerId === this.currentUserId;

    // Update Zustand state
    useRoomStore.getState().updatePlaybackSync(sync, this.currentUserId ?? '');

    // The active controller initiated the action locally; listeners synchronize to authoritative server state
    if (isController && !trackChanged) {
      if (sync.playbackState === PlaybackState.PLAYING && this.audioService.getPlaybackState() !== PlaybackState.PLAYING) {
        await this.audioService.play();
      } else if (sync.playbackState === PlaybackState.PAUSED) {
        await this.audioService.pause();
      } else if (sync.playbackState === PlaybackState.STOPPED) {
        await this.audioService.stop();
      }
      return;
    }

    if (sync.playbackState === PlaybackState.PLAYING) {
      const elapsedSinceBroadcastSec = Math.max(0, (Date.now() - sync.serverTimestamp) / 1000);
      const authoritativeTargetPos = sync.positionSeconds + elapsedSinceBroadcastSec;

      const currentLocalPos = this.getCurrentPosition();
      const driftSec = Math.abs(authoritativeTargetPos - currentLocalPos);

      // 1. Hard seek if drift exceeds threshold (0.25s / 250ms)
      if (driftSec > SYNC_DRIFT_HARD_SEEK_THRESHOLD_SEC) {
        await this.audioService.seekTo(authoritativeTargetPos);
      } else if (driftSec > SYNC_DRIFT_TOLERANCE_THRESHOLD_SEC) {
        // 2. Soft correction if drift exceeds tolerance (0.05s / 50ms)
        await this.audioService.seekTo(authoritativeTargetPos);
      }
      // 3. Below 0.05s drift is imperceptible; avoid redundant seeks to prevent audio stutter

      // Ensure native player is actively playing
      if (this.audioService.getPlaybackState() !== PlaybackState.PLAYING) {
        await this.audioService.play();
      }
    } else if (sync.playbackState === PlaybackState.PAUSED) {
      // Strictly pause — never trigger autoplay
      await this.audioService.pause();
      await this.audioService.seekTo(sync.positionSeconds);
    } else if (sync.playbackState === PlaybackState.STOPPED) {
      await this.audioService.stop();
    }
  }

  /**
   * Handles authoritative pause broadcast.
   */
  public onServerPlaybackPaused(payload: { roomId: string; positionSeconds: number; reason: string; serverTimestamp?: number }): Promise<void> {
    return this.synchronize(() => this.applyServerPlaybackPaused(payload));
  }

  private async applyServerPlaybackPaused(payload: {
    roomId: string;
    positionSeconds: number;
    reason: string;
    serverTimestamp?: number;
  }): Promise<void> {
    const isRoomActive = useRoomStore.getState().isRoomActive;
    if (!isRoomActive || payload.roomId !== useRoomStore.getState().currentRoom?.id) return;

    if (payload.serverTimestamp && payload.serverTimestamp < this.lastProcessedServerTimestamp) {
      return;
    }
    this.lastProcessedServerTimestamp = payload.serverTimestamp ?? Date.now();

    useRoomStore.getState().setPlaybackPaused(payload.positionSeconds);

    await this.audioService.pause();
    await this.audioService.seekTo(payload.positionSeconds);
  }

  /**
   * Handles authoritative track change broadcast.
   */
  public onServerTrackChanged(payload: { track: TrackDto; positionSeconds: number; serverTimestamp: number }): Promise<void> {
    return this.synchronize(() => this.applyServerTrackChanged(payload));
  }

  private async applyServerTrackChanged(payload: {
    track: TrackDto;
    positionSeconds: number;
    serverTimestamp: number;
  }): Promise<void> {
    const isRoomActive = useRoomStore.getState().isRoomActive;
    if (!isRoomActive) return;

    if (payload.serverTimestamp && payload.serverTimestamp < this.lastProcessedServerTimestamp) {
      return;
    }
    this.lastProcessedServerTimestamp = payload.serverTimestamp;

    const playable = mapTrackDtoToPlayable(payload.track);
    this.currentTrackId = payload.track.id;
    useRoomStore.getState().setCurrentTrack(payload.track.id);

    await this.audioService.loadQueue([playable], 0);
    if (payload.positionSeconds > 0) {
      await this.audioService.seekTo(payload.positionSeconds);
    }

    const currentPlayback = useRoomStore.getState().currentPlayback;
    if (currentPlayback?.playbackState === PlaybackState.PLAYING) {
      await this.audioService.play();
    } else {
      await this.audioService.pause();
    }
  }

  // --------------------------------------------------------------------------
  // Controller Commands (Emits to Socket.IO & Commands Native Player)
  // --------------------------------------------------------------------------

  public async playTrackImmediately(roomId: string, track: IPlayableTrack): Promise<boolean> {
    if (!this.canControl(roomId)) return false;
    const revision = ++this.commandRevision;
    let played = false;
    await this.synchronize(async () => {
      if (revision !== this.commandRevision || !this.canControl(roomId)) return;
      await this.audioService.loadQueue([track], 0);
      if (revision !== this.commandRevision || !this.canControl(roomId)) return;
      this.currentTrackId = track.id;
      useRoomStore.getState().setCurrentTrack(track.id);
      this.socketClient?.commandPlay(roomId, 0, track.id);
      await this.audioService.play();
      played = true;
    });
    return played;
  }

  public async commandPlay(roomId: string): Promise<boolean> {
    if (!this.canControl(roomId)) return false;
    const revision = ++this.commandRevision;
    let played = false;
    await this.synchronize(async () => {
      if (revision !== this.commandRevision || !this.canControl(roomId)) return;
      const state = useRoomStore.getState();
      const targetTrackId = state.currentPlayback?.trackId || state.currentRoom?.currentTrackId || state.queue[0]?.trackId || SAMPLE_TRACKS[0]!.id;
      const alreadyLoaded = this.currentTrackId === targetTrackId && this.audioService.getTracks().some(track => track.id === targetTrackId);
      if (!alreadyLoaded) {
        const playable = await this.resolveTrack(targetTrackId);
        await this.audioService.loadQueue([playable], 0);
        if (revision !== this.commandRevision || !this.canControl(roomId)) return;
        this.currentTrackId = targetTrackId;
        state.setCurrentTrack(targetTrackId);
      }
      const position = alreadyLoaded ? this.getCurrentPosition() : 0;
      this.socketClient?.commandPlay(roomId, position, targetTrackId);
      await this.audioService.play();
      played = true;
    });
    return played;
  }

  public async commandPause(roomId: string): Promise<boolean> {
    if (!this.canControl(roomId)) {
      return false;
    }

    ++this.commandRevision;
    this.lastProcessedServerTimestamp = Date.now();
    const currentPosition = this.getCurrentPosition();
    this.socketClient?.commandPause(roomId, currentPosition);
    await this.audioService.pause();
    return true;
  }

  public async commandSeek(roomId: string, targetPositionSeconds: number): Promise<boolean> {
    if (!this.canControl(roomId)) {
      return false;
    }

    this.lastProcessedServerTimestamp = Date.now();
    this.socketClient?.commandSeek(roomId, targetPositionSeconds);
    await this.audioService.seekTo(targetPositionSeconds);
    return true;
  }

  public async commandNext(roomId: string): Promise<boolean> {
    if (!this.canControl(roomId)) {
      return false;
    }

    this.socketClient?.commandNext(roomId);
    return true;
  }

  public async commandPrevious(roomId: string): Promise<boolean> {
    if (!this.canControl(roomId)) {
      return false;
    }

    this.socketClient?.commandPrevious(roomId);
    return true;
  }

  public getIsAttached(): boolean {
    return this.isAttached;
  }

  public getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  public getLastProcessedTimestamp(): number {
    return this.lastProcessedServerTimestamp;
  }
}
