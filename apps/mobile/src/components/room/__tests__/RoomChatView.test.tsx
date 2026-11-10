import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  effects: [] as Array<() => void | (() => void)>,
  roomStore: {
    chatMessages: [
      {
        id: 'msg-1',
        roomId: 'room-1',
        senderId: 'user-other',
        sender: { displayName: 'Alice' },
        content: 'Loving this track!',
        isEphemeral: true,
        timestamp: 1731000000000,
      },
      {
        id: 'msg-2',
        roomId: 'room-1',
        senderId: 'user-self',
        sender: { displayName: 'Me' },
        content: 'Same, added it to queue',
        isEphemeral: false,
        timestamp: 1731000060000,
      },
    ],
    typingUserIds: ['user-other'],
    participants: [
      {
        userId: 'user-other',
        user: { displayName: 'Alice' },
      },
      {
        userId: 'user-self',
        user: { displayName: 'Me' },
      },
    ],
    requiresConsentPrompt: false,
    socketConnected: true,
  },
  socketClient: {
    isConnected: vi.fn(() => true),
    sendMessage: vi.fn(),
    sendTyping: vi.fn(),
    sendConsentResponse: vi.fn(),
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
  useRef: (initial: unknown) => ({ current: initial }),
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  Pressable: 'Pressable',
  FlatList: 'FlatList',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' },
  StyleSheet: { create: (s: unknown) => s },
  Share: { share: vi.fn().mockResolvedValue(true) },
}));

vi.mock('lucide-react-native', () => ({
  Send: 'Send',
  Clock: 'Clock',
  ShieldAlert: 'ShieldAlert',
  Check: 'Check',
  X: 'X',
}));

vi.mock('../../../store/useRoomStore', () => ({
  useRoomStore: (selector: (s: typeof mockState.roomStore) => any) =>
    selector(mockState.roomStore),
}));

vi.mock('../../../services/room/room-socket.client', () => ({
  roomSocketClient: mockState.socketClient,
}));

import { RoomChatView } from '../RoomChatView';

describe('RoomChatView — Collaborative Real-Time Chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.slots = [];
    mockState.index = 0;
    mockState.effects = [];
    mockState.roomStore.requiresConsentPrompt = false;
    mockState.roomStore.socketConnected = true;
    mockState.socketClient.isConnected.mockReturnValue(true);
    mockState.roomStore.typingUserIds = ['user-other'];
  });

  it('renders chat message stream and typing indicator strip', () => {
    const tree = RoomChatView({
      roomId: 'room-1',
      currentUserId: 'user-self',
    }) as React.JSX.Element;

    expect(tree.type).toBe('KeyboardAvoidingView');

    // Find FlatList
    const flatList = (tree.props.children as any[]).find(
      (c) => c && c.type === 'FlatList'
    );
    expect(flatList).toBeDefined();
    expect(flatList.props.data).toHaveLength(2);

    // Test item rendering for item 1 (other user)
    const item1 = flatList.props.renderItem({ item: mockState.roomStore.chatMessages[0] });
    expect(item1.props.style).toContainEqual(expect.objectContaining({ alignSelf: 'flex-start' }));

    // Test item rendering for item 2 (self)
    const item2 = flatList.props.renderItem({ item: mockState.roomStore.chatMessages[1] });
    expect(item2.props.style).toContainEqual(expect.objectContaining({ alignSelf: 'flex-end' }));

    // Find Typing indicator strip
    const typingStrip = (tree.props.children as any[]).find(
      (c) => c && c.props && c.props.style && c.props.children?.props?.children?.includes?.('typing')
    );
    expect(typingStrip).toBeDefined();
    expect(typingStrip.props.children.props.children).toBe('Alice is typing…');
  });

  it('displays consent banner and dispatches consent response when room requires consent', () => {
    mockState.roomStore.requiresConsentPrompt = true;

    const tree = RoomChatView({
      roomId: 'room-1',
      currentUserId: 'user-self',
    }) as React.JSX.Element;

    // Consent banner exists
    const consentBanner = (tree.props.children as any[]).find(
      (c) => c && c.props && c.props.accessibilityRole === 'alert'
    );
    expect(consentBanner).toBeDefined();

    const actionsRow = consentBanner.props.children[2];
    const consentApproveBtn = actionsRow.props.children[0];
    const consentDeclineBtn = actionsRow.props.children[1];

    consentApproveBtn.props.onPress();
    expect(mockState.socketClient.sendConsentResponse).toHaveBeenCalledWith('room-1', true);

    consentDeclineBtn.props.onPress();
    expect(mockState.socketClient.sendConsentResponse).toHaveBeenCalledWith('room-1', false);
  });

  it('sends typed message via socket client', () => {
    // Initial slots: [inputText, ...]
    mockState.slots[0] = 'Hey everyone!';

    const tree = RoomChatView({
      roomId: 'room-1',
      currentUserId: 'user-self',
    }) as React.JSX.Element;

    // Find input row
    const inputRow = (tree.props.children as any[]).find(
      (c) => c && c.props && c.props.style && c.props.children?.length === 2
    );
    expect(inputRow).toBeDefined();

    const input = inputRow.props.children[0];
    const sendBtn = inputRow.props.children[1];

    // Change text
    input.props.onChangeText('Hello room!');
    expect(mockState.socketClient.sendTyping).toHaveBeenCalledWith('room-1', true);

    // Send
    sendBtn.props.onPress();
    expect(mockState.socketClient.sendMessage).toHaveBeenCalledWith('room-1', 'Hey everyone!');
  });
  it('retains an unsent draft while disconnected and bounds the composer to the server limit', () => {
    mockState.roomStore.socketConnected = false; mockState.socketClient.isConnected.mockReturnValue(false);
    mockState.slots[0] = 'Keep this draft';
    const tree = RoomChatView({ roomId: 'room-1', currentUserId: 'user-self' }) as React.JSX.Element;
    const row = (tree.props.children as any[]).find(c => c?.props?.children?.length === 2);
    expect(row.props.children[0].props.maxLength).toBe(1000);
    expect(row.props.children[1].props.disabled).toBe(true); row.props.children[1].props.onPress();
    expect(mockState.socketClient.sendMessage).not.toHaveBeenCalled(); expect(mockState.slots[0]).toBe('Keep this draft');
  });
});

