import type { DemoCatalog } from './demo-catalog';
import { demoCatalog } from './demo-catalog';
import { mediaLeases } from './catalog-runtime';
/** One thumbnail renewal per song/minute across virtualized row remounts; no retry timers. */
export class ArtworkRecovery {
  private readonly attempts=new Map<string,number>();
  private readonly pending=new Map<string,Promise<void>>();
  public constructor(private readonly registry:DemoCatalog,private readonly leases:{resolve(ids:readonly string[],kind:'ARTWORK',force:boolean):Promise<ReadonlyMap<string,string>>},private readonly now:()=>number=Date.now){}
  public recover(id:string,failedUri:string):Promise<void>{
    const running=this.pending.get(id);if(running)return running;
    if((this.attempts.get(id)??0)>this.now())return Promise.resolve();
    this.attempts.delete(id);this.attempts.set(id,this.now()+60_000);
    while(this.attempts.size>200)this.attempts.delete(this.attempts.keys().next().value!);
    const task=Promise.resolve().then(()=>this.leases.resolve([id],'ARTWORK',true)).then(urls=>{
      const entry=this.registry.metadata(id),url=urls.get(id);
      if(entry && entry.track.artwork===failedUri && url && url!==failedUri)this.registry.upsert([{...entry,track:{...entry.track,artwork:url}}]);
    }).finally(()=>{this.pending.delete(id);});
    this.pending.set(id,task);return task;
  }
}
export const artworkRecovery=new ArtworkRecovery(demoCatalog,mediaLeases);
