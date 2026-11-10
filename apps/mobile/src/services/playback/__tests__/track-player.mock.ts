import { vi } from 'vitest';

type Track = { id: string; url: string; duration?: number };
type Listener = (event: unknown) => unknown;

export const State = {
  None: 'none', Ready: 'ready', Playing: 'playing', Paused: 'paused',
  Stopped: 'stopped', Buffering: 'buffering', Loading: 'loading', Error: 'error', Ended: 'ended',
};
export const RepeatMode = {
  Off: 0,
  Track: 1,
  Queue: 2,
};
export const Event = {
  PlaybackState: 'playback-state', PlaybackActiveTrackChanged: 'playback-active-track-changed',
  PlaybackProgressUpdated: 'playback-progress-updated', PlaybackError: 'playback-error',
  PlaybackQueueEnded: 'playback-queue-ended',
  RemotePlay: 'remote-play', RemotePause: 'remote-pause', RemoteNext: 'remote-next',
  RemotePrevious: 'remote-previous', RemoteSeek: 'remote-seek', RemoteStop: 'remote-stop',
  RemoteDuck: 'remote-duck',
};
let queue: Track[] = [];
let activeIndex: number | undefined;
let state = State.None;
let position = 0;
let buffered: number | null = null;
let setup = false;
let prepared = false;
let failure = { code: 'unknown', message: 'Playback unavailable' };
let currentRepeatMode = RepeatMode.Off;
const listeners = new Map<string, Set<Listener>>();

async function emit(event: string, payload?: unknown): Promise<void> {
  if (event === Event.PlaybackError) {
    state = State.Error;
    failure = { ...failure, ...(payload as Partial<typeof failure>) };
  }
  if (event === Event.PlaybackProgressUpdated) {
    const progress = payload as { track: number; position: number; buffered: number };
    if (progress.track === activeIndex) { position = progress.position; buffered = progress.buffered; }
  }
  await Promise.all([...listeners.get(event) ?? []].map((listener) => listener(payload)));
}
function changeState(next: string): void {
  state = next;
  void emit(Event.PlaybackState, { state });
}

/** Stateful native contract: reset clears the queue, stop unloads but retains it. */
export const native = {
  setupPlayer: vi.fn(async () => {
    if (setup) throw Object.assign(new Error('Already initialized'), { code: 'player_already_initialized' });
    setup = true;
  }),
  updateOptions: vi.fn(async () => {}),
  getQueue: vi.fn(async () => [...queue]),
  getActiveTrackIndex: vi.fn(async () => activeIndex),
  getPlaybackState: vi.fn(async () => ({ state, ...(state === State.Error ? { error: failure } : {}) })),
  getProgress: vi.fn(async () => ({
    position, duration: queue[activeIndex ?? -1]?.duration ?? 0, buffered: buffered ?? position + 10,
  })),
  reset: vi.fn(async () => {
    const lastIndex = activeIndex;
    queue = []; activeIndex = undefined; position = 0; buffered = null; prepared = false;
    void emit(Event.PlaybackActiveTrackChanged, { lastIndex, lastPosition: 0 });
    changeState(State.None);
  }),
  add: vi.fn(async (tracks: readonly Track[]) => {
    queue.push(...tracks);
    if (activeIndex === undefined && queue.length > 0) {
      activeIndex = 0; prepared = true;
      void emit(Event.PlaybackActiveTrackChanged, { index: 0, lastPosition: 0 });
      changeState(State.Ready);
    }
  }),
  skip: vi.fn(async (index: number) => {
    if (!queue[index]) throw new Error('Track index out of bounds');
    const lastIndex = activeIndex;
    activeIndex = index; position = 0; buffered = null; prepared = true;
    void emit(Event.PlaybackActiveTrackChanged, { index, lastIndex, lastPosition: 0 });
  }),
  play: vi.fn(async () => {
    // Model the observed silent failure when there is nothing to play.
    changeState(queue.length && activeIndex !== undefined && prepared ? State.Playing : State.Stopped);
  }),
  pause: vi.fn(async () => { changeState(State.Paused); }),
  stop: vi.fn(async () => { prepared = false; changeState(State.Stopped); }),
  retry: vi.fn(async () => { prepared = true; changeState(State.Ready); }),
  seekTo: vi.fn(async (seconds: number) => {
    if (activeIndex === undefined) throw new Error('No active track');
    position = seconds; buffered = null;
  }),
  setRepeatMode: vi.fn(async (mode: number) => {
    currentRepeatMode = mode;
  }),
  getRepeatMode: vi.fn(async () => currentRepeatMode),
  addEventListener: vi.fn((event: string, listener: Listener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)?.add(listener);
    return { remove: vi.fn(() => { listeners.get(event)?.delete(listener); }) };
  }),
  __emit: emit,
  __emitStale: async (event: string, payload?: unknown) => {
    await Promise.all([...listeners.get(event) ?? []].map(listener => listener(payload)));
  },
  __setPosition: (seconds: number) => { position = seconds; buffered = null; },
  __setState: (next: string) => { changeState(next); },
  __seed: (tracks: readonly Track[], index: number | undefined) => {
    queue = [...tracks]; activeIndex = index; prepared = index !== undefined; state = State.Ready;
  },
  __reset: () => {
    queue = []; activeIndex = undefined; position = 0; buffered = null; state = State.None;
    currentRepeatMode = RepeatMode.Off;
    failure = { code: 'unknown', message: 'Playback unavailable' };
    setup = false; prepared = false; listeners.clear(); vi.clearAllMocks();
  },
  __listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
};
export type NativeMock = typeof native;
export const trackPlayerModule = {
  default: native, Event, State, RepeatMode,
  Capability: { Play: 1, Pause: 2, Stop: 3, SkipToNext: 4, SkipToPrevious: 5, SeekTo: 6 },
  AppKilledPlaybackBehavior: { StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification' },
};
