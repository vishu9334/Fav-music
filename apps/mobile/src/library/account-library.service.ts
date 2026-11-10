import { CloudLibraryRepository } from './cloud-library.repository';
import { AccountLibraryCodec } from '@aadat/contracts';
import { DemoCatalog, demoCatalog } from '../catalog/demo-catalog';
import { isCatalogId } from '../catalog/catalog-api';
import { ExpoDocumentStorage, FileLibraryRepository } from './file-library.repository';
import { GuestImportPlan, GuestImportService } from './guest-import.service';
import { emptyLibrary, IDocumentStorage, ILibraryRepository, LocalLibrary } from './library.contract';
import { LibraryService } from './library.service';

export interface AccountLibrarySnapshot { readonly scope: string | null; readonly data: LocalLibrary; readonly status: 'locked' | 'loading' | 'ready' | 'error'; readonly error: string | null }
type Entry = { readonly key: string; readonly service: LibraryService };
export type LibraryRepositoryFactory = (userId: string | null) => ILibraryRepository;
export function accountLibraryRepositories(storage: IDocumentStorage = new ExpoDocumentStorage(), cloud = false): LibraryRepositoryFactory {
  return (userId) => {
    if (userId !== null && !isCatalogId(userId)) throw new Error('A verified account identity is required.');
    const local = new FileLibraryRepository(storage, userId === null ? 'aadat-library-v1' : `aadat-library-account-v1-${userId.toLowerCase()}`);
    return userId === null || !cloud ? local : new CloudLibraryRepository(userId,storage,local);
  };
}

