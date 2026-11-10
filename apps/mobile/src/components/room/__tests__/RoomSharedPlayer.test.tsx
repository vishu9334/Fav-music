import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  effects: [] as Array<() => void | (() => void)>,
  roomStore: {
    currentRoom: {
      id: 'room-1',
      name: 'Vibe Room',
      currentTrackId: 'track-1',
      currentTrack: {
        id: 'track-1',
        title: 'Midnight City',
        artistName: 'M83',
        artworkKey: 'art-1',
      },
    },
    isController: true,
    activeControllerId: 'user-controller',
    participants: [
      {
        userId: 'user-controller',
        user: { displayName: 'DJ Alex' },
      },
      {
        userId: 'user-listener',
        user: { displayName: 'Listener Sam' },
      },
    ],
    currentPlayback: {
      roomId: 'room-1',
      trackId: 'track-1',
      playbackState: 'PLAYING' as any,
      positionSeconds: 30,
    },
    queue: [],
    takeoverPrompt: null as { departedControllerId: string; expiresAt: number } | null,
    pendingControlRequests: [] as any[],
  },
  playerStore: {
    position: 30,
    duration: 180,
    playbackState: 'PLAYING' as any,
    tracks: [] as any[],
    activeTrackIndex: 0,
  },
  bridge: {
    commandPlay: vi.fn(),
    commandPause: vi.fn(),
    commandPrevious: vi.fn(),
    commandNext: vi.fn(),
  },
  socketClient: {
    requestControl: vi.fn(),
    claimTakeover: vi.fn(),
    respondRequest: vi.fn(),
    addQueueTrack: vi.fn(),
  },
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = mockState.index++;
    if (!(i in mockState.slots)) {
      mockState.slots[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    }
    return [
      mockState.slots[i],
      (value: unknown) => {
        mockState.slots[i] = typeof value === 'function' ? value(mockState.slots[i]) : value;
      },
    ];
  },
  useEffect: (effect: () => void | (() => void)) => {
    const i = mockState.index++;
    if (!(i in mockState.slots)) {
      mockState.slots[i] = true;
      mockState.effects.push(effect);
    }
  },
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (fn: unknown) => fn,
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  Pressable: 'Pressable',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
}));

vi.mock('../../../design/GlassSurface', () => ({
  GlassSurface: 'GlassSurface',
}));

vi.mock('../../../design/Artwork', () => ({
  Artwork: 'Artwork',
}));

vi.mock('lucide-react-native', () => ({
  Headphones: 'Headphones',
  AlertTriangle: 'AlertTriangle',
  Check: 'Check',
  X: 'X',
  Search: 'Search',
  Play: 'Play',
  Pause: 'Pause',
}));

vi.mock('../../../store/useRoomStore', () => ({
  useRoomStore: (selector: (s: typeof mockState.roomStore) => any) =>
    selector(mockState.roomStore),
}));

vi.mock('../../../store/usePlayerStore', () => ({
  usePlayerStore: (selector: (s: typeof mockState.playerStore) => any) =>
    selector(mockState.playerStore),
}));

vi.mock('../../../services/room/room-playback-bridge', () => ({
  RoomPlaybackBridge: {
    getInstance: () => mockState.bridge,
  },
}));

vi.mock('../../../services/room/room-socket.client', () => ({
  roomSocketClient: mockState.socketClient,
}));

vi.mock('../RoomSongSearch', () => ({ RoomSongSearch: 'RoomSongSearch' }));

import { RoomSharedPlayer } from '../RoomSharedPlayer';

function nodes(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}

