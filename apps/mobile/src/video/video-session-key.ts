import type {VideoItem} from './video.contract';
/** Presentation changes must not dispose native decoders or reset the selected video. */
export function videoSessionKey(items:readonly VideoItem[]):string{return JSON.stringify(items.map(item=>[item.id,item.source.kind==='catalog'?['catalog',item.source.trackId]:item.source.kind==='asset'?['asset',item.source.asset]:item.source.kind==='local'?['local',item.source.uri]:['https',item.source.uri]]));}
