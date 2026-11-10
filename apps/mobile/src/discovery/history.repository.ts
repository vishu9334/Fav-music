import { ExpoDocumentStorage } from '../library/file-library.repository';
import { IDocumentStorage } from '../library/library.contract';
import { IHistoryRepository, ListeningHistory } from './discovery.types';

/** Independent journal: history writes cannot overwrite playlists or Warehouse metadata. */
export class HistoryRepository implements IHistoryRepository {
  private revision = 0;
  private slot = 1;
  public constructor(private readonly storage: IDocumentStorage = new ExpoDocumentStorage()) {}
  private name(slot: number): string { return `aadat-history-v1-${slot}.json`; }
  public async load(): Promise<unknown | null> {
    const records = await Promise.all([0, 1].map(async (slot) => {
      const text = await this.storage.read(this.name(slot));
      if (text === null) return { slot, missing: true };
      try {
        const value = JSON.parse(text) as { revision?: unknown; data?: unknown };
        if (!Number.isSafeInteger(value.revision) || (value.revision as number) <= 0 || !value.data || typeof value.data !== 'object') throw new Error();
        return { slot, missing: false, revision: value.revision as number, data: value.data };
      } catch { return { slot, missing: false }; }
    }));
    const latest = records.filter((record) => record.revision !== undefined).sort((a, b) => b.revision! - a.revision!)[0];
    if (!latest) {
      if (records.every((record) => record.missing)) return null;
      throw new Error('Saved listening history could not be read. Its files have been preserved.');
    }
    this.revision = latest.revision!; this.slot = latest.slot; return latest.data;
  }
  public async save(data: ListeningHistory): Promise<void> {
    const revision = this.revision + 1, slot = 1 - this.slot;
    if (!Number.isSafeInteger(revision)) throw new Error('Listening history revision limit reached.');
    await this.storage.write(this.name(slot), JSON.stringify({ revision, data }));
    this.revision = revision; this.slot = slot;
  }
}
