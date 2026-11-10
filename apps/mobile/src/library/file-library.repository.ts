import { IDocumentStorage, ILibraryRepository, LocalLibrary } from './library.contract';

/** App-private documents only. Catalog audio is streamed, never downloaded here. */
export class ExpoDocumentStorage implements IDocumentStorage {
  private async location(name: string): Promise<{ fs: typeof import('expo-file-system'); uri: string }> {
    const fs = await import('expo-file-system');
    if (!fs.documentDirectory) throw new Error('Local library storage is unavailable on this device.');
    return { fs, uri: fs.documentDirectory + name };
  }
  public async read(name: string): Promise<string | null> {
    const { fs, uri } = await this.location(name);
    return (await fs.getInfoAsync(uri)).exists ? fs.readAsStringAsync(uri) : null;
  }
  public async write(name: string, value: string): Promise<void> {
    const { fs, uri } = await this.location(name);
    await fs.writeAsStringAsync(uri, value);
  }
}

/** Alternate slots: an interrupted write cannot overwrite the last valid revision. */
export class DurableDocumentRepository<T> {
  private revision = 0;
  private activeSlot = 1;
  public constructor(private readonly storage: IDocumentStorage = new ExpoDocumentStorage(), private readonly namespace = 'aadat-library-v1') {
    if (!/^[a-z0-9-]{1,100}$/.test(namespace)) throw new Error('Invalid local library namespace.');
  }
  private name(slot: number): string { return `${this.namespace}-${slot}.json`; }
  public async load(): Promise<unknown | null> {
    const snapshots = await Promise.all([0, 1].map(async (slot) => {
      const text = await this.storage.read(this.name(slot));
      if (text === null) return { slot, missing: true };
      try {
        const value = JSON.parse(text) as { revision?: unknown; data?: unknown };
        if (!Number.isSafeInteger(value.revision) || (value.revision as number) <= 0 || !value.data || typeof value.data !== 'object') throw new Error();
        return { slot, missing: false, revision: value.revision as number, data: value.data };
      } catch { return { slot, missing: false }; }
    }));
    const valid = snapshots.filter((s) => s.revision !== undefined).sort((a, b) => b.revision! - a.revision!);
    const latest = valid[0];
    if (!latest) {
      if (snapshots.every((s) => s.missing)) return null;
      throw new Error('Your saved library could not be read. Retry before making changes.');
    }
    this.revision = latest.revision!; this.activeSlot = latest.slot;
    return latest.data;
  }
  public async save(data: T): Promise<void> {
    const revision = this.revision + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('Local library revision limit reached.');
    const slot = 1 - this.activeSlot;
    await this.storage.write(this.name(slot), JSON.stringify({ revision, data }));
    this.revision = revision; this.activeSlot = slot;
  }
}

export class FileLibraryRepository extends DurableDocumentRepository<LocalLibrary> implements ILibraryRepository {}
