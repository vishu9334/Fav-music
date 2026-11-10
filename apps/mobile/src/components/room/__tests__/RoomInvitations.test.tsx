import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoomStore } from '../../../store/useRoomStore';
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: () => ['private-fixture', vi.fn()] }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', StyleSheet: { create: (value: unknown) => value } }));
import { RoomInvitations } from '../RoomInvitations';
const invitation = { roomId: 'room-fixture', roomName: 'Music together', invitedBy: { id: 'friend', displayName: 'Friend' } };
function nodes(value: any): any[] { if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(nodes); return [value, ...nodes(value.props?.children)]; }
// The component uses Zustand selectors; call the actual store snapshot through a mocked hook.
vi.mock('../../../store/useRoomStore', async original => {
  const actual = await original<typeof import('../../../store/useRoomStore')>();
  return { ...actual, useRoomStore: Object.assign((select: (state: unknown) => unknown) => select(actual.useRoomStore.getState()), { getState: actual.useRoomStore.getState }) };
});
beforeEach(() => { useRoomStore.getState().clearInvitations(); useRoomStore.getState().setSocketConnected(true); });
describe('receiving a listening-room invite', () => {
  it('requires an explicit Join action and preserves the invite until the server confirms joining', () => {
    useRoomStore.getState().addInvitation(invitation); const join = vi.fn();
    const outer = RoomInvitations({ onJoinRoom: join })!;
    const card = (outer.type as Function)(outer.props);
    expect(join).not.toHaveBeenCalled();
    nodes(card).find(node => node.props?.title === 'Join room chat')!.props.onPress();
    expect(join).toHaveBeenCalledExactlyOnceWith(invitation.roomId, 'private-fixture');
    expect(useRoomStore.getState().invitations).toHaveLength(1);
    nodes(card).find(node => node.props?.title === 'Dismiss invite')!.props.onPress();
    expect(useRoomStore.getState().invitations).toEqual([]);
  });
  it('bounds and deduplicates the invitation inbox without retaining it after account cleanup', () => {
    for (let i = 0; i < 12; i++) useRoomStore.getState().addInvitation({ ...invitation, roomId: String(i) });
    expect(useRoomStore.getState().invitations).toHaveLength(5);
    useRoomStore.getState().addInvitation({ ...invitation, roomId: '11' });
    expect(useRoomStore.getState().invitations).toHaveLength(5);
  });
});