describe('RoomSharedPlayer — Chatbot-Style Pop-In Widget with Kobra Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.slots = [];
    mockState.index = 0;
    mockState.effects = [];
    mockState.roomStore.isController = true;
    mockState.roomStore.takeoverPrompt = null;
    mockState.roomStore.pendingControlRequests = [];
  });

  it('renders Kobra play button and allows controller to toggle playback', () => {
    const tree = RoomSharedPlayer({ roomId: 'room-1' }) as React.JSX.Element;
    expect(tree.type).toBe('GlassSurface');

    const playBtn = nodes(tree).find((n) => n.props?.accessibilityLabel === 'Pause');
    expect(playBtn).toBeDefined();
    expect(playBtn.props.disabled).toBe(false);

    // Trigger pause command
    playBtn.props.onPress();
    expect(mockState.bridge.commandPause).toHaveBeenCalledWith('room-1');
  });

  it('disables Kobra play button and displays Request DJ button for listener', () => {
    mockState.roomStore.isController = false;

    const tree = RoomSharedPlayer({ roomId: 'room-1' }) as React.JSX.Element;
    const playBtn = nodes(tree).find((n) => n.props?.accessibilityLabel === 'Pause');
    expect(playBtn).toBeDefined();
    expect(playBtn.props.disabled).toBe(true);

    const requestBtn = nodes(tree).find(
      (n) => n.props?.accessibilityLabel === 'Request playback control'
    );
    expect(requestBtn).toBeDefined();

    requestBtn.props.onPress();
    expect(mockState.socketClient.requestControl).toHaveBeenCalledWith('room-1');
  });

  it('shows takeover alert banner with claim action when active controller departs', () => {
    mockState.roomStore.takeoverPrompt = {
      departedControllerId: 'user-departed',
      expiresAt: Date.now() + 15000,
    };

    const tree = RoomSharedPlayer({ roomId: 'room-1' }) as React.JSX.Element;
    const takeoverBanner = nodes(tree).find(
      (c) => c && c.props && c.props.accessibilityRole === 'alert'
    );
    expect(takeoverBanner).toBeDefined();

    const claimBtn = nodes(tree).find(
      (c) => c && c.props && c.props.accessibilityLabel === 'Claim DJ Control'
    );
    expect(claimBtn).toBeDefined();
    claimBtn.props.onPress();
    expect(mockState.socketClient.claimTakeover).toHaveBeenCalledWith('room-1');
  });

  it('displays pending control requests for active controller with 1-tap approve/reject', () => {
    mockState.roomStore.isController = true;
    mockState.roomStore.pendingControlRequests = [
      {
        id: 'req-99',
        roomId: 'room-1',
        requesterId: 'user-listener',
        requester: { displayName: 'Listener Sam' },
        status: 'PENDING',
      },
    ];

    const tree = RoomSharedPlayer({ roomId: 'room-1' }) as React.JSX.Element;
    const approveBtn = nodes(tree).find(
      (n) => n.props?.accessibilityLabel === 'Approve control request'
    );
    const rejectBtn = nodes(tree).find(
      (n) => n.props?.accessibilityLabel === 'Reject control request'
    );
    expect(approveBtn).toBeDefined();
    expect(rejectBtn).toBeDefined();

    approveBtn.props.onPress();
    expect(mockState.socketClient.respondRequest).toHaveBeenCalledWith(
      'room-1',
      'req-99',
      'APPROVE'
    );

    rejectBtn.props.onPress();
    expect(mockState.socketClient.respondRequest).toHaveBeenCalledWith(
      'room-1',
      'req-99',
      'REJECT'
    );
  });

  it('starts as small chatbot-style widget, pops open search on search tap, and closes back', () => {
    let tree = RoomSharedPlayer({ roomId: 'room-1' }) as React.JSX.Element;
    // Initially compact chatbot widget: no RoomSongSearch
    expect(nodes(tree).some((node) => node.type === 'RoomSongSearch')).toBe(false);

    // Tap search button
    const searchBtn = nodes(tree).find(
      (node) => node.props?.accessibilityLabel === 'Search song to play'
    );
    expect(searchBtn).toBeDefined();
    searchBtn.props.onPress();

    // Re-render: search overlay is open
    mockState.index = 0;
    tree = RoomSharedPlayer({ roomId: 'room-1' }) as React.JSX.Element;
    expect(nodes(tree).some((node) => node.type === 'RoomSongSearch')).toBe(true);

    // Close search overlay (or after song queued)
    const closeBtn = nodes(tree).find(
      (node) => node.props?.accessibilityLabel === 'Close song search'
    );
    expect(closeBtn).toBeDefined();
    closeBtn.props.onPress();

    // Re-render: pops back into chatbot-style small widget
    mockState.index = 0;
    tree = RoomSharedPlayer({ roomId: 'room-1' }) as React.JSX.Element;
    expect(nodes(tree).some((node) => node.type === 'RoomSongSearch')).toBe(false);
  });
});
