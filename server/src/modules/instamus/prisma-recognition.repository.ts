import {AccountLibraryCodec} from '@aadat/contracts';
import type {IDatabaseService} from '../../infrastructure/database/contracts/database.contract.js';
import {Prisma} from '../../generated/prisma/client.js';
import {ConflictError} from '../../shared/errors/domain.error.js';
import {emptyAccountLibrary} from '../account-library/account-library.contract.js';
import type {IRecognitionRepository} from './recognition.contract.js';
export class PrismaRecognitionRepository implements IRecognitionRepository{
 constructor(private readonly database:IDatabaseService){}
 public async create(userId:string,reelUrl:string):Promise<string>{return(await this.database.getClient().instaMusReel.create({data:{userId,reelUrl,isPrivate:false}})).id;}
 public async finish(owner:string,reelId:string,result:Parameters<IRecognitionRepository['finish']>[2]):Promise<void>{
  await this.database.getClient().$transaction(async tx=>{
   const reel=await tx.instaMusReel.findFirst({where:{id:reelId,userId:owner,status:'PENDING'}});
   if(!reel)throw new ConflictError('This recognition request is no longer pending');
   const matched=result.trackId?await tx.instaMusTrack.upsert({where:{trackId:result.trackId},create:{trackId:result.trackId,originalTitle:result.title??'',originalArtist:result.artist??''},update:{}}):null;
   await tx.instaMusReel.update({where:{id:reelId,userId:owner},data:{status:result.status,confidenceScore:result.confidence,instaMusTrackId:matched?.id??null,extractedMetaJson:JSON.stringify({title:result.title,artist:result.artist,keywords:result.keywords}),errorMessage:result.status==='EXTRACTION_FAILED'?'Recognition unavailable':null}});
   if(result.trackId){
    const row=await tx.accountLibrary.findUnique({where:{userId:owner}}),data=row?AccountLibraryCodec.parse(row.data):emptyAccountLibrary();
    const next={...data,bookmarks:[...new Set([...data.bookmarks,result.trackId])]};AccountLibraryCodec.parse(next);
    await tx.accountLibrary.upsert({where:{userId:owner},create:{userId:owner,revision:1,data:next as unknown as Prisma.InputJsonValue},update:{revision:{increment:1},data:next as unknown as Prisma.InputJsonValue}});
   }
  },{isolationLevel:'Serializable'});
 }
}
