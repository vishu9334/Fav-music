import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogPage, CatalogQuery } from '@aadat/contracts';
import { createCatalogStore } from '../../store/createCatalogStore';
import { catalogQueryKey } from '../catalog-query';
import { DemoCatalog } from '../demo-catalog';
import { useDebouncedValue } from '../use-debounced-value';

const hookState = {
  state: undefined as any,
  hasState: false,
  ref: { current: null as any },
  cleanup: undefined as (() => void) | void,
  prevDeps: null as any[] | null,
  reset() {
    this.state = undefined;
    this.hasState = false;
    this.ref = { current: null };
    this.cleanup = undefined;
    this.prevDeps = null;
  },
};

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: any) => {
      if (!hookState.hasState) {
        hookState.state = typeof initial === 'function' ? initial() : initial;
        hookState.hasState = true;
      }
      return [
        hookState.state,
        (next: any) => {
          hookState.state = typeof next === 'function' ? next(hookState.state) : next;
        },
      ];
    },
    useRef: () => hookState.ref,
    useEffect: (effect: () => void | (() => void), deps?: any[]) => {
      const changed = !hookState.prevDeps || !deps || deps.some((d, i) => !Object.is(d, hookState.prevDeps![i]));
      if (changed) {
        if (hookState.cleanup) {
          hookState.cleanup();
          hookState.cleanup = undefined;
        }
        hookState.prevDeps = deps ? [...deps] : null;
        hookState.cleanup = effect();
      }
    },
  };
});

