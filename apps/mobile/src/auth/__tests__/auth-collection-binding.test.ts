import { describe, expect, it, vi } from 'vitest';
import { AuthCollectionBinding } from '../controllers/auth-collection.binding';
import { AuthState } from '../controllers/auth.controller';
import { AuthUser } from '../contracts/auth.contract';
const user: AuthUser = { id: '10000000-0000-4000-8000-000000000001', email: 'fixture@example.test', displayName: 'Test fixture', avatarUrl: null, createdAt: '2026-11-06', chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY' };
describe('Verified identity to local collection binding', () => {
  it('activates accounts only after server authentication, ignores transient revalidation, and immediately hides account data on logout/offline', () => {
    let state: AuthState = { status: 'idle', user: null, message: null }, changed = () => {};
    const unsubscribe = vi.fn(), activate = vi.fn(async () => {});
    const binding = new AuthCollectionBinding({ getSnapshot: () => state, subscribe: (listener) => { changed = listener; return unsubscribe; } }, activate);
    binding.start(); binding.start(); expect(activate).toHaveBeenLastCalledWith(null);
    state = { status: 'loading', user: null, message: null }; changed(); expect(activate).toHaveBeenCalledTimes(1);
    state = { status: 'authenticated', user, message: null }; changed(); expect(activate).toHaveBeenLastCalledWith(user.id);
    state = { status: 'loading', user, message: null }; changed(); expect(activate).toHaveBeenCalledTimes(2);
    state = { status: 'offline', user: null, message: 'Offline' }; changed(); expect(activate).toHaveBeenLastCalledWith(null);
    state = { status: 'authenticated', user, message: null }; changed();
    state = { status: 'loading', user: null, message: null }; changed(); expect(activate).toHaveBeenLastCalledWith(null);
    binding.stop(); expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
