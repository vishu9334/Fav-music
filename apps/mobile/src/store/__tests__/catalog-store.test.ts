import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogPage } from '@aadat/contracts';
const backend = vi.hoisted(() => ({ enabled: true, page: vi.fn(), initialize: vi.fn(async () => {}), resolve: vi.fn(async () => new Map()), cacheError: null }));
vi.mock('../../catalog/catalog-runtime', () => ({ catalogEnabled: () => backend.enabled,
  catalogClient: backend, mediaLeases: backend }));
import { createCatalogStore } from '../createCatalogStore';
import { DemoCatalog } from '../../catalog/demo-catalog';
let useCatalogStore:ReturnType<typeof createCatalogStore>;


beforeEach(() => {
  vi.clearAllMocks();backend.enabled=true;const registry=new DemoCatalog();
  const client={initialize:backend.initialize,cacheError:null,page:async(query:import('@aadat/contracts').CatalogQuery,force?:boolean)=>{
    const value=await backend.page(query,force) as CatalogPage;
    registry.upsert(value.nodes.map(song=>({track:{id:song.id,title:song.title,artist:song.artistName,duration:song.durationSeconds,url:'',artwork:'',catalogSource:'catalog'},seasons:[]})));
    return value;
  }};
  useCatalogStore=createCatalogStore(client,registry,backend,()=>backend.enabled);
});
const page = (id: string, cursor: string | null = null): CatalogPage => ({ nodes: [{ id, title: 'Fixture', artistName: 'Test', albumName: null,
  durationSeconds: 20, releaseYear: null, attribution: 'Synthetic test only', hasVideo: false, moods: [], timeAffinities: [], seasonAffinities: [] }], endCursor: cursor, hasNextPage: !!cursor });

describe('Catalog search request order and fallback', () => {
  it('ignores stale responses from earlier searches and keeps the latest filter/cursor', async () => {
    let first!: (page: CatalogPage) => void, second!: (page: CatalogPage) => void;
    backend.page.mockImplementationOnce(() => new Promise((resolve) => { first = resolve; })).mockImplementationOnce(() => new Promise((resolve) => { second = resolve; }));
    const a = useCatalogStore.getState().load({ query: 'old' }), b = useCatalogStore.getState().load({ query: 'latest' });
    await vi.waitFor(()=>expect(second).toBeTypeOf('function'));
    second(page('latest', 'latest-cursor')); await b; first(page('old', 'old-cursor')); await a;
    expect(useCatalogStore.getState()).toMatchObject({ ids: ['latest'], query: { query: 'latest' }, cursor: 'latest-cursor', status: 'ready' });
  });
  it('deduplicates pagination IDs and rejects a cursor for another search', async () => {
    backend.page.mockResolvedValueOnce(page('one', 'cursor')).mockResolvedValueOnce({ ...page('two'), nodes: [...page('one').nodes, ...page('two').nodes] });
    await useCatalogStore.getState().load({ query: 'calm' }); await useCatalogStore.getState().load({ query: 'other' }, true);
    expect(backend.page).toHaveBeenCalledTimes(1);
    await useCatalogStore.getState().load({ query: 'calm' }, true);
    expect(useCatalogStore.getState().ids).toEqual(['one', 'two']);
    expect(backend.page).toHaveBeenLastCalledWith(expect.objectContaining({ after: 'cursor', first: 20, query: 'calm' }), false);
  });
  it('keeps already loaded IDs on a network failure and does not request production data while disabled', async () => {
    backend.page.mockResolvedValueOnce(page('one')).mockRejectedValueOnce(new Error('Offline'));
    await useCatalogStore.getState().load({}); await useCatalogStore.getState().load({}, false, true);
    expect(useCatalogStore.getState()).toMatchObject({ status: 'error', ids: ['one'] });
    expect(useCatalogStore.getState().error).toContain('Saved references are preserved');
    backend.enabled = false; await useCatalogStore.getState().load({}); expect(backend.page).toHaveBeenCalledTimes(2);
    expect(useCatalogStore.getState().status).toBe('unavailable');
  });
});


