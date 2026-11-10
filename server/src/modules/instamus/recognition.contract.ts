export interface RecognitionInput {readonly reelUrl:string;readonly signal:AbortSignal}
export interface RecognitionMatch {readonly canonicalTrackId:string|null;readonly confidence:number;readonly title:string|null;readonly artist:string|null;readonly keywords:readonly string[]}
/** A provider must handle licensed recognition itself; the app never fetches Instagram media. */
export interface IMusicRecognitionProvider {
 readonly id:string;
 readonly processingAuthorized:boolean;
 recognize(input:RecognitionInput):Promise<RecognitionMatch>;
}
export interface IRecognitionCatalog {track(id:string):Promise<{id:string;title:string;artistName:string}|null>}
export interface IRecognitionRepository {
 create(owner:string,reelUrl:string):Promise<string>;
 finish(owner:string,reelId:string,result:{status:'MATCHED'|'UNMATCHED'|'EXTRACTION_FAILED';confidence:number|null;trackId:string|null;title:string|null;artist:string|null;keywords:readonly string[]}):Promise<void>;
}
