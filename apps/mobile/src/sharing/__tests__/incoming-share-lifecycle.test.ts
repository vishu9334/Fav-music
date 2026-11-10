import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  effect: undefined as undefined | (() => void),
  auth: { status: 'authenticated', user: { id: 'account-a' } },
  library: { status: 'loading', scope: 'account-a' },
  authChanged: undefined as undefined | (() => void), libraryChanged: undefined as undefined | (() => void),
  shared: undefined as undefined | (() => void),
  consume: vi.fn(), push: vi.fn(),
}));
vi.mock('react', () => ({ useEffect: (effect: () => () => void) => { h.effect = effect(); } }));
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  DeviceEventEmitter: { addListener: (_: string, callback: () => void) => { h.shared = callback; return { remove: vi.fn() }; } },
  NativeModules: { AadatShare: { consume: h.consume } },
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('../sharing', () => ({ shareLinks: { parse: () => ({ type: 'reel' }) } }));
vi.mock('../../auth/auth.module', () => ({ AuthModule: { getController: () => ({
  getSnapshot: () => h.auth, subscribe: (callback: () => void) => { h.authChanged = callback; return vi.fn(); },
}) } }));
vi.mock('../../store/useLibraryStore', () => ({ useLibraryStore: {
  getState: () => h.library, subscribe: (callback: () => void) => { h.libraryChanged = callback; return vi.fn(); },
} }));
import { IncomingShareLifecycle } from '../IncomingShareLifecycle';
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => {
  h.effect?.(); vi.clearAllMocks(); h.auth = { status: 'authenticated', user: { id: 'account-a' } };
  h.library = { status: 'loading', scope: 'account-a' }; h.consume.mockResolvedValue(null);
});
describe('Android share delivery after account hydration', () => {
  it('leaves the native share pending until the correct account library is ready', async () => {
    h.consume.mockResolvedValueOnce('Aadat — Ninja https://www.instagram.com/reel/CaptionFixture/');
    IncomingShareLifecycle(); expect(h.consume).not.toHaveBeenCalled();
    h.library.status = 'ready'; h.libraryChanged!(); await settle();
    expect(h.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/instamus', params: {
      reel: 'https://www.instagram.com/reel/CaptionFixture/', query: 'Aadat — Ninja', import: '1', owner: 'account-a',
    } });
  });
  it('does not consume for a different account or deliver a consumed share after account switching', async () => {
    h.library = { status: 'ready', scope: 'account-b' }; IncomingShareLifecycle();
    expect(h.consume).not.toHaveBeenCalled();
    let release!: (text: string) => void;
    h.consume.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve; }));
    h.library.scope = 'account-a'; h.libraryChanged!();
    h.auth.user.id = 'account-b'; release('https://www.instagram.com/reel/OldAccount/'); await settle();
    expect(h.push).not.toHaveBeenCalled();
  });
});
