import type { CatalogMediaKind } from '@aadat/contracts';
import { ICatalogRepository } from './catalog-api';

/** Signed URLs are memory-only, bounded and renewed before their usable lifetime ends. */
export class MediaLeaseService {
  private readonly leases = new Map<string, { url: string; deadline: number }>();
  private readonly pending = new Map<string, Promise<ReadonlyMap<string, string>>>();
  public constructor(private readonly repository: ICatalogRepository, private readonly now: () => number = Date.now) {}
  public async resolve(ids: readonly string[], kind: CatalogMediaKind, force = false): Promise<ReadonlyMap<string, string>> {
    const result = new Map<string, string>(), missing: string[] = [];
    for (const id of [...new Set(ids)]) {
      const key = `${kind}:${id}`, lease = this.leases.get(key);
      if (!force && lease && lease.deadline > this.now()) result.set(id, lease.url); else missing.push(id);
    }
    for (let start = 0; start < missing.length; start += 50) {
      const batch = missing.slice(start, start + 50), key = `${kind}:${[...batch].sort().join(',')}`;
      let request = this.pending.get(key);
      if (!request) {
        request = (async () => {
          const leases = await this.repository.media(batch, kind), urls = new Map<string, string>();
          if (leases.length !== batch.length || new Set(leases.map((lease) => lease.trackId)).size !== batch.length || leases.some((lease) => !batch.includes(lease.trackId) || lease.kind !== kind)) throw new Error('Invalid media lease identities.');
          for (const lease of leases) {
            const deadline = this.now() + Math.max(0, (lease.expiresInSeconds ?? lease.refreshAfterSeconds ?? 0) * 1000 - 30_000);
            if (deadline <= this.now()) throw new Error('This media lease expires too soon. Retry playback.');
            this.leases.set(`${kind}:${lease.trackId}`, { url: lease.url, deadline }); urls.set(lease.trackId, lease.url);
          }
          while (this.leases.size > 1000) this.leases.delete(this.leases.keys().next().value!);
          return urls;
        })().finally(() => this.pending.delete(key)); this.pending.set(key, request);
      }
      for (const [id, url] of await request) result.set(id, url);
    }
    return result;
  }
}
