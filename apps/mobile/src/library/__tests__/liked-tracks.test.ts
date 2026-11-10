import { describe, expect, it, vi } from 'vitest';
import { createLibraryStore } from '../../store/useLibraryStore';
import { accountLibraryRepositories } from '../account-library.service';
import { type IDocumentStorage, emptyLibrary } from '../library.contract';
import { demoCatalog } from '../../catalog/demo-catalog';
import { FileLibraryRepository } from '../file-library.repository';
import { CloudLibraryRepository, type IRemoteLibrary } from '../cloud-library.repository';
const A = '10000000-0000-4000-8000-000000000001', B = '10000000-0000-4000-8000-000000000002';
// Stable provider UUIDs: deliberately absent from the bounded in-memory metadata registry.
const SONG = '20000000-0000-4000-8000-000000000001';
class Documents implements IDocumentStorage {
  files = new Map<string, string>();
  read = vi.fn(async (name: string) => this.files.get(name) ?? null);
  write = vi.fn(async (name: string, value: string) => { this.files.set(name, value); });
}
async function fixture() {
  const docs = new Documents(), repositories = accountLibraryRepositories(docs);
  const store = createLibraryStore(undefined, repositories, true);
  await store.getState().activateAccount(A);
  return { docs, repositories, store };
}
describe('Liked Tracks immediate state, durability and isolation', () => {
  it('updates every subscriber immediately, then persists a real catalog ID without metadata residency', async () => {
    const { store, docs } = await fixture(); expect(demoCatalog.has(SONG)).toBe(false);
    const home = vi.fn(), player = vi.fn(); const a=store.subscribe(s=>home(s.data.likes.includes(SONG))),b=store.subscribe(s=>player(s.data.likes.includes(SONG)));
    let release!:()=>void; docs.write.mockImplementationOnce((name,value)=>new Promise<void>(resolve=>{release=()=>{docs.files.set(name,value);resolve();};}));
    const save=store.getState().toggle('likes',SONG);
    expect(store.getState().data.likes).toEqual([SONG]); expect(home).toHaveBeenLastCalledWith(true); expect(player).toHaveBeenLastCalledWith(true);
    await vi.waitFor(()=>expect(release).toBeTypeOf('function')); release(); await save; a();b();
    expect(store.getState().error).toBeNull();
    const restart=createLibraryStore(undefined,accountLibraryRepositories(docs),true);await restart.getState().activateAccount(A);
    expect(restart.getState().data.likes).toEqual([SONG]);
  });
  it('removes immediately and persists unlike across restart', async()=>{
    const {store,docs}=await fixture();await store.getState().toggle('likes',SONG);
    const save=store.getState().toggle('likes',SONG);expect(store.getState().data.likes).toEqual([]);await save;
    const restart=createLibraryStore(undefined,accountLibraryRepositories(docs),true);await restart.getState().activateAccount(A);expect(restart.getState().data.likes).toEqual([]);
  });
  it('handles rapid like/unlike/like without duplicates or intermediate-state flicker',async()=>{
    const {store}=await fixture();const saves=[store.getState().toggle('likes',SONG),store.getState().toggle('likes',SONG),store.getState().toggle('likes',SONG)];
    expect(store.getState().data.likes).toEqual([SONG]);const observed:boolean[]=[];store.subscribe(s=>observed.push(s.data.likes.includes(SONG)));
    await Promise.all(saves);expect(store.getState().data.likes).toEqual([SONG]);expect(observed.every(Boolean)).toBe(true);
  });
  it('rolls back a failed save and reports the failure instead of claiming persistence',async()=>{
    const {store,docs}=await fixture();docs.write.mockRejectedValueOnce(new Error('Disk full'));
    const save=store.getState().toggle('likes',SONG);expect(store.getState().data.likes).toEqual([SONG]);await save;
    expect(store.getState().data.likes).toEqual([]);expect(store.getState().error).toBe('Disk full');
    await store.getState().toggle('likes',SONG);expect(store.getState().data.likes).toEqual([SONG]);expect(store.getState().error).toBeNull();
  });
  it('keeps latest Unlike intent after an earlier Like save fails',async()=>{
    const {store,docs}=await fixture();docs.write.mockRejectedValueOnce(new Error('First save failed'));
    await Promise.all([store.getState().toggle('likes',SONG),store.getState().toggle('likes',SONG)]);
    expect(store.getState().data.likes).toEqual([]);expect(store.getState().error).toBeNull();
  });
  it('never publishes account A pending likes or errors into account B or signed-out state',async()=>{
    const {store,docs}=await fixture();let reject!:(error:Error)=>void;docs.write.mockImplementationOnce(()=>new Promise<void>((_resolve,fail)=>{reject=fail;}));
    const saving=store.getState().toggle('likes',SONG);await vi.waitFor(()=>expect(reject).toBeTypeOf('function'));
    const switching=store.getState().activateAccount(B);expect(store.getState().data.likes).toEqual([]);
    reject(new Error('A save failed'));await Promise.all([saving,switching]);expect(store.getState()).toMatchObject({scope:B,error:null,data:emptyLibrary()});
    await store.getState().toggle('likes',SONG);await store.getState().activateAccount(null);expect(store.getState()).toMatchObject({status:'locked',data:emptyLibrary()});
    await store.getState().toggle('likes',SONG);expect(store.getState().data.likes).toEqual([]);
    await store.getState().activateAccount(A);expect(store.getState().data.likes).toEqual([]);
    await store.getState().activateAccount(B);expect(store.getState().data.likes).toEqual([SONG]);
  });
  it('retains likes through reactivation/navigation and normalizes duplicate saved IDs',async()=>{
    const docs=new Documents();await new FileLibraryRepository(docs,`aadat-library-account-v1-${A}`).save({...emptyLibrary(),likes:[SONG,SONG]});
    const store=createLibraryStore(undefined,accountLibraryRepositories(docs),true);await store.getState().activateAccount(A);
    await store.getState().initialize();await store.getState().activateAccount(A);expect(store.getState().data.likes).toEqual([SONG]);
    await store.getState().activateAccount(B);expect(store.getState().data.likes).toEqual([]);await store.getState().activateAccount(A);expect(store.getState().data.likes).toEqual([SONG]);
  });
  it('captures ownership before an immediate UI subscriber switches the active account',async()=>{
    const {store,docs}=await fixture();let switching:Promise<void>|undefined;
    const unsubscribe=store.subscribe(state=>{if(state.scope===A && state.data.likes.includes(SONG))switching=state.activateAccount(B);});
    await store.getState().toggle('likes',SONG);await switching;unsubscribe();
    expect(store.getState()).toMatchObject({scope:B,data:emptyLibrary(),error:null});expect(docs.files.size).toBe(0);
  });
  it('retains offline likes in the production account-sync journal, then acknowledges them after restart',async()=>{
    const docs=new Documents();let online=false,serial=0,remoteData=emptyLibrary(),revision=0;
    const remote:IRemoteLibrary={read:vi.fn(async()=>{if(!online)throw new Error('Offline');return {data:remoteData,revision};}),
      commit:vi.fn(async(_owner,expected,_id,data)=>{expect(expected).toBe(revision);remoteData=data;revision++;return {appliedRevision:revision,snapshot:{data,revision}};})};
    const repositories=(owner:string|null)=>owner===null?new FileLibraryRepository(docs):new CloudLibraryRepository(owner,docs,new FileLibraryRepository(docs,`legacy-${owner}`),remote,()=>true,async()=>`40000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`);
    const first=createLibraryStore(undefined,repositories,true);await first.getState().activateAccount(A);await first.getState().toggle('likes',SONG);await first.getState().synchronize();
    expect(first.getState().sync.status).toBe('offline');expect(first.getState().data.likes).toEqual([SONG]);expect(remote.commit).not.toHaveBeenCalled();
    const restarted=createLibraryStore(undefined,repositories,true);await restarted.getState().activateAccount(A);expect(restarted.getState().data.likes).toEqual([SONG]);
    online=true;await restarted.getState().synchronize();expect(restarted.getState().sync.status).toBe('synced');expect(remoteData.likes).toEqual([SONG]);expect(remote.commit).toHaveBeenCalledTimes(1);
    await restarted.getState().activateAccount(null);await restarted.getState().activateAccount(A);expect(restarted.getState().data.likes).toEqual([SONG]);
    await restarted.getState().toggle('likes',SONG);await restarted.getState().synchronize();expect(remoteData.likes).toEqual([]);
  });
});
