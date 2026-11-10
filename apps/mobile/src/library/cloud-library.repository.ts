import { AccountLibraryCodec, type AccountLibrarySnapshot, type AccountLibraryReceipt } from '@aadat/contracts';
import { AccountApiClient } from '../auth/repositories/account-api.client';
import { newMutationId } from '../auth/adapters/native-auth.transport';
import { DurableDocumentRepository } from './file-library.repository';
import { emptyLibrary, type IDocumentStorage, type ILibraryRepository, type LibrarySyncState, type LocalLibrary } from './library.contract';
export interface IRemoteLibrary {
  read(owner: string): Promise<AccountLibrarySnapshot>;
  commit(owner: string, revision: number, mutationId: string, data: LocalLibrary): Promise<AccountLibraryReceipt>;
}
export class GraphQLRemoteLibrary implements IRemoteLibrary {
  public constructor(private readonly api = new AccountApiClient()) {}
  private snapshot(v: {revision:number;data:string}): AccountLibrarySnapshot {
    if (!Number.isInteger(v?.revision) || v.revision < 0 || typeof v.data !== 'string' || v.data.length > AccountLibraryCodec.maxBytes) throw new Error('Invalid account snapshot.');
    return {revision:v.revision,data:AccountLibraryCodec.parse(JSON.parse(v.data))};
  }
  public async read(owner: string): Promise<AccountLibrarySnapshot> {
    const r = await this.api.request<{accountLibrary:{revision:number;data:string}}>(owner,'query AccountCollections { accountLibrary { revision data } }');
    return this.snapshot(r.accountLibrary);
  }
  public async commit(owner:string,revision:number,mutationId:string,data:LocalLibrary):Promise<AccountLibraryReceipt> {
    const r = await this.api.request<{commitAccountLibrary:{appliedRevision:number;snapshot:{revision:number;data:string}}}>(owner,
      'mutation SaveAccountCollections($input: AccountLibraryCommitInput!) { commitAccountLibrary(input:$input) { appliedRevision snapshot { revision data } } }',
      {input:{expectedRevision:revision,mutationId,data:JSON.stringify(AccountLibraryCodec.parse(data))}});
    const receipt=r.commitAccountLibrary;
    if (!Number.isInteger(receipt?.appliedRevision) || receipt.appliedRevision !== revision+1) throw new Error('Invalid save receipt.');
    const snapshot=this.snapshot(receipt.snapshot);
    if (snapshot.revision < receipt.appliedRevision) throw new Error('Invalid save revision.');
    return {appliedRevision:receipt.appliedRevision,snapshot};
  }
}
interface Journal {
  readonly version:1; readonly owner:string; readonly revision:number; readonly verified:boolean;
  readonly local:LocalLibrary;
  readonly pending:{readonly mutationId:string;readonly expectedRevision:number;readonly data:LocalLibrary}|null;
  readonly conflict?:AccountLibrarySnapshot;
}
/** A snapshot and its idempotency key are committed in one alternating-slot journal.
 * Conflicts never auto-merge: explicit review preserves removals, order and both copies.
 */
