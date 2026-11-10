import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MusicProviderError } from '../contracts/music-provider.contract.js';
import type { IProviderIdentityRepository, ProviderReference } from '../contracts/provider-identity.contract.js';
interface Journal {
    revision: number;
    entries: Record<string, ProviderReference>;
}
export function providerSongId(reference: ProviderReference): string {
    const b = createHash('sha256').update(JSON.stringify(['aadat-music-recording-v1', reference.provider, reference.kind, reference.externalId])).digest().subarray(0, 16);
    b[6] = (b[6]! & 15) | 128;
    b[8] = (b[8]! & 63) | 128;
    const h = b.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/** Development metadata crosswalk, never a media cache. Two atomic slots survive an interrupted save.
 * Production must move this durable identity index to separately approved infrastructure.
 */
export class FileProviderIdentityRepository implements IProviderIdentityRepository {
    private state: Journal | null = null;
    private slot = 1;
    private pending: Promise<unknown> = Promise.resolve();
    constructor(private readonly filename: string, private readonly aliases: ReadonlyMap<string, string> = new Map()) { }
    private key(r: ProviderReference): string { return `${r.provider}:${r.kind}:${r.externalId}`; }
    private valid(r: ProviderReference): boolean { return !!r && /^[a-z0-9-]{1,40}$/.test(r.provider) && ['song', 'albums', 'artists', 'playlists'].includes(r.kind) && /^[A-Za-z0-9_-]{1,100}$/.test(r.externalId); }
    private async load(): Promise<Journal> {
        if (this.state)
            return this.state;
        const slots = await Promise.all([0, 1].map(async (slot) => { try {
            const text = await readFile(`${this.filename}.${slot}.json`, 'utf8');
            if (text.length > 20000000)
                throw new Error();
            const v = JSON.parse(text) as Journal;
            if (!Number.isSafeInteger(v.revision) || v.revision < 1 || !v.entries || typeof v.entries !== 'object' || Array.isArray(v.entries) || Object.keys(v.entries).length > 100000 || Object.entries(v.entries).some(([id, r]) => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id) || !this.valid(r)))
                throw new Error();
            return { slot, value: v, missing: false };
        }
        catch (error) {
            return { slot, value: null, missing: (error as {
                    code?: string;
                }).code === 'ENOENT' };
        } }));
        const latest = slots.filter(s => s.value).sort((a, b) => b.value!.revision - a.value!.revision)[0];
        if (!latest) {
            if (slots.some(s => !s.missing))
                throw new MusicProviderError('UNAVAILABLE', 'The provider identity index is unreadable. Files were preserved.');
            this.state = { revision: 0, entries: {} };
        }
        else {
            this.state = latest.value!;
            this.slot = latest.slot;
        }
        return this.state;
    }
    public async find(id: string): Promise<ProviderReference | null> { await this.pending; const entries = (await this.load()).entries; return Object.hasOwn(entries, id) ? entries[id]! : null; }
    public remember(reference: ProviderReference): Promise<string> {
        const action = this.pending.then(async () => {
            if (!this.valid(reference))
                throw new MusicProviderError('INVALID_REQUEST', 'Invalid provider identity.');
            const state = await this.load(), id = this.aliases.get(this.key(reference)) ?? providerSongId(reference);
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
                throw new MusicProviderError('INVALID_REQUEST', 'Invalid canonical crosswalk.');
            const prior = state.entries[id];
            if (prior && this.key(prior) === this.key(reference))
                return id;
            // A replacement source needs an explicit reviewed alias; no fuzzy title/artist merge.
            if (prior && !this.aliases.has(this.key(reference)))
                throw new MusicProviderError('INVALID_RESPONSE', 'Provider identity collision.');
            if (!prior && Object.keys(state.entries).length >= 100000)
                throw new MusicProviderError('UNAVAILABLE', 'Provider identity index capacity reached. Existing references remain preserved.');
            const next = { revision: state.revision + 1, entries: { ...state.entries, [id]: reference } }, slot = 1 - this.slot, target = `${this.filename}.${slot}.json`, temporary = `${target}.${randomUUID()}.tmp`;
            await mkdir(dirname(target), { recursive: true, mode: 0o700 });
            await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
            await rename(temporary, target);
            this.state = next;
            this.slot = slot;
            return id;
        });
        this.pending = action.catch(() => { });
        return action;
    }
}
