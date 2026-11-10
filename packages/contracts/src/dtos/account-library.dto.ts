import { WarehouseStatus } from '../enums/index.js';

export interface AccountLibraryData {
  readonly version: 2;
  readonly guestImportCompleted?: true;
  readonly likes: readonly string[];
  readonly favourites: readonly string[];
  readonly bookmarks: readonly string[];
  readonly warehouse: readonly string[];
  readonly playlists: readonly { readonly id: string; readonly name: string; readonly trackIds: readonly string[] }[];
  readonly warehouseStates: readonly { readonly trackId: string; readonly status: WarehouseStatus }[];
  readonly instamus: readonly { readonly reelUrl: string; readonly query: string; readonly trackId: string | null }[];
  readonly history?: readonly { readonly trackId: string; readonly playedAt: number }[];
}
export interface AccountLibrarySnapshot { readonly revision: number; readonly data: AccountLibraryData }
export interface AccountLibraryCommit { readonly expectedRevision: number; readonly mutationId: string; readonly data: AccountLibraryData }
export interface AccountLibraryReceipt { readonly appliedRevision: number; readonly snapshot: AccountLibrarySnapshot }

/** Strict wire validation shared by both trust boundaries; never coerces or drops saved records. */
export class AccountLibraryCodec {
  public static readonly maxBytes = 240_000;
  public static id(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
  public static parse(value: unknown): AccountLibraryData {
    const fail = (): never => { throw new Error('Invalid account collection data. No records were changed.'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const v = value as Record<string, unknown>;
    if (v.version !== 2 || (v.guestImportCompleted !== undefined && v.guestImportCompleted !== true)
      || Object.keys(v).some((key) => !['version','guestImportCompleted','likes','favourites','bookmarks','warehouse','playlists','warehouseStates','instamus','history'].includes(key))) return fail();
    const ids = (a: unknown): a is string[] => Array.isArray(a) && a.length <= 5000 && a.every((id) => this.id(id)) && new Set(a).size === a.length;
    for (const key of ['likes','favourites','bookmarks','warehouse']) if (!ids(v[key])) return fail();
    if (!Array.isArray(v.playlists) || v.playlists.length > 100 || v.playlists.some((p: Record<string, unknown>) => !p || typeof p !== 'object'
      || typeof p.id !== 'string' || !/^[a-zA-Z0-9-]{1,160}$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60 || !ids(p.trackIds)
      || Object.keys(p).some((key) => !['id','name','trackIds'].includes(key))) || new Set(v.playlists.map((p: {id: string}) => p.id)).size !== v.playlists.length) return fail();
    if (!Array.isArray(v.warehouseStates) || v.warehouseStates.length > 5000 || v.warehouseStates.some((s: Record<string, unknown>) => !s || !this.id(s.trackId)
      || !(v.warehouse as string[]).includes(s.trackId) || !Object.values(WarehouseStatus).includes(s.status as WarehouseStatus)
      || Object.keys(s).some((key) => !['trackId','status'].includes(key))) || new Set(v.warehouseStates.map((s: {trackId:string}) => s.trackId)).size !== v.warehouseStates.length) return fail();
    if (!Array.isArray(v.instamus) || v.instamus.length > 100 || v.instamus.some((n: Record<string, unknown>) => !n || typeof n.reelUrl !== 'string'
      || !/^https:\/\/(?:www\.)?instagram\.com\/(?:reel|p|reels)\/[A-Za-z0-9_-]{1,100}\/$/.test(n.reelUrl)
      || typeof n.query !== 'string' || n.query.length > 160 || (n.trackId !== null && !this.id(n.trackId))
      || Object.keys(n).some((key) => !['reelUrl','query','trackId'].includes(key))) || new Set(v.instamus.map((n: {reelUrl:string}) => n.reelUrl)).size !== v.instamus.length) return fail();
    if (v.history !== undefined && (!Array.isArray(v.history) || v.history.length > 200 || v.history.some((h: Record<string, unknown>) => !h || !this.id(h.trackId)
      || !Number.isSafeInteger(h.playedAt) || (h.playedAt as number) < 0 || Object.keys(h).some((key) => !['trackId','playedAt'].includes(key))))) return fail();
    const encoded=JSON.stringify(value);let bytes=0;for(const character of encoded){const point=character.codePointAt(0)!;bytes+=point<=0x7f?1:point<=0x7ff?2:point<=0xffff?3:4;if(bytes>this.maxBytes)return fail();}
    return JSON.parse(JSON.stringify(value)) as AccountLibraryData;
  }
  public static trackIds(data: AccountLibraryData): string[] {
    return [...new Set([...data.likes, ...data.favourites, ...data.bookmarks, ...data.warehouse,
      ...data.playlists.flatMap((p) => p.trackIds), ...data.instamus.flatMap((n) => n.trackId ? [n.trackId] : []), ...(data.history ?? []).map((h) => h.trackId)])];
  }
}
