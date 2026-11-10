import {AuthError} from '../auth/contracts/auth.contract';
import { AuthModule } from '../auth/auth.module';
import { AuthConfig } from '../auth/services/auth-config';
import { type AuthTransport, nativeAuthTransport } from '../auth/adapters/native-auth.transport';
import type { CatalogMediaKind, CatalogMediaLease, CatalogPage, CatalogQuery, CatalogSong, CatalogResourceKind, CatalogResource, CatalogResourcePage, CatalogCollection, CatalogProviderInfo } from '@aadat/contracts';
import { ICatalogRepository, isCatalogId, secureCatalogUrl, validateSong, type CatalogTrackPage } from './catalog-api';

export const CATALOG_FIELDS = 'id title artistName albumName durationSeconds releaseYear attribution hasVideo moods timeAffinities seasonAffinities sourceLabel developmentOnly discoveryBasis';
export class GraphQLCatalogRepository implements ICatalogRepository {
  public constructor(private readonly endpoint: () => string, private readonly transport: AuthTransport = authenticatedCatalogTransport) {}
  private async request(query: string, variables: Record<string, unknown>, external?: AbortSignal): Promise<Record<string, unknown>> {
    const endpoint = secureCatalogUrl(this.endpoint());
    if (/[?#]/.test(endpoint)) throw new Error('Catalog endpoint configuration is invalid.');
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10_000);
    const cancel = () => abort.abort(); external?.addEventListener('abort', cancel, { once: true }); if (external?.aborted) abort.abort();
    try {
      const response = await this.transport(endpoint, { method: 'POST', signal: abort.signal, redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
      if (!response.ok) throw new Error();
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object') throw new Error();
      const data = payload as { errors?: unknown; data?: Record<string, unknown> };
      if (data.errors || !data.data || typeof data.data !== 'object') throw new Error(); return data.data;
    } catch { throw new Error('The music catalog is unavailable. Your saved references are preserved; retry later.'); }
    finally { clearTimeout(timer); external?.removeEventListener('abort', cancel); }
  }
  public async providerInfo():Promise<CatalogProviderInfo>{
    const data=await this.request('query CatalogProvider {catalogProviderInfo{sourceLabel developmentOnly resourceKinds remotePagination videoSupported recognitionSupported}}',{});
    const v=data.catalogProviderInfo as CatalogProviderInfo;
    if(!v||typeof v.sourceLabel!=='string'||v.sourceLabel.length>200||!Array.isArray(v.resourceKinds)||v.resourceKinds.some(k=>!['albums','artists','playlists'].includes(k))||['developmentOnly','remotePagination','videoSupported','recognitionSupported'].some(key=>typeof (v as unknown as Record<string,unknown>)[key]!=='boolean'))throw new Error('Invalid provider capabilities.');
    return v;
  }
  private resource(value:unknown):CatalogResource {
    if(!value||typeof value!=='object')throw new Error('Invalid catalog resource.');const v=value as CatalogResource;
    if(!isCatalogId(v.id)||!['albums','artists','playlists'].includes(v.kind)||typeof v.name!=='string'||!v.name.trim()||v.name.length>200||typeof v.sourceLabel!=='string'||v.sourceLabel.length>200||(v.artworkUrl!==null&&typeof v.artworkUrl!=='string')||(v.releaseYear!==null&&(!Number.isInteger(v.releaseYear)||v.releaseYear<1||v.releaseYear>9999)))throw new Error('Invalid catalog resource.');
    if(v.artworkUrl)secureCatalogUrl(v.artworkUrl);return {id:v.id,kind:v.kind,name:v.name,artworkUrl:v.artworkUrl,releaseYear:v.releaseYear,sourceLabel:v.sourceLabel};
  }
  public async resources(kind:CatalogResourceKind,query:string,page=0,first=20):Promise<CatalogResourcePage>{
    const data=await this.request('query BrowseResources($kind:String!,$query:String!,$page:Int,$first:Int){catalogResources(kind:$kind,query:$query,page:$page,first:$first){nodes{id kind name artworkUrl releaseYear sourceLabel}page total hasMore}}',{kind,query,page,first});
    const value=data.catalogResources as CatalogResourcePage;
    if(!value||!Array.isArray(value.nodes)||value.nodes.length>50||value.page!==page||typeof value.hasMore!=='boolean'||(value.total!==null&&(!Number.isSafeInteger(value.total)||value.total<0)))throw new Error('Invalid resource page.');
    return {...value,nodes:value.nodes.map(node=>this.resource(node))};
  }
  public async collection(id:string,page=0,first=20):Promise<CatalogCollection>{
    if(!isCatalogId(id))throw new Error('Invalid collection reference.');
    const data=await this.request(`query CatalogCollection($id:ID!,$page:Int,$first:Int){catalogCollection(id:$id,page:$page,first:$first){resource{id kind name artworkUrl releaseYear sourceLabel}nodes{${CATALOG_FIELDS}}page total hasMore}}`,{id,page,first});
    const value=data.catalogCollection as CatalogCollection;
    if(!value||!Array.isArray(value.nodes)||value.nodes.length>500||value.page!==page||typeof value.hasMore!=='boolean'||(value.total!==null&&(!Number.isSafeInteger(value.total)||value.total<0)))throw new Error('Invalid collection page.');
    const resource=this.resource(value.resource);if(resource.id!==id)throw new Error('Collection identity mismatch.');
    return {...value,resource,nodes:value.nodes.map(validateSong)};
  }
  public async page(input: CatalogQuery, signal?: AbortSignal): Promise<CatalogPage> {
    const data = await this.request(`query CatalogPage($input: CatalogQueryInput) { catalogPage(input: $input) { nodes { ${CATALOG_FIELDS} } endCursor hasNextPage } }`, { input }, signal);
    const page = data.catalogPage as { nodes?: unknown; endCursor?: unknown; hasNextPage?: unknown } | undefined;
    if (!page || !Array.isArray(page.nodes) || page.nodes.length > 50 || typeof page.hasNextPage !== 'boolean'
      || !(page.endCursor === null || (typeof page.endCursor === 'string' && page.endCursor.length <= 512)) || (page.hasNextPage && !page.endCursor)) throw new Error('Invalid catalog page.');
    const nodes = page.nodes.map(validateSong);
    if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('Invalid duplicate catalog IDs.');
    return { nodes, hasNextPage: page.hasNextPage, endCursor: page.endCursor as string | null };
  }
  public async tracks(ids: readonly string[]): Promise<readonly CatalogSong[]> {
    if (!ids.length) return []; if (ids.length > 50 || ids.some((id) => !isCatalogId(id))) throw new Error('Invalid catalog IDs.');
    // Variables carry IDs; generated alias names never contain client strings.
    const unique = [...new Set(ids)], variables = Object.fromEntries(unique.map((id, i) => [`id${i}`, id]));
    const data = await this.request(`query CatalogTracks(${unique.map((_, i) => `$id${i}: ID!`).join(',')}) { ${unique.map((_, i) => `t${i}: track(id: $id${i}) { ${CATALOG_FIELDS} }`).join(' ')} }`, variables);
    return unique.flatMap((id, i) => { const value = data[`t${i}`]; if (value === null) return []; const song = validateSong(value); if (song.id !== id) throw new Error('Catalog identity mismatch.'); return [song]; });
  }
  /** Separate additive query: older servers cannot break normal discovery/playback. */
  public async trackPage(id: string): Promise<CatalogTrackPage | null> {
    if (!isCatalogId(id)) throw new Error('Invalid catalog track reference.');
    const data = await this.request('query TrackSharePage($id: ID!) { track(id: $id) { id title artistName shareUrl } }', { id });
    if (data.track === null) return null;
    const track = data.track as CatalogTrackPage | undefined;
    if (!track || track.id !== id || typeof track.title !== 'string' || !track.title.trim() || track.title.length > 200
      || typeof track.artistName !== 'string' || !track.artistName.trim() || track.artistName.length > 200
      || !(track.shareUrl === null || typeof track.shareUrl === 'string')) throw new Error('Shared song details are unavailable.');
    return { id, title: track.title, artistName: track.artistName, shareUrl: track.shareUrl };
  }
  public async media(ids: readonly string[], kind: CatalogMediaKind): Promise<readonly CatalogMediaLease[]> {
    if (!ids.length || ids.length > 50 || ids.some((id) => !isCatalogId(id))) throw new Error('Invalid catalog media IDs.');
    const data = await this.request('query CatalogMedia($ids: [ID!]!, $kind: CatalogMediaKind!) { catalogMedia(ids: $ids, kind: $kind) { trackId kind url issuedAt expiresAt expiresInSeconds refreshAfterSeconds } }', { ids, kind });
    if (!Array.isArray(data.catalogMedia) || data.catalogMedia.length !== new Set(ids).size) throw new Error('Invalid media lease response.');
    const leases = data.catalogMedia.map((value: unknown) => {
      if (!value || typeof value !== 'object') throw new Error('Invalid media lease.');
      const lease = value as CatalogMediaLease;
      const signed=typeof lease.expiresAt==='string'&&typeof lease.expiresInSeconds==='number'&&Number.isInteger(lease.expiresInSeconds)&&lease.expiresInSeconds>=1&&lease.expiresInSeconds<=300&&Date.parse(lease.expiresAt)-Date.parse(lease.issuedAt)===lease.expiresInSeconds*1000;
      const refresh=lease.expiresAt===null&&lease.expiresInSeconds===null&&Number.isInteger(lease.refreshAfterSeconds)&&lease.refreshAfterSeconds!>30&&lease.refreshAfterSeconds!<=300;
      if(!ids.includes(lease.trackId)||lease.kind!==kind||typeof lease.url!=='string'||!Number.isFinite(Date.parse(lease.issuedAt))||(!signed&&!refresh))throw new Error('Invalid media lease.');
      secureCatalogUrl(lease.url); return lease;
    });
    if (new Set(leases.map((lease) => lease.trackId)).size !== leases.length) throw new Error('Invalid duplicate media leases.');
    return leases;
  }
}

export const authenticatedCatalogTransport: AuthTransport = async (endpoint,options) => {
  if(new AuthConfig().credentialEndpoint()!==endpoint)throw new Error('Catalog endpoint is not approved.');
  const controller=AuthModule.getController(),state=controller.getSnapshot();
  if(!state.user || !['authenticated','loading'].includes(state.status))throw new AuthError('UNAUTHORIZED','Authentication required.');
  try {
    return await AuthModule.getSession().withAccessToken(state.user.id, async token=>{
      const response=await nativeAuthTransport(endpoint,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}});
      if(response.status===401)throw new AuthError('UNAUTHORIZED','Your session has expired.');
      const payload=await response.json() as {errors?:{extensions?:{code?:string}}[]};
      if(payload?.errors?.some(error=>['UNAUTHORIZED','UNAUTHENTICATED'].includes(error.extensions?.code??'')))throw new AuthError('UNAUTHORIZED','Your session has expired.');
      return {...response,json:async()=>payload};
    });
  } catch(error) {
    if(error instanceof AuthError&&error.code==='UNAUTHORIZED')void controller.restore();
    throw error;
  }
};
