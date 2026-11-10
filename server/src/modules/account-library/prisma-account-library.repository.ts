import type {ICatalogService} from '../catalog/contracts/catalog.contract.js';
import { AccountLibraryCodec, type AccountLibraryCommit, type AccountLibraryReceipt, type AccountLibrarySnapshot } from '@aadat/contracts';
import type { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ConflictError } from '../../shared/errors/domain.error.js';
import { emptyAccountLibrary, type IAccountLibraryRepository } from './account-library.contract.js';

export class PrismaAccountLibraryRepository implements IAccountLibraryRepository {
  public constructor(private readonly database: IDatabaseService,private readonly catalog?:ICatalogService) {}
  public async read(userId: string): Promise<AccountLibrarySnapshot> {
    const row = await this.database.getClient().accountLibrary.findUnique({where:{userId}});
    return row ? {revision:row.revision, data:AccountLibraryCodec.parse(row.data)} : {revision:0, data:emptyAccountLibrary()};
  }
  public async existingTrackIds(ids: readonly string[]): Promise<readonly string[]> {
    if (!ids.length) return [];
    const now=new Date(),rows=await this.database.getClient().track.findMany({where:{id:{in:[...ids]},publishStatus:'PUBLISHED',publicStreamingAllowed:true,licenseVerifiedAt:{lte:now},licenseReference:{not:null},licenseAttribution:{not:null},OR:[{licenseExpiresAt:null},{licenseExpiresAt:{gt:now}}]},select:{id:true,licenseReference:true,licenseAttribution:true}});
    const known=rows.filter(row=>row.licenseReference?.trim()&&row.licenseAttribution?.trim()).map(row=>row.id),found=new Set(known);
    if(this.catalog)for(let offset=0;offset<ids.length;offset+=3){const batch=ids.slice(offset,offset+3).filter(id=>!found.has(id));for(const song of await Promise.all(batch.map(id=>this.catalog!.track(id))))if(song)found.add(song.id);}
    return [...found];
  }
  public async commit(userId: string, command: AccountLibraryCommit, hash: string): Promise<AccountLibraryReceipt> {
    try {
      return await this.database.getClient().$transaction(async (tx) => {
        const receipt = await tx.libraryMutationReceipt.findUnique({where:{userId_mutationId:{userId,mutationId:command.mutationId}}});
        const row = await tx.accountLibrary.findUnique({where:{userId}});
        const snapshot = row ? {revision:row.revision, data:AccountLibraryCodec.parse(row.data)} : {revision:0,data:emptyAccountLibrary()};
        if (receipt) {
          if (receipt.payloadHash !== hash) throw new ConflictError('Request identity was already used for different changes');
          return {appliedRevision:receipt.appliedRevision, snapshot};
        }
        if (snapshot.revision !== command.expectedRevision) throw new ConflictError('Collections changed on another device. Review both copies before continuing.');
        const revision = command.expectedRevision + 1, data = command.data as unknown as Prisma.InputJsonValue;
        if (!row) await tx.accountLibrary.create({data:{userId,revision,data}});
        else {
          const updated = await tx.accountLibrary.updateMany({where:{userId,revision:command.expectedRevision},data:{revision,data}});
          if (updated.count !== 1) throw new ConflictError('Collections changed on another device');
        }
        await tx.libraryMutationReceipt.create({data:{userId,mutationId:command.mutationId,payloadHash:hash,appliedRevision:revision}});
        return {appliedRevision:revision,snapshot:{revision,data:command.data}};
      }, {isolationLevel:'Serializable'});
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['P2002','P2034'].includes(String(error.code))) throw new ConflictError('Concurrent collection update. Retry synchronization; both local copies are preserved.');
      throw error;
    }
  }
}
