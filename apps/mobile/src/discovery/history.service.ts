import { IHistoryRepository, ListeningHistory, PlayedTrack } from './discovery.types';
import { historyTrackId, normalizeHistory, sameHistory } from './history-normalization';

export class HistoryService {
  private data: ListeningHistory = { version: 1, entries: [] };
  private initialized = false;
  private hydration: Promise<void> | null = null;
  private pending: Promise<void> = Promise.resolve();
  private dirty = false;
  private lastRecord: {id:string;promise:Promise<void>} | null = null;
  public constructor(private readonly repository: IHistoryRepository,
    private readonly changed: (entries: readonly PlayedTrack[]) => void, private readonly now: () => number = Date.now) {}
  public initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.hydration) return this.hydration;
    this.hydration = (async () => {
      const loaded = await this.repository.load();
      if (loaded !== null) {
        if (!loaded || typeof loaded !== 'object' || (loaded as { version?: unknown }).version !== 1 || !Array.isArray((loaded as { entries?: unknown }).entries)) {
          throw new Error('This listening history format is unsupported. Its files have been preserved.');
        }
        const source = loaded as { entries: unknown[] };
        const entries = normalizeHistory(source.entries);
        // Preserve unavailable catalog IDs: history is a record, not a current catalog filter.
        this.data = { version: 1, entries };
        this.dirty = JSON.stringify(entries)!==JSON.stringify(source.entries);
      }
      this.initialized = true; this.changed(this.data.entries);
    })().finally(() => { this.hydration = null; });
    return this.hydration;
  }
  private serialize(action: () => Promise<void>): Promise<void> {
    const operation = this.pending.then(action); this.pending = operation.catch(() => {}); return operation;
  }
  private async persist(): Promise<void> {
    const saved=await this.repository.save(this.data);
    if (saved) {
      const entries=normalizeHistory([...this.data.entries,...saved.entries]);
      if(!sameHistory(entries,this.data.entries)){this.data={version:1,entries};this.changed(entries);}
    }
    this.dirty=false;
  }
  public record(trackId: string): Promise<void> {
    const id=historyTrackId(trackId);
    if(!id)return Promise.reject(new Error('This history track reference is invalid.'));
    if(this.lastRecord?.id===id)return this.lastRecord.promise;
    const now=this.now();
    if(!Number.isSafeInteger(now)||now<0)return Promise.reject(new Error('Device time is unavailable for listening history.'));
    const operation = this.serialize(async () => {
      await this.initialize();
      // Clock corrections cannot make a confirmed new play older than known history.
      const playedAt = Math.max(now,this.data.entries[0]?.playedAt??0);
      const entries=normalizeHistory([{trackId:id,playedAt},...this.data.entries]);
      if(!sameHistory(entries,this.data.entries)){
        this.data={version:1,entries};this.dirty=true;
        this.changed(entries); // Retain confirmed plays in memory if durable storage fails.
      }
      if(this.dirty)await this.persist();
    });
    const result=operation.finally(()=>{if(this.lastRecord?.promise===result)this.lastRecord=null;});
    this.lastRecord={id,promise:result};return result;
  }
  public flush(): Promise<void> {
    return this.serialize(async () => { await this.initialize(); if(this.dirty)await this.persist(); });
  }
}
