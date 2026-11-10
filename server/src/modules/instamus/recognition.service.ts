import {AccountLibraryCodec} from '@aadat/contracts';
import {DomainError,ForbiddenError,UnauthorizedError,ValidationFailedError} from '../../shared/errors/domain.error.js';
import type {IMusicRecognitionProvider,IRecognitionCatalog,IRecognitionRepository} from './recognition.contract.js';
export class RecognitionUnavailableError extends DomainError{readonly statusCode=503;readonly code='RECOGNITION_UNAVAILABLE';}
export class RecognitionService{
 constructor(private readonly repository:IRecognitionRepository,private readonly catalog:IRecognitionCatalog,private readonly provider:IMusicRecognitionProvider|null=null,private readonly enabled=false){}
 public available():boolean{return this.enabled&&this.provider?.processingAuthorized===true;}
 public async ingest(owner:string|undefined,reel:string,hasProcessingRights=false,isPrivate=true){
  if(!AccountLibraryCodec.id(owner))throw new UnauthorizedError('Authentication required');
  if(!this.available())throw new RecognitionUnavailableError('An authorized recognition provider has not been configured');
  if(!hasProcessingRights||isPrivate)throw new ForbiddenError('Only public reels you are authorized to process may be submitted');
  const match=/^https:\/\/(?:www\.|m\.)?instagram\.com\/reels?\/([A-Za-z0-9_-]{1,100})\/?(?:[?#][^\s\\]*)?$/i.exec(reel);
  if(!match||reel.length>2048)throw new ValidationFailedError('Use an individual HTTPS Instagram reel link');
  const reelUrl=`https://www.instagram.com/reel/${match[1]}/`,reelId=await this.repository.create(owner,reelUrl);
  const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error('Recognition timeout'));},15000);});
  let result;
  try{
   const value=await Promise.race([this.provider!.recognize({reelUrl,signal:abort.signal}),deadline]);
   if(!value||!Number.isFinite(value.confidence)||value.confidence<0||value.confidence>1||!Array.isArray(value.keywords)||value.keywords.length>20||value.keywords.some(w=>typeof w!=='string'||w.length>100)
    ||[value.title,value.artist].some(v=>v!==null&&(typeof v!=='string'||v.length>200))||value.canonicalTrackId!==null&&!AccountLibraryCodec.id(value.canonicalTrackId))throw new Error('Invalid provider response');
   const candidate=value.canonicalTrackId&&value.confidence>0.85?await this.catalog.track(value.canonicalTrackId):null;
   result={status:candidate?'MATCHED' as const:'UNMATCHED' as const,confidence:value.confidence,trackId:candidate?.id??null,title:value.title,artist:value.artist,keywords:value.keywords};
  }catch{
   result={status:'EXTRACTION_FAILED' as const,confidence:null,trackId:null,title:null,artist:null,keywords:[]};
  }finally{clearTimeout(timer);}
  await this.repository.finish(owner,reelId,result);
  return {reelId,reelUrl,status:result.status,confidenceScore:result.confidence,matchedTrack:result.trackId?await this.catalog.track(result.trackId):null,
   fallbackMeta:{extractedTitle:result.title,extractedArtist:result.artist,captionKeywords:result.keywords},requiresManualSearch:result.status!=='MATCHED',errorMessage:result.status==='EXTRACTION_FAILED'?'Recognition was not completed. Search manually.':null};
 }
}
