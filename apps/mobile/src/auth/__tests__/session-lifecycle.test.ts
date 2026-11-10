vi.mock('../../store/usePlayerStore',()=>({usePlayerStore:{getState:()=>({resetForAccount:async()=>{}})}}));
vi.mock('../../store/useDiscoveryStore',()=>({useDiscoveryStore:{getState:()=>({resetForAccount:()=>{}})}}));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSessionLifecycle } from '../components/auth-session-lifecycle';

const fake = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state: {status:string;user:{id:string}|null;message:string|null} = { status: 'authenticated', user: { id: '10000000-0000-4000-8000-000000000001' }, message: null };
  let expires = 0;
  const controller = { getSnapshot: () => state, getExpiresAt: () => expires, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    restore: vi.fn(async () => { expires = Date.now() + 90_000; for (const listener of listeners) listener(); }) };
  const appState = { currentState: 'active', addEventListener: vi.fn() };
  return { controller, state, appState, activate: vi.fn(async () => {}), disconnect: vi.fn(), reset: () => { listeners.clear(); expires = 0;state.status='authenticated';state.user={id:'10000000-0000-4000-8000-000000000001'};state.message=null; } };
});
vi.mock('react-native', () => ({ AppState: fake.appState }));
vi.mock('../../services/room/room-socket.client', () => ({ roomSocketClient: { disconnect: fake.disconnect } }));
vi.mock('../auth.module', () => ({ AuthModule: { getController: () => fake.controller } }));
vi.mock('../../store/useLibraryStore', () => ({ useLibraryStore: { getState: () => ({ activateAccount: fake.activate }) } }));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T00:00:00Z')); vi.clearAllMocks(); fake.reset(); fake.appState.currentState = 'active'; });
afterEach(() => { vi.useRealTimers(); });

describe('Foreground session renewal without player remount', () => {
  it('disconnects the previous room identity when logout changes the account scope', async () => {
    fake.appState.addEventListener.mockReturnValue({ remove: vi.fn() });
    const lifecycle = new AuthSessionLifecycle({}); lifecycle.componentDidMount();
    expect(fake.disconnect).toHaveBeenCalledOnce();
    fake.state.status = 'anonymous'; fake.state.user = null; await fake.controller.restore();
    expect(fake.disconnect).toHaveBeenCalledTimes(2); expect(fake.activate).toHaveBeenLastCalledWith(null);
    lifecycle.componentWillUnmount();
  });
  it('restores on mount and renews thirty seconds before expiry, with no rendered gate', async () => {
    fake.appState.addEventListener.mockReturnValue({ remove: vi.fn() });
    const lifecycle = new AuthSessionLifecycle({}); lifecycle.componentDidMount();
    expect(lifecycle.render()).toBeNull(); expect(fake.controller.restore).toHaveBeenCalledTimes(1);
    expect(fake.activate).toHaveBeenCalledWith(fake.controller.getSnapshot().user!.id);
    await vi.advanceTimersByTimeAsync(60_001); expect(fake.controller.restore).toHaveBeenCalledTimes(2);
    lifecycle.componentWillUnmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('stops its renewal clock in the background and cleans subscriptions/timers on unmount', async () => {
    let changed!: (state: string) => void; const remove = vi.fn();
    fake.appState.addEventListener.mockImplementation((_name, callback) => { changed = callback; return { remove }; });
    const lifecycle = new AuthSessionLifecycle({}); lifecycle.componentDidMount();
    fake.appState.currentState = 'background'; changed('background'); await vi.advanceTimersByTimeAsync(120_000); expect(fake.controller.restore).toHaveBeenCalledTimes(1);
    fake.appState.currentState = 'active'; changed('active'); expect(fake.controller.restore).toHaveBeenCalledTimes(2);
    lifecycle.componentWillUnmount(); expect(remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['error','offline','anonymous','loading'])('does not replace a Google %s result when its account picker returns to the app', async status => {
    let changed!: (state: string) => void;
    fake.appState.addEventListener.mockImplementation((_name, callback) => { changed = callback; return { remove: vi.fn() }; });
    const lifecycle = new AuthSessionLifecycle({}); lifecycle.componentDidMount();
    await Promise.resolve(); fake.state.status = status; fake.state.user = null; fake.state.message = 'Google sign-in did not finish';
    fake.appState.currentState = 'background'; changed('background');
    fake.appState.currentState = 'active'; changed('active');
    expect(fake.controller.restore).toHaveBeenCalledTimes(1);
    expect(fake.state.message).toBe('Google sign-in did not finish');
    lifecycle.componentWillUnmount();
  });
});
