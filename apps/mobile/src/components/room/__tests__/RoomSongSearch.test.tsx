import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPlayableTrack } from '../../../data/sample-tracks';
const h = vi.hoisted(() => ({
  index: 0, slots: [] as any[], jobs: [] as Array<() => void>,
  controller: false, play: vi.fn().mockResolvedValue(true), connected: true, queue: [] as Array<{ trackId: string }>, add: vi.fn(), queries: [] as any[],
  page: { tracks: [] as IPlayableTrack[], status: 'ready', error: null as string | null },
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const i = h.index++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], (value: unknown) => { h.slots[i] = value; }]; },
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const i = h.index++, old = h.slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined;
    if (old && deps.every((value, n) => value === old.deps[n])) return;
    h.jobs.push(() => { old?.cleanup?.(); h.slots[i] = { deps, cleanup: effect() }; });
  },
}));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', StyleSheet: { create: (value: unknown) => value } }));
vi.mock('lucide-react-native', () => ({ Search: 'Search', X: 'X' }));
vi.mock('../../../design/Artwork', () => ({ Artwork: 'Artwork' }));
vi.mock('../../../catalog/use-debounced-value', () => ({ useDebouncedValue: (value: string) => value }));
vi.mock('../../../catalog/use-catalog-page', () => ({ useCatalogPage: (query: unknown, _delay: number, active: boolean) => { h.queries.push({ query, active }); return h.page; } }));
vi.mock('../../../services/room/room-socket.client', () => ({ roomSocketClient: { addQueueTrack: h.add } }));
vi.mock('../../../store/useRoomStore', () => ({ useRoomStore: (select: (state: unknown) => unknown) => select({ socketConnected: h.connected, queue: h.queue, isController: h.controller }) }));
vi.mock('../../../services/room/room-playback-bridge', () => ({
  RoomPlaybackBridge: { getInstance: () => ({ playTrackImmediately: h.play }) },
  mapTrackDtoToPlayable: (track: unknown) => track,
}));
import { RoomSongSearch } from '../RoomSongSearch';
const track: IPlayableTrack = { id: 'track-fixture', title: 'Aadat', artist: 'Ninja', duration: 180, url: '', artwork: '', catalogSource: 'catalog' };
function nodes(value: any): any[] { if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(nodes); return [value, ...nodes(value.props?.children)]; }
function render() { h.index = 0; h.jobs = []; const tree = RoomSongSearch({ roomId: 'room-fixture' }); h.jobs.forEach(job => job()); return tree; }
function search() { const tree = render(); nodes(tree).find(node => node.type === 'TextInput')!.props.onChangeText('Aadat'); return render(); }
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); h.slots = []; h.controller = false; h.play.mockResolvedValue(true); h.queue = []; h.connected = true; h.queries = []; h.page = { tracks: [track, { ...track, id: 'duplicate' }], status: 'ready', error: null }; });
afterEach(() => { for (const slot of h.slots) slot?.cleanup?.(); vi.useRealTimers(); });
describe('small room catalog search', () => {
  it('keeps empty search idle, requests the typed catalog query, and removes repeated recordings', () => {
    render(); expect(h.queries.at(-1)).toEqual({ query: { query: '' }, active: false });
    const tree = search(); expect(h.queries.at(-1)).toEqual({ query: { query: 'Aadat' }, active: true });
    expect(nodes(tree).filter(node => node.props?.accessibilityLabel === 'Add Aadat to room queue')).toHaveLength(1);
    expect(h.add).not.toHaveBeenCalled();
  });
  it('waits for the authoritative queue update before reporting success or clearing search', () => {
    let tree = search(); nodes(tree).find(node => node.props?.accessibilityLabel === 'Add Aadat to room queue')!.props.onPress();
    tree = render(); const waiting = nodes(tree).find(node => node.props?.accessibilityLabel === 'Add Aadat to room queue')!;
    expect(waiting.props.disabled).toBe(true); waiting.props.onPress(); expect(h.add).toHaveBeenCalledExactlyOnceWith('room-fixture', track.id);
    expect(nodes(tree).find(node => node.type === 'TextInput')!.props.value).toBe('Aadat');
    h.queue = [{ trackId: track.id }]; render(); tree = render();
    expect(nodes(tree).find(node => node.type === 'TextInput')!.props.value).toBe('');
    expect(nodes(tree).some(node => node.props?.children === 'Added to the room queue.')).toBe(true);
  });
  it('starts controller audio only after server queue confirmation', async () => {
    h.controller = true;
    let tree = search(); nodes(tree).find(node => node.props?.accessibilityLabel === 'Add Aadat to room queue')!.props.onPress();
    render(); expect(h.play).not.toHaveBeenCalled();
    h.queue = [{ trackId: track.id, track } as any]; render(); await Promise.resolve();
    expect(h.play).toHaveBeenCalledExactlyOnceWith('room-fixture', track);
  });
  it('shows a playback error and preserves the search if confirmed audio fails', async () => {
    h.controller = true; h.play.mockRejectedValueOnce(new Error('Audio unavailable'));
    let tree = search(); nodes(tree).find(node => node.props?.accessibilityLabel === 'Add Aadat to room queue')!.props.onPress();
    render(); h.queue = [{ trackId: track.id, track } as any]; render(); await Promise.resolve(); await Promise.resolve(); tree = render();
    expect(nodes(tree).some(node => node.props?.children === 'Song queued, but audio could not load. Retry using the top Play button.')).toBe(true);
    expect(nodes(tree).find(node => node.type === 'TextInput')!.props.value).toBe('Aadat');
  });
  it('preserves the search on a missing confirmation and blocks additions while disconnected', () => {
    let tree = search(); nodes(tree).find(node => node.props?.accessibilityLabel === 'Add Aadat to room queue')!.props.onPress(); render();
    vi.advanceTimersByTime(8000); tree = render();
    expect(nodes(tree).some(node => node.props?.children === 'The room has not confirmed this song. Please retry.')).toBe(true);
    h.connected = false; tree = render(); const add = nodes(tree).find(node => node.props?.accessibilityLabel === 'Add Aadat to room queue')!;
    expect(add.props.disabled).toBe(true); add.props.onPress(); expect(h.add).toHaveBeenCalledTimes(1);
  });
});
