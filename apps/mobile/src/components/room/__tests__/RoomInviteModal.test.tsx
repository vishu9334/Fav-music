import { describe, expect, it, vi } from 'vitest';
import { RoomAccess, RoomChatPolicy, type RoomDto } from '@aadat/contracts';
import { Share } from 'react-native';
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal', Share: { share: vi.fn().mockResolvedValue(true) }, StyleSheet: { create: (value: unknown) => value, absoluteFill: {} } }));
vi.mock('lucide-react-native', () => ({ X: 'X', Lock: 'Lock', Hash: 'Hash', Share2: 'Share2' }));
import { RoomInviteModal } from '../RoomInviteModal';
const room: RoomDto = { id: 'VIKU42', name: 'Listening together', access: RoomAccess.PRIVATE, chatPolicy: RoomChatPolicy.EPHEMERAL_SESSION_ONLY,
  hostUserId: 'host-account-id', originalControllerId: 'host-account-id', activeControllerId: 'host-account-id', currentTrackId: null, participantCount: 1, maxParticipants: 10, createdAt: '2026-11-10T00:00:00Z' };
function nodes(value: any): any[] { if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(nodes); return [value, ...nodes(value.props?.children)]; }
describe('sharing a short room code without a username', () => {
  it('shows a selectable room code without asking for a user ID or username', () => {
    const tree = RoomInviteModal({ visible: true, room, onClose: () => {} });
    const all = nodes(tree);
    expect(all.find(node => node.props?.accessibilityLabel === 'Room code: VIKU42')?.props.selectable).toBe(true);
    expect(all.some(node => node.props?.accessibilityLabel === 'Target User ID')).toBe(false);
  });
  it('shares the actual room code and private passcode without the owner account ID', () => {
    const tree = RoomInviteModal({ visible: true, room, passcode: '4826', onClose: () => {} });
    nodes(tree).find(node => node.props?.accessibilityLabel === 'Share Room Invite')!.props.onPress();
    const message = vi.mocked(Share.share).mock.calls.at(-1)![0].message!;
    expect(message).toContain('Room code: VIKU42'); expect(message).toContain('Passcode: 4826');
    expect(message).not.toContain(room.hostUserId);
  });
});
