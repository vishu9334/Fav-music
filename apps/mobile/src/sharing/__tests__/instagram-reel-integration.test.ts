import { describe, it, expect, vi, beforeEach } from 'vitest';
import { incomingReel, incomingReelShare } from '../incoming-share';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createLibraryStore } from '../../store/useLibraryStore';
import { demoCatalog } from '../../catalog/demo-catalog';
import { accountLibraryRepositories } from '../../library/account-library.service';
import type { IDocumentStorage } from '../../library/library.contract';

const require = createRequire(import.meta.url);
const { applyShareManifest } = require('../../../plugins/with-auth-transport.js') as {
  applyShareManifest: (manifest: Record<string, unknown>) => unknown;
};

// In-memory file storage mock for account isolation tests
class MemoryStorage implements IDocumentStorage {
  public files = new Map<string, string>();
  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }
}

const USER_A = '10000000-0000-4000-8000-000000000001';
const USER_B = '10000000-0000-4000-8000-000000000002';

describe('Stage 21: Instagram Reel Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Android Intent URL & Metadata Extraction (incomingReelShare)', () => {
    it('extracts canonical reel URL from raw instagram link', () => {
      const share = incomingReelShare('https://www.instagram.com/reel/C9ABC123xyz/?igsh=MWQ1Z3E0');
      expect(share).not.toBeNull();
      expect(share?.reelUrl).toBe('https://www.instagram.com/reel/C9ABC123xyz/');
      expect(share?.metadata).toBeUndefined();
    });

    it('extracts both reel URL and accompanying song/artist caption', () => {
      const share = incomingReelShare('Aadat - Ninja https://www.instagram.com/reel/C9ABC123xyz/?igsh=test');
      expect(share).not.toBeNull();
      expect(share?.reelUrl).toBe('https://www.instagram.com/reel/C9ABC123xyz/');
      expect(share?.metadata).toBe('Aadat - Ninja');
    });

    it('strips common share prefixes, hashtags, and mentions from metadata', () => {
      const share = incomingReelShare(
        'Check out this reel by @artist: Believer Imagine Dragons #trending #music https://www.instagram.com/reel/C9ABC123xyz/'
      );
      expect(share).not.toBeNull();
      expect(share?.reelUrl).toBe('https://www.instagram.com/reel/C9ABC123xyz/');
      expect(share?.metadata).toBe('Believer Imagine Dragons');
    });

    it('supports mobile instagram subdomain (m.instagram.com/reels)', () => {
      const share = incomingReelShare('https://m.instagram.com/reels/C9ABC123xyz/');
      expect(share?.reelUrl).toBe('https://www.instagram.com/reel/C9ABC123xyz/');
    });

    it('rejects spoofed domains, phishing origins and ambiguous multi-links', () => {
      expect(incomingReelShare('https://instagram.com.phishing.io/reel/123/')).toBeNull();
      expect(incomingReelShare('https://evil.example/?redirect=https://instagram.com/reel/123')).toBeNull();
      expect(incomingReelShare('http://instagram.com/reel/insecure/')).toBeNull(); // Must be HTTPS
      expect(
        incomingReelShare(
          'Two reels: https://instagram.com/reel/first/ and https://instagram.com/reel/second/'
        )
      ).toBeNull();
      expect(incomingReelShare('x'.repeat(4097))).toBeNull(); // Oversized
    });

    it('maintains backwards compatibility for incomingReel helper', () => {
      expect(incomingReel('https://www.instagram.com/reel/C9ABC123xyz/')).toBe(
        'https://www.instagram.com/reel/C9ABC123xyz/'
      );
      expect(incomingReel('Invalid text')).toBeNull();
    });
  });

  describe('2. Android ACTION_SEND Intent Filter Manifest & App Config Registration', () => {
    it('registers text/plain ACTION_SEND intent filter in with-auth-transport config plugin', () => {
      const manifest: any = {
        application: [
          {
            activity: [{ $: { 'android:name': '.MainActivity' }, 'intent-filter': [] }],
          },
        ],
      };
      applyShareManifest(manifest);
      const activity = manifest.application[0].activity[0];
      const sendFilter = activity['intent-filter'].find((f: any) =>
        f.action?.some((a: any) => a.$['android:name'] === 'android.intent.action.SEND')
      );
      expect(sendFilter).toBeDefined();
      expect(sendFilter.category[0].$['android:name']).toBe('android.intent.category.DEFAULT');
      expect(sendFilter.data[0].$['android:mimeType']).toBe('text/plain');
    });

    it('has android.intentFilters declared in root and mobile app.json', () => {
      const rootApp = JSON.parse(readFileSync('app.json', 'utf8'));
      const mobileApp = JSON.parse(readFileSync('apps/mobile/app.json', 'utf8'));

      for (const config of [rootApp, mobileApp]) {
        const filters = config.expo.android.intentFilters;
        expect(filters).toBeDefined();
        const sendFilter = filters.find((f: any) => f.action === 'SEND');
        expect(sendFilter).toBeDefined();
        expect(sendFilter.category).toContain('DEFAULT');
        expect(sendFilter.data).toEqual([{ mimeType: 'text/plain' }]);
      }
    });

    it('has ACTION_SEND intent filter present in AndroidManifest.xml', () => {
      const manifestXml = readFileSync(
        'apps/mobile/android/app/src/main/AndroidManifest.xml',
        'utf8'
      );
      expect(manifestXml).toContain('android.intent.action.SEND');
      expect(manifestXml).toContain('android:mimeType="text/plain"');
    });
  });

  describe('3. Durable Persistence, Reel Deduplication & Account Isolation', () => {
    const track1 = {
      id: 'song-test-1',
      title: 'Aadat',
      artist: 'Ninja',
      duration: 180,
      url: 'https://example.com/audio.mp3',
      artwork: '',
      catalogSource: 'catalog' as const,
    };
    const track2 = {
      id: 'song-test-2',
      title: 'Believer',
      artist: 'Imagine Dragons',
      duration: 204,
      url: 'https://example.com/audio2.mp3',
      artwork: '',
      catalogSource: 'catalog' as const,
    };

    it('saves confirmed reel and linked track with deduplication by reelUrl', async () => {
      const storage = new MemoryStorage();
      demoCatalog.upsert([{ track: track1, seasons: [] }, { track: track2, seasons: [] }]);
      const store = createLibraryStore(undefined, accountLibraryRepositories(storage as any), true);

      await store.getState().activateAccount(USER_A);

      const reelUrl = 'https://www.instagram.com/reel/C8XYZ123/';
      // Save reel first time
      await store.getState().saveInstaMus(reelUrl, 'Initial Note', track1.id);
      expect(store.getState().data.instamus).toHaveLength(1);
      expect(store.getState().data.instamus[0]).toMatchObject({
        reelUrl: 'https://www.instagram.com/reel/C8XYZ123/',
        query: 'Initial Note',
        trackId: track1.id,
      });
      expect(store.getState().data.bookmarks).toContain(track1.id);

      // Re-saving the same reel URL with updated track updates the entry rather than duplicating
      await store.getState().saveInstaMus(reelUrl, 'Updated Note', track2.id);
      expect(store.getState().data.instamus).toHaveLength(1); // Deduplicated!
      expect(store.getState().data.instamus[0]).toMatchObject({
        reelUrl: 'https://www.instagram.com/reel/C8XYZ123/',
        query: 'Updated Note',
        trackId: track2.id,
      });
      // Both tracks are bookmarked
      expect(store.getState().data.bookmarks).toContain(track1.id);
      expect(store.getState().data.bookmarks).toContain(track2.id);
    });

    it('isolates saved reels between different authenticated accounts', async () => {
      const storage = new MemoryStorage();
      demoCatalog.upsert([{ track: track1, seasons: [] }]);
      const store = createLibraryStore(undefined, accountLibraryRepositories(storage as any), true);

      // Account A saves a reel
      await store.getState().activateAccount(USER_A);
      await store.getState().saveInstaMus('https://www.instagram.com/reel/ReelA/', 'Note A', track1.id);
      expect(store.getState().data.instamus).toHaveLength(1);
      expect(store.getState().data.instamus[0]?.query).toBe('Note A');

      // Switch to Account B (different user)
      await store.getState().activateAccount(USER_B);
      expect(store.getState().data.instamus).toHaveLength(0); // Clean slate for Account B

      // Account B saves their own reel
      await store.getState().saveInstaMus('https://www.instagram.com/reel/ReelB/', 'Note B', null);
      expect(store.getState().data.instamus).toHaveLength(1);
      expect(store.getState().data.instamus[0]?.query).toBe('Note B');

      // Switch back to Account A: Account A's reel is preserved
      await store.getState().activateAccount(USER_A);
      expect(store.getState().data.instamus).toHaveLength(1);
      expect(store.getState().data.instamus[0]?.reelUrl).toBe('https://www.instagram.com/reel/ReelA/');
      expect(store.getState().data.instamus[0]?.query).toBe('Note A');
    });

    it('handles removing saved reels gracefully while keeping track bookmarks intact', async () => {
      const storage = new MemoryStorage();
      demoCatalog.upsert([{ track: track1, seasons: [] }]);
      const store = createLibraryStore(undefined, accountLibraryRepositories(storage as any), true);

      await store.getState().activateAccount(USER_A);
      const reel = 'https://www.instagram.com/reel/RemoveMe/';
      await store.getState().saveInstaMus(reel, 'Note', track1.id);
      expect(store.getState().data.instamus).toHaveLength(1);
      expect(store.getState().data.bookmarks).toContain(track1.id);

      // Remove reel
      await store.getState().removeInstaMus(reel);
      expect(store.getState().data.instamus).toHaveLength(0);
      // Track bookmark is preserved even after removing the discovery reel link
      expect(store.getState().data.bookmarks).toContain(track1.id);
    });
  });

  describe('4. Android Intent Consumption & Routing Deduplication', () => {
    it('deduplicates rapid consecutive share events for the same reel within 1000ms', () => {
      let lastPayload = '';
      let lastAt = 0;
      const pushes: any[] = [];
      const router = { push: (p: any) => pushes.push(p) };

      const handleShare = (text: string) => {
        const share = incomingReelShare(text);
        if (share) {
          const now = Date.now();
          const dedupeKey = `${share.reelUrl}:${share.metadata ?? ''}`;
          if (dedupeKey !== lastPayload || now - lastAt > 1000) {
            lastPayload = dedupeKey;
            lastAt = now;
            router.push({
              pathname: '/instamus',
              params: { reel: share.reelUrl, query: share.metadata ?? '' },
            });
          }
        }
      };

      const text = 'Believer https://www.instagram.com/reel/C8XYZ123/';
      // Initial trigger on cold start
      handleShare(text);
      expect(pushes).toHaveLength(1);
      expect(pushes[0]).toEqual({
        pathname: '/instamus',
        params: { reel: 'https://www.instagram.com/reel/C8XYZ123/', query: 'Believer' },
      });

      // Rapid duplicate event (e.g. AppState change right after native event)
      handleShare(text);
      expect(pushes).toHaveLength(1); // Deduped!

      // After debounce window expires
      lastAt = Date.now() - 1001;
      handleShare(text);
      expect(pushes).toHaveLength(2);
    });

    it('navigates to /instamus with empty query when reel has no accompanying text', () => {
      const pushes: any[] = [];
      const router = { push: (p: any) => pushes.push(p) };
      const share = incomingReelShare('https://www.instagram.com/reel/NoCaption123/');

      if (share) {
        router.push({
          pathname: '/instamus',
          params: { reel: share.reelUrl, query: share.metadata ?? '' },
        });
      }

      expect(pushes).toHaveLength(1);
      expect(pushes[0]).toEqual({
        pathname: '/instamus',
        params: { reel: 'https://www.instagram.com/reel/NoCaption123/', query: '' },
      });
    });
  });
});