/** Serializes scope changes with every mutation, so late saves cannot enter another account. */
export class AccountLibraryService {
  private readonly entries = new Map<string, Entry>();
  private current: Entry | null = null;
  private requested: string | null = null;
  private generation = 0;
  private pending: Promise<unknown> = Promise.resolve();
  private planSerial = 0;
  private activation: { key: string; promise: Promise<void> } | null = null;
  private plan: { id: string; generation: number; account: string; guest: string } | null = null;
  public constructor(private readonly repositories: LibraryRepositoryFactory,
    private readonly changed: (snapshot: AccountLibrarySnapshot) => void,
    private readonly registry: DemoCatalog = demoCatalog, private readonly authenticatedOnly = false) {}
  private key(scope: string | null): string { return scope === null ? 'guest' : scope.toLowerCase(); }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation); this.pending = result.catch(() => {}); return result;
  }
  private entry(scope: string | null): Entry {
    const key = this.key(scope); let entry = this.entries.get(key);
    if (!entry) {
      const service = new LibraryService(this.repositories(scope), this.registry, (data) => {
        if (this.current?.service === service && this.key(this.requested) === key) this.changed({ scope, data, status: 'ready', error: null });
      });
      entry = { key, service }; this.entries.set(key, entry);
    }
    return entry;
  }
  public activate(scope: string | null): Promise<void> {
    if (scope !== null && !isCatalogId(scope)) return Promise.reject(new Error('A verified account identity is required.'));
    if (scope === null && this.authenticatedOnly) {
      this.requested = null; this.generation++; this.current = null; this.plan = null;
      this.changed({ scope: null, data: emptyLibrary(), status: 'locked', error: null });
      return Promise.resolve(); // Legacy files stay quarantined; never hydrate them as an active user.
    }
    if (this.activation?.key === this.key(scope) && this.key(this.requested) === this.key(scope)) return this.activation.promise;
    if (this.key(scope) === this.key(this.requested) && this.current?.key === this.key(scope)) return Promise.resolve();
    this.requested = scope; const generation = ++this.generation; this.plan = null;
    this.changed({ scope, data: emptyLibrary(), status: 'loading', error: null });
    const promise = this.serialize(async () => {
      if (generation !== this.generation) return;
      try {
        const entry = this.entry(scope); this.current = null; await entry.service.initialize();
        if (generation !== this.generation) return;
        this.current = entry;
        this.changed({ scope, data: entry.service.getSnapshot(), status: 'ready', error: null });
        // Inactive data stays on disk; bound retained service/repository instances.
        for (const [key] of this.entries) if (this.entries.size > 8 && key !== entry.key && key !== 'guest') this.entries.delete(key);
      } catch (error) {
        if (generation !== this.generation) return;
        if (generation === this.generation) { this.current = null; this.changed({ scope, data: emptyLibrary(), status: 'error', error: 'These collections could not be opened. Their files were preserved.' }); }
        throw error;
      }
    }).finally(() => { if (this.activation?.promise === promise) this.activation = null; });
    this.activation = { key: this.key(scope), promise }; return promise;
  }
  public run<T>(operation: (service: LibraryService) => Promise<T>): Promise<T> {
    const generation = this.generation, key = this.key(this.requested);
    return this.serialize(async () => {
      if (generation !== this.generation || this.current?.key !== key) throw new Error('The active account changed. Retry the action in the current collection.');
      const result = await operation(this.current.service);
      if (generation !== this.generation) throw new Error('The account changed while saving. The original collection was kept in its own journal.');
      return result;
    });
  }
  private async inspectPriorDeviceReferences(): Promise<void> {
    if (!this.authenticatedOnly) return;
    const raw = await this.repositories(null).load();
    if (!raw || typeof raw !== 'object') return; // Normal library validation handles corrupt formats.
    const value = raw as Record<string, unknown>, refs: unknown[] = [];
    for (const key of ['likes', 'favourites', 'bookmarks', 'warehouse']) if (Array.isArray(value[key])) refs.push(...value[key]);
    if (Array.isArray(value.playlists)) for (const playlist of value.playlists) if (playlist && Array.isArray(playlist.trackIds)) refs.push(...playlist.trackIds);
    for (const key of ['warehouseStates', 'instamus', 'history']) if (Array.isArray(value[key])) for (const entry of value[key]) {
      if (entry?.trackId !== null) refs.push(entry?.trackId);
    }
    // Inspect before LibraryService's legacy normalization can hide unknown sample references.
    if (refs.some(id => !AccountLibraryCodec.id(id))) throw new Error('This previous device collection includes unsupported song references. Its files are preserved; review those songs before account transfer.');
  }
  public previewGuestImport(): Promise<GuestImportPlan> {
    const generation = this.generation;
    return this.run(async (service) => {
      if (this.requested === null) throw new Error('Sign in with a verified account before copying guest collections.');
      await this.inspectPriorDeviceReferences();
      const guest = this.entry(null).service; await guest.initialize();
      if (generation !== this.generation) throw new Error('The account changed. Review guest collections again.');
      const source = guest.getSnapshot(), account = service.getSnapshot(), merged = new GuestImportService().merge(account, source);
      if (this.authenticatedOnly) {
        try { AccountLibraryCodec.parse(merged.data); }
        catch { throw new Error('This previous device collection includes unsupported song references. Its files are preserved; review those songs before account transfer.'); }
      }
      const id = `guest-preview-${++this.planSerial}`;
      this.plan = { id, generation: this.generation, account: JSON.stringify(account), guest: JSON.stringify(source) };
      return { id, summary: merged.summary };
    });
  }
  public applyGuestImport(id: string): Promise<void> {
    return this.run(async (service) => {
      const plan = this.plan;
      if (this.requested === null || !plan || plan.id !== id || plan.generation !== this.generation) throw new Error('This preview is no longer current. Review guest collections again.');
      const guest = this.entry(null).service; await guest.initialize();
      if (JSON.stringify(guest.getSnapshot()) !== plan.guest) throw new Error('Guest collections changed. Review a fresh preview.');
      await service.importGuest(guest.getSnapshot(), plan.account); this.plan = null;
    });
  }
}
