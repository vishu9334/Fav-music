import { describe, expect, it, vi } from 'vitest';
const share = vi.hoisted(() => vi.fn(async () => ({ action: 'dismissedAction' })));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', Share: { share }, StyleSheet: { create: (value: unknown) => value } }));
import { UserIdCard } from '../components/user-id.card';
const id = '10000000-0000-4000-8000-000000000001';
describe('shareable Fav Music account identity', () => {
  it('shows the complete selectable account ID and opens a native share sheet only on request', async () => {
    const card = UserIdCard({ userId: id }), children = card.props.children;
    expect(children[1].props.children).toBe(id); expect(children[1].props.selectable).toBe(true);
    expect(share).not.toHaveBeenCalled();
    children[3].props.onPress(); await Promise.resolve();
    expect(share).toHaveBeenCalledExactlyOnceWith({ title: 'My Fav Music User ID', message: `Invite me to your Fav Music listening room.\nMy User ID: ${id}` });
  });
});