describe('stable independent Load More pages',()=>{
  it('joins duplicate initial/submit requests and repeated Next-page taps',async()=>{
    let release!:(value:CatalogPage)=>void;backend.page.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const first=useCatalogStore.getState().load({query:'calm'}),duplicate=useCatalogStore.getState().load({query:'calm'});expect(duplicate).toBe(first);
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));release(page('one','next'));await first;
    backend.page.mockResolvedValueOnce(page('two'));
    await Promise.all([useCatalogStore.getState().load({query:'calm'},true),useCatalogStore.getState().load({query:'calm'},true)]);
    expect(backend.page).toHaveBeenCalledTimes(2);expect(useCatalogStore.getState().ids).toEqual(['one','two']);
  });
  it('keeps the exact visible rows while more loads and restores all pages on query navigation',async()=>{
    backend.page.mockResolvedValueOnce(page('one','next'));await useCatalogStore.getState().load({query:'A'});
    const before=useCatalogStore.getState().tracks;let release!:(value:CatalogPage)=>void;backend.page.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const more=useCatalogStore.getState().load({query:'A'},true);expect(useCatalogStore.getState().tracks).toBe(before);
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));release(page('two'));await more;
    const loaded=useCatalogStore.getState().tracks;expect(loaded[0]).toBe(before[0]);
    backend.page.mockResolvedValueOnce(page('other'));await useCatalogStore.getState().load({query:'B'});await useCatalogStore.getState().load({query:'A'});
    expect(useCatalogStore.getState().tracks).toBe(loaded);expect(useCatalogStore.getState().ids).toEqual(['one','two']);expect(backend.page).toHaveBeenCalledTimes(3);
  });
  it('stops a repeated cursor/page rather than looping or re-requesting it',async()=>{
    backend.page.mockResolvedValueOnce(page('one','same')).mockResolvedValueOnce(page('one','same'));
    await useCatalogStore.getState().load({});await useCatalogStore.getState().load({},true);await useCatalogStore.getState().load({},true);
    expect(useCatalogStore.getState()).toMatchObject({ids:['one'],hasMore:false});expect(backend.page).toHaveBeenCalledTimes(2);
  });
  it('retains the loaded prefix on page failure and retries the same cursor without duplicates',async()=>{
    backend.page.mockResolvedValueOnce(page('one','next')).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(page('two'));
    await useCatalogStore.getState().load({});const before=useCatalogStore.getState().tracks;await useCatalogStore.getState().load({},true);
    expect(useCatalogStore.getState().tracks).toBe(before);expect(useCatalogStore.getState().cursor).toBe('next');await useCatalogStore.getState().load({},false,true);expect(useCatalogStore.getState().ids).toEqual(['one','two']);expect(backend.page).toHaveBeenLastCalledWith(expect.objectContaining({after:'next'}),true);
  });
  it('bounds query snapshots and never drops the beginning of a long loaded list',async()=>{
    backend.page.mockImplementation(async(input:{after?:string})=>{const offset=Number(input.after??0);return {nodes:Array.from({length:20},(_,i)=>page(String(offset+i)).nodes[0]!),hasNextPage:true,endCursor:String(offset+20)};});
    await useCatalogStore.getState().load({query:'many'});for(let i=0;i<30;i++)await useCatalogStore.getState().load({query:'many'},true);
    expect(useCatalogStore.getState().ids).toHaveLength(500);expect(useCatalogStore.getState().ids[0]).toBe('0');expect(useCatalogStore.getState().hasMore).toBe(false);
    for(let i=0;i<12;i++)await useCatalogStore.getState().load({query:String(i)});expect(Object.keys(useCatalogStore.getState().pages).length).toBeLessThanOrEqual(8);
  });
});
