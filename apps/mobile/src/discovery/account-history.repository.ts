import type { IHistoryRepository, ListeningHistory } from './discovery.types';
import { useLibraryStore } from '../store/useLibraryStore';
/** The owner is captured when a history service is created, never looked up after a delayed write. */
export class AccountHistoryRepository implements IHistoryRepository {
  private readonly owner: string | null;
  private readonly version: number;
  public constructor(owner = useLibraryStore.getState().scope, version = useLibraryStore.getState().scopeVersion) {
    this.owner = owner;
    this.version = version;
  }
  private check(): void {
    const current = useLibraryStore.getState();
    if (!this.owner || current.scope !== this.owner || current.scopeVersion !== this.version || current.status !== 'ready') {
      throw new Error('Sign in to open your listening history.');
    }
  }
  public async load(): Promise<ListeningHistory> {
    this.check();
    return { version: 1, entries: useLibraryStore.getState().data.history ?? [] };
  }
  public async save(data: ListeningHistory): Promise<ListeningHistory> {
    this.check();
    await useLibraryStore.getState().saveHistory(data.entries);
    this.check();
    return this.load();
  }
}
