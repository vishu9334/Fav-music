import type { CatalogMediaKind, CatalogMediaLease, CatalogPage, CatalogQuery, CatalogSong, CatalogResourceKind, CatalogResourcePage, CatalogCollection, CatalogProviderInfo } from '@aadat/contracts';
export interface CatalogEntity extends CatalogSong {
  readonly audioKey: string; readonly videoKey: string | null; readonly artworkKey: string;
  readonly publishStatus: string; readonly licenseReference: string | null;
  readonly licenseVerifiedAt: Date | null; readonly licenseExpiresAt: Date | null;
  readonly weatherAffinities: readonly string[]; readonly energyScore: number; readonly tempoBpm: number | null;
  readonly publicStreamingAllowed: boolean;
}
export interface CatalogReadQuery extends CatalogQuery { readonly first: number; readonly lastId?: string }
export interface ICatalogRepository {
  page(query: CatalogReadQuery, now: Date): Promise<readonly CatalogEntity[]>;
  find(id: string): Promise<CatalogEntity | null>;
  findMany(ids: readonly string[]): Promise<readonly CatalogEntity[]>;
}
export interface ICatalogService {
  providerInfo?():CatalogProviderInfo;
  page(query: CatalogQuery): Promise<CatalogPage>;
  track(id: string): Promise<CatalogSong | null>;
  resources?(kind:CatalogResourceKind,query:string,page:number,first:number):Promise<CatalogResourcePage>;
  collection?(id:string,page:number,first:number):Promise<CatalogCollection>;
  media(ids: readonly string[], kind: CatalogMediaKind): Promise<readonly CatalogMediaLease[]>;
}
