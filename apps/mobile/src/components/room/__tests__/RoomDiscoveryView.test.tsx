import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomAccess, RoomChatPolicy } from '@aadat/contracts';

const mockState = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  effects: [] as Array<() => void | (() => void)>,
  apiClient: {
    getPublicRooms: vi.fn(),
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
        mockState.slots[i] = value;
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
  useCallback: (cb: unknown) => cb,
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  Pressable: 'Pressable',
  Modal: 'Modal',
  FlatList: 'FlatList',
  RefreshControl: 'RefreshControl',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
}));

vi.mock('../../../design/GlassSurface', () => ({
  GlassSurface: 'GlassSurface',
}));

vi.mock('lucide-react-native', () => ({
  Search: 'Search',
  Plus: 'Plus',
  Lock: 'Lock',
  Globe: 'Globe',
  Users: 'Users',
  Music: 'Music',
  RotateCcw: 'RotateCcw',
  X: 'X',
  KeyRound: 'KeyRound',
}));

vi.mock('../../../services/room/room-api.client', () => ({
  roomApiClient: mockState.apiClient,
}));

vi.mock('../CreateRoomModal', () => ({
  CreateRoomModal: 'CreateRoomModal',
}));

import { RoomDiscoveryView } from '../RoomDiscoveryView';

describe('RoomDiscoveryView — Public & Private Room Discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.slots = [];
    mockState.index = 0;
    mockState.effects = [];
  });

  const sampleRooms = [
    {
      id: 'room-pub-1',
      name: 'Ambient Chill',
      access: RoomAccess.PUBLIC,
      chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
      hostUserId: 'user-1',
      originalControllerId: 'user-1',
      activeControllerId: 'user-1',
      currentTrackId: null,
      participantCount: 3,
      maxParticipants: 10,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'room-priv-2',
      name: 'Secret Vault',
      access: RoomAccess.PRIVATE,
      chatPolicy: RoomChatPolicy.PERSISTENT_LOG,
      hostUserId: 'user-2',
      originalControllerId: 'user-2',
      activeControllerId: 'user-2',
      currentTrackId: null,
      participantCount: 1,
      maxParticipants: 10,
      createdAt: new Date().toISOString(),
    },
  ];

  it('renders room list and allows joining public room directly', () => {
    // Populate slots: [rooms, searchQuery, loading, refreshing, error, createModal, privateModal, targetId, passcode, joinError]
    mockState.slots[0] = sampleRooms;
    mockState.slots[2] = false; // loading: false

    const onJoinRoom = vi.fn();
    const tree = RoomDiscoveryView({
      userId: 'user-test',
      onJoinRoom,
    }) as React.JSX.Element;

    // Find FlatList
    const flatList = (tree.props.children as any[]).find(
      (c) => c && c.type === 'FlatList'
    );
    expect(flatList).toBeDefined();
    expect(flatList.props.data).toHaveLength(2);

    // Render public room card
    const pubCard = flatList.props.renderItem({ item: sampleRooms[0] });
    expect(pubCard.type).toBe('GlassSurface');

    const joinBtn = pubCard.props.children[2].props.children;
    joinBtn.props.onPress();
    expect(onJoinRoom).toHaveBeenCalledWith('room-pub-1');
  });

  it('filters rooms by search query', () => {
    mockState.slots[0] = sampleRooms;
    mockState.slots[1] = 'ambient'; // searchQuery: 'ambient'
    mockState.slots[2] = false; // loading: false

    const onJoinRoom = vi.fn();
    const tree = RoomDiscoveryView({
      userId: 'user-test',
      onJoinRoom,
    }) as React.JSX.Element;

    const flatList = (tree.props.children as any[]).find(
      (c) => c && c.type === 'FlatList'
    );
    expect(flatList.props.data).toHaveLength(1);
    expect(flatList.props.data[0].id).toBe('room-pub-1');
  });

  it('opens private join modal and joins with passcode', () => {
    mockState.slots[0] = sampleRooms;
    mockState.slots[2] = false;
    // Set target room and passcode in state slots
    mockState.slots[7] = ' viku42 ';
    mockState.slots[8] = '1234';

    const onJoinRoom = vi.fn();
    const tree = RoomDiscoveryView({
      userId: 'user-test',
      onJoinRoom,
    }) as React.JSX.Element;

    // Find Private Join Modal
    const privateModal = (tree.props.children as any[]).find(
      (c) => c && c.type === 'Modal'
    );
    expect(privateModal).toBeDefined();

    const modalContent = privateModal.props.children.props.children[1].props.children[1];
    const submitBtn = modalContent.props.children.find(
      (c: any) => c && c.props && c.props.accessibilityLabel === 'Enter Room'
    );
    expect(submitBtn).toBeDefined();
    submitBtn.props.onPress();

    expect(onJoinRoom).toHaveBeenCalledWith('VIKU42', '1234');
  });
  it.each(['VIKU4', 'VIKU123', 'VI42', 'VIKU4!'])('rejects malformed room code %s before joining', code => {
    mockState.slots[7] = code;
    const onJoinRoom = vi.fn();
    const tree = RoomDiscoveryView({ userId: 'user-test', onJoinRoom });
    const modal = tree.props.children.find((child: any) => child?.type === 'Modal');
    const content = modal.props.children.props.children[1].props.children[1];
    content.props.children.find((child: any) => child?.props?.accessibilityLabel === 'Enter Room').props.onPress();
    expect(onJoinRoom).not.toHaveBeenCalled();
    expect(mockState.slots[9]).toBe('Enter 4 letters and 2 digits, for example VIKU42.');
  });

});
