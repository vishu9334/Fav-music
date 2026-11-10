import type { CatalogSong } from '@aadat/contracts';
import { ExpoDocumentStorage } from '../library/file-library.repository';
import { IDocumentStorage } from '../library/library.contract';
import { validateSong } from './catalog-api';

/** Metadata only: private keys, signed URLs and native player objects never enter this cache. */
export class CatalogMetadataCache {
  private revision = 0; private slot = 1;
  private pending: Promise<void> = Promise.resolve();
  public constructor(private readonly storage: IDocumentStorage = new ExpoDocumentStorage()) {}
  private name(slot: number): string { return `aadat-catalog-metadata-v1-${slot}.json`; }
  public async load(): Promise<readonly CatalogSong[]> {
    const records = await Promise.all([0, 1].map(async (slot) => {
      const text = await this.storage.read(this.name(slot)); if (text === null) return { slot, missing: true };
      try {
        const value = JSON.parse(text) as { version?: unknown; revision?: unknown; songs?: unknown };
        if (value.version !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || !Array.isArray(value.songs) || value.songs.length > 500) throw new Error();
        return { slot, missing: false, revision: value.revision as number, songs: value.songs.map(validateSong) };
      } catch { return { slot, missing: false }; }
    }));
    const latest = records.filter((r) => r.revision !== undefined).sort((a, b) => b.revision! - a.revision!)[0];
    if (!latest) { if (records.every((r) => r.missing)) return []; throw new Error('Saved catalog metadata is unreadable. Its files were preserved.'); }
    this.revision = latest.revision!; this.slot = latest.slot; return latest.songs!;
  }
  public save(songs: readonly CatalogSong[]): Promise<void> {
    const sanitized = songs.slice(-500).map(validateSong);
    const action = this.pending.then(async () => {
      const revision = this.revision + 1, slot = 1 - this.slot;
      if (!Number.isSafeInteger(revision)) throw new Error('Catalog cache revision limit reached.');
      await this.storage.write(this.name(slot), JSON.stringify({ version: 1, revision, songs: sanitized })); this.revision = revision; this.slot = slot;
    });
    this.pending = action.catch(() => {}); return action;
  }
}