export class CloudLibraryRepository implements ILibraryRepository {
  private state:Journal|null=null;
  private readonly journal:DurableDocumentRepository<Journal>;
  private status:LibrarySyncState={status:'blocked',message:'Account cloud persistence is awaiting approval. Changes remain on this device.',revision:0};
  public constructor(private readonly owner:string,private readonly storage:IDocumentStorage,private readonly legacy:ILibraryRepository,
    private readonly remote:IRemoteLibrary = new GraphQLRemoteLibrary(),private readonly enabled:()=>boolean=()=>process.env.EXPO_PUBLIC_ACCOUNT_PERSISTENCE_ENABLED==='true',
    private readonly makeId:()=>Promise<string>=newMutationId) {
    if(!AccountLibraryCodec.id(owner)) throw new Error('Verified account identity required.');
    this.journal=new DurableDocumentRepository(storage,`aadat-account-sync-v1-${owner.toLowerCase()}`);
  }
  public syncStatus():LibrarySyncState{return this.status;}
  private async persist(next:Journal):Promise<void>{await this.journal.save(next);this.state=next;}
  public async load():Promise<unknown|null>{
    if(this.state)return this.state.local;
    const saved=await this.journal.load();
    if(saved!==null){
      const v=saved as Journal;
      if(v.version!==1||v.owner!==this.owner||!Number.isInteger(v.revision)||v.revision<0||!v.local||!('pending' in v))throw new Error('Account sync journal is invalid. All files were preserved.');
      AccountLibraryCodec.parse(v.local);
      if(v.pending && (!AccountLibraryCodec.id(v.pending.mutationId)||v.pending.expectedRevision!==v.revision))throw new Error('Pending account change is invalid. Files preserved.');
      if(v.pending)AccountLibraryCodec.parse(v.pending.data);
      if(v.conflict)AccountLibraryCodec.parse(v.conflict.data);
      this.state=v;
    }else{
      // Existing account journal is never removed or silently uploaded. Legacy demo IDs need review.
      const prior=await this.legacy.load();
      const local=prior===null?emptyLibrary():AccountLibraryCodec.parse(prior);
      this.state={version:1,owner:this.owner,revision:0,verified:false,local,pending:null};
      if(prior!==null && JSON.stringify(local)!==JSON.stringify(emptyLibrary())) {
        await this.persist({...this.state,pending:{mutationId:await this.makeId(),expectedRevision:0,data:local}});
      }
    }
    this.updateStatus();return this.state.local;
  }
  private updateStatus():void{
    this.status={revision:this.state?.revision??0,status:!this.enabled()?'blocked':this.state?.conflict?'conflict':this.state?.pending || !this.state?.verified?'pending':'synced',message:!this.enabled()?'Cloud persistence is awaiting approval. Local files are preserved.':this.state?.conflict?'Another device has changes. Review both copies before continuing.':this.state?.pending || !this.state?.verified?'Saved on this device; awaiting account synchronization.':'Account copy is synchronized.'};
  }
  public async save(data:LocalLibrary):Promise<void>{
    await this.load(); AccountLibraryCodec.parse(data);
    if(this.state!.conflict)throw new Error('Review the synchronization conflict before editing. Both copies are preserved.');
    // Replacing an unsent snapshot is safe; a sent/uncertain request keeps its identity until acknowledged.
    if(this.state!.pending) {
      // Flush uncertain request before replacing its payload; offline edits retain a second local snapshot.
      await this.persist({...this.state!,local:data});
    }else await this.persist({...this.state!,local:data,pending:{mutationId:await this.makeId(),expectedRevision:this.state!.revision,data}});
    this.updateStatus();
  }
  public async synchronize(resolution?:'local'|'remote'):Promise<LocalLibrary>{
    await this.load();if(!this.enabled()){this.updateStatus();return this.state!.local;}
    this.status={status:'syncing',message:'Synchronizing your account…',revision:this.state!.revision};
    try{
      let state=this.state!;
      if(state.conflict){
        if(!resolution){this.updateStatus();return state.local;}
        if(resolution==='remote'){
          // Preserve the discarded local version in a separate immutable review file first.
          await this.journalBackup(state);
          await this.persist({...state,verified:true,revision:state.conflict.revision,local:state.conflict.data,pending:null,conflict:undefined});
        }else{
          await this.journalBackup(state);
          await this.persist({...state,verified:true,revision:state.conflict.revision,pending:{mutationId:await this.makeId(),expectedRevision:state.conflict.revision,data:state.local},conflict:undefined});
        }
        state=this.state!;
      }
      const remote=await this.remote.read(this.owner);
      if(state.pending){
        let receipt;
        try{receipt=await this.remote.commit(this.owner,state.pending.expectedRevision,state.pending.mutationId,state.pending.data);}
        catch(error){if((error as {code?:string}).code==='CONFLICT'){await this.persist({...state,conflict:remote});this.updateStatus();return state.local;}throw error;}
        const hasLaterEdits=JSON.stringify(state.local)!==JSON.stringify(state.pending.data);
        // A duplicate receipt can return a newer device's snapshot; never overwrite later local edits.
        if(hasLaterEdits && receipt.snapshot.revision!==receipt.appliedRevision){await this.persist({...state,conflict:receipt.snapshot});this.updateStatus();return state.local;}
        const next:Journal={...state,verified:true,revision:receipt.snapshot.revision,local:hasLaterEdits?state.local:receipt.snapshot.data,pending:hasLaterEdits?{mutationId:await this.makeId(),expectedRevision:receipt.snapshot.revision,data:state.local}:null};
        await this.persist(next);
      }else await this.persist({...state,verified:true,revision:remote.revision,local:remote.data});
      this.updateStatus();return this.state!.local;
    }catch(error){this.status={status:'offline',message:error instanceof Error?error.message:'Synchronization failed. Your local changes remain saved.',revision:this.state!.revision};return this.state!.local;}
  }
  private async journalBackup(state:Journal):Promise<void>{
    // Alternating journals retain a rollback copy until the next explicit conflict review.
    const copy=new DurableDocumentRepository<Journal>(this.storage,`aadat-sync-review-${this.owner.toLowerCase()}-${await this.makeId()}`);
    await copy.save(state);
  }
}