describe('Stage 20: Search Performance, Cancellation, and Caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('300ms Search Input Debouncing (useDebouncedValue)', () => {
    it('debounces rapid typing and updates only after 300ms', () => {
      vi.useFakeTimers();
      hookState.reset();

      // Initial render
      let value = useDebouncedValue('', 300);
      expect(value).toBe('');

      // User types "B"
      value = useDebouncedValue('B', 300);
      expect(value).toBe(''); // Not updated yet

      // 100ms later user types "Be"
      vi.advanceTimersByTime(100);
      value = useDebouncedValue('Be', 300);
      expect(value).toBe('');

      // 100ms later user types "Bel"
      vi.advanceTimersByTime(100);
      value = useDebouncedValue('Bel', 300);
      expect(value).toBe('');

      // 299ms after last keystroke: still not updated
      vi.advanceTimersByTime(299);
      expect(hookState.state).toBe('');

      // 300ms after last keystroke: updates!
      vi.advanceTimersByTime(1);
      expect(hookState.state).toBe('Bel');

      value = useDebouncedValue('Bel', 300);
      expect(value).toBe('Bel');

      vi.useRealTimers();
    });

    it('immediately resets to empty string when search is cleared without delay', () => {
      vi.useFakeTimers();
      hookState.reset();

      let value = useDebouncedValue('Believer', 300);
      vi.advanceTimersByTime(300);
      value = useDebouncedValue('Believer', 300);
      expect(value).toBe('Believer');

      // Clear search immediately
      value = useDebouncedValue('', 300);
      expect(value).toBe(''); // Immediately empty, no 300ms lag

      vi.useRealTimers();
    });
  });

  describe('Independent screen requests', () => {
    it('finishes both pages when a newer query is selected, without replacing the selected page', async () => {
      const releases = new Map<string, (page: CatalogPage) => void>();
      const client = { initialize: async () => {}, cacheError: null,
        page: vi.fn((query: CatalogQuery) => new Promise<CatalogPage>(resolve => releases.set(query.query!, resolve))) };
      const store = createCatalogStore(client, new DemoCatalog(), { resolve: async () => new Map() }, () => true);
      const first = store.getState().load({ query: 'first' }), second = store.getState().load({ query: 'second' });
      await vi.waitFor(() => expect(releases.size).toBe(2));
      releases.get('second')!({ nodes: [], hasNextPage: false, endCursor: null }); await second;
      releases.get('first')!({ nodes: [], hasNextPage: false, endCursor: null }); await first;
      expect(store.getState().query.query).toBe('second');
      for (const query of ['first', 'second']) expect(store.getState().pages[catalogQueryKey({ query })]?.status).toBe('ready');
      await store.getState().load({ query: 'first' });
      expect(client.page).toHaveBeenCalledTimes(2);
    });
  });

  describe('Duplicate Request Deduplication', () => {
    it('shares in-flight promise when identical query is requested simultaneously', async () => {
      let resolveCall!: (page: CatalogPage) => void;
      const client = {
        initialize: async () => {},
        cacheError: null,
        page: vi.fn(async (): Promise<CatalogPage> => {
          return new Promise<CatalogPage>((res) => {
            resolveCall = res;
          });
        }),
      };

      const store = createCatalogStore(client, new DemoCatalog(), { resolve: async () => new Map() }, () => true);

      const req1 = store.getState().load({ query: 'Aadat' });
      const req2 = store.getState().load({ query: 'Aadat' });

      expect(req1).toBe(req2); // Must be the identical promise!
      await vi.waitFor(() => expect(client.page).toHaveBeenCalledTimes(1));

      resolveCall({
        nodes: [{
          id: 'song-1',
          title: 'Aadat',
          artistName: 'Ninja',
          albumName: null,
          durationSeconds: 180,
          releaseYear: 2015,
          attribution: 'Attribution',
          hasVideo: false,
          moods: [],
          timeAffinities: [],
          seasonAffinities: [],
        }],
        hasNextPage: false,
        endCursor: null,
      });

      await req1;
      expect(store.getState().ids).toEqual(['song-1']);
    });
  });

  describe('Query-Based Caching & Bounded Memory', () => {
    it('serves cached query result instantly without hitting the backend client within TTL', async () => {
      const client = {
        initialize: async () => {},
        cacheError: null,
        page: vi.fn(async (): Promise<CatalogPage> => {
          return {
            nodes: [{
              id: 'song-cached',
              title: 'Cached Song',
              artistName: 'Artist',
              albumName: null,
              durationSeconds: 200,
              releaseYear: 2020,
              attribution: 'Attribution',
              hasVideo: false,
              moods: [],
              timeAffinities: [],
              seasonAffinities: [],
            }],
            hasNextPage: false,
            endCursor: null,
          };
        }),
      };

      const store = createCatalogStore(client, new DemoCatalog(), { resolve: async () => new Map() }, () => true);

      await store.getState().load({ query: 'cached-query' });
      expect(client.page).toHaveBeenCalledTimes(1);

      // Second load for the same query within TTL
      await store.getState().load({ query: 'cached-query' });
      expect(client.page).toHaveBeenCalledTimes(1); // Cached! No network call
      expect(store.getState().ids).toEqual(['song-cached']);
    });

    it('bounds memory by evicting older queries when page count exceeds maximum', async () => {
      const client = {
        initialize: async () => {},
        cacheError: null,
        page: vi.fn(async (q: CatalogQuery): Promise<CatalogPage> => ({
          nodes: [{
            id: `id-${q.query}`,
            title: `Title ${q.query}`,
            artistName: 'Artist',
            albumName: null,
            durationSeconds: 100,
            releaseYear: null,
            attribution: 'Attribution',
            hasVideo: false,
            moods: [],
            timeAffinities: [],
            seasonAffinities: [],
          }],
          hasNextPage: false,
          endCursor: null,
        })),
      };

      const store = createCatalogStore(client, new DemoCatalog(), { resolve: async () => new Map() }, () => true);

      // Load 12 distinct queries
      for (let i = 0; i < 12; i++) {
        await store.getState().load({ query: `search-${i}` });
      }

      // Memory bound check: total stored pages must not exceed 8
      const pageCount = Object.keys(store.getState().pages).length;
      expect(pageCount).toBeLessThanOrEqual(8);
    });
  });

  describe('Pagination & Stable Scroll Integrity', () => {
    it('appends next page results to existing tracks without replacing previous items', async () => {
      const client = {
        initialize: async () => {},
        cacheError: null,
        page: vi.fn(async (q: CatalogQuery): Promise<CatalogPage> => {
          if (!q.after) {
            return {
              nodes: [{
                id: 'track-1',
                title: 'Track 1',
                artistName: 'Artist 1',
                albumName: null,
                durationSeconds: 150,
                releaseYear: null,
                attribution: 'Attr',
                hasVideo: false,
                moods: [],
                timeAffinities: [],
                seasonAffinities: [],
              }],
              hasNextPage: true,
              endCursor: 'cursor-1',
            };
          } else {
            return {
              nodes: [{
                id: 'track-2',
                title: 'Track 2',
                artistName: 'Artist 2',
                albumName: null,
                durationSeconds: 180,
                releaseYear: null,
                attribution: 'Attr',
                hasVideo: false,
                moods: [],
                timeAffinities: [],
                seasonAffinities: [],
              }],
              hasNextPage: false,
              endCursor: null,
            };
          }
        }),
      };

      const registry = new DemoCatalog();
      const store = createCatalogStore(client, registry, { resolve: async () => new Map() }, () => true);

      // Page 1
      await store.getState().load({ query: 'pagination-test' });
      expect(store.getState().ids).toEqual(['track-1']);
      expect(store.getState().hasMore).toBe(true);
      expect(store.getState().cursor).toBe('cursor-1');

      // Page 2 (Load More)
      await store.getState().load({ query: 'pagination-test' }, true);
      expect(store.getState().ids).toEqual(['track-1', 'track-2']);
      expect(store.getState().hasMore).toBe(false);
      expect(store.getState().cursor).toBeNull();
    });
  });
});
