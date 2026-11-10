import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  socketClient: {
    respondRequest: vi.fn(),
  },
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Modal: 'Modal',
  FlatList: 'FlatList',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  Share: { share: vi.fn().mockResolvedValue(true) },
}));

vi.mock('lucide-react-native', () => ({
  Crown: 'Crown',
  Headphones: 'Headphones',
  X: 'X',
  Check: 'Check',
  Share2: 'Share2',
}));

vi.mock('../../../auth/components/user-id.card', () => ({
  UserIdCard: 'UserIdCard',
}));

vi.mock('../../../services/room/room-socket.client', () => ({
  roomSocketClient: mockState.socketClient,
}));

import { RoomParticipantSheet } from '../RoomParticipantSheet';

describe('RoomParticipantSheet — Participant Presence & Control Requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const participants = [
    {
      userId: 'user-host',
      user: { id: 'user-host', displayName: 'Room Host' } as any,
      isHost: true,
      isOriginalController: true,
      isActiveController: true,
      hasConsentedToPersistentChat: true,
      joinedAt: new Date().toISOString(),
    },
    {
      userId: 'user-guest',
      user: { id: 'user-guest', displayName: 'Guest User' } as any,
      isHost: false,
      isOriginalController: false,
      isActiveController: false,
      hasConsentedToPersistentChat: false,
      joinedAt: new Date().toISOString(),
    },
  ];

  const pendingRequests = [
    {
      id: 'req-1',
      roomId: 'room-1',
      requesterId: 'user-guest',
      requester: { id: 'user-guest', displayName: 'Guest User' } as any,
      status: 'PENDING' as any,
      createdAt: new Date().toISOString(),
    },
  ];

  it('renders participant list with Host and DJ badges', () => {
    const onClose = vi.fn();
    const tree = RoomParticipantSheet({
      visible: true,
      roomId: 'room-1',
      currentUserId: 'user-host',
      isController: true,
      participants,
      pendingRequests,
      onClose,
    }) as React.JSX.Element;

    expect(tree.type).toBe('Modal');
    const sheetCard = tree.props.children.props.children[1];

    // Find FlatList
    const flatList = sheetCard.props.children.find(
      (c: any) => c && c.type === 'FlatList'
    );
    expect(flatList).toBeDefined();
    expect(flatList.props.data).toHaveLength(2);

    // Render Host row
    const hostRow = flatList.props.renderItem({ item: participants[0] });
    expect(hostRow).toBeDefined();

    // Render Guest row
    const guestRow = flatList.props.renderItem({ item: participants[1] });
    expect(guestRow).toBeDefined();
  });

  it('allows controller to approve and decline control requests', () => {
    const onClose = vi.fn();
    const tree = RoomParticipantSheet({
      visible: true,
      roomId: 'room-1',
      currentUserId: 'user-host',
      isController: true,
      participants,
      pendingRequests,
      onClose,
    }) as React.JSX.Element;

    const sheetCard = tree.props.children.props.children[1];
    // Find pending requests section
    const requestsSection = sheetCard.props.children.find(
      (c: any) => c && c.props && c.props.style && c.props.style.backgroundColor
    );
    expect(requestsSection).toBeDefined();

    const requestItem = requestsSection.props.children[1][0];
    const actionRow = requestItem.props.children[1];
    const approveBtn = actionRow.props.children[0];
    const rejectBtn = actionRow.props.children[1];

    approveBtn.props.onPress();
    expect(mockState.socketClient.respondRequest).toHaveBeenCalledWith(
      'room-1',
      'req-1',
      'APPROVE'
    );

    rejectBtn.props.onPress();
    expect(mockState.socketClient.respondRequest).toHaveBeenCalledWith(
      'room-1',
      'req-1',
      'REJECT'
    );
  });
});

