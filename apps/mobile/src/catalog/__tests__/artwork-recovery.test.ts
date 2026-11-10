import {describe,it,expect,vi} from 'vitest';
vi.mock('../catalog-runtime',()=>({mediaLeases:{resolve:vi.fn()}}));
import {ArtworkRecovery} from '../artwork-recovery';
import {DemoCatalog} from '../demo-catalog';
describe('bounded artwork renewal across recycled rows',()=>{
 it('makes one renewal across duplicate errors/remounts, and permits a later bounded retry',async()=>{
  let now=0;const registry=new DemoCatalog([{track:{id:'song',title:'Test',artist:'Test',duration:20,url:'',artwork:'old'},seasons:[]}]),leases={resolve:vi.fn(async()=>new Map([['song','renewed']]))};
  const recovery=new ArtworkRecovery(registry,leases,()=>now);await Promise.all(Array.from({length:40},()=>recovery.recover('song','old')));expect(leases.resolve).toHaveBeenCalledTimes(1);expect(registry.get('song')?.artwork).toBe('renewed');
  await recovery.recover('song','renewed');expect(leases.resolve).toHaveBeenCalledTimes(1);now=60_000;await recovery.recover('song','renewed');expect(leases.resolve).toHaveBeenCalledTimes(2);
 });
 it('does not restore obsolete art after another metadata request wins',async()=>{
  const track={id:'song',title:'Test',artist:'Test',duration:20,url:'',artwork:'old'},registry=new DemoCatalog([{track,seasons:[]}]);let release!:(urls:Map<string,string>)=>void;
  const recovery=new ArtworkRecovery(registry,{resolve:()=>new Promise(r=>{release=r;})});const request=recovery.recover('song','old');await Promise.resolve();registry.upsert([{track:{...track,artwork:'newer'},seasons:[]}]);release(new Map([['song','late']]));await request;expect(registry.get('song')?.artwork).toBe('newer');
 });
});
