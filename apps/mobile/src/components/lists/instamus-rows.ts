import type { IPlayableTrack } from '../../data/sample-tracks';
import type { InstaMusNote } from '../../library/library.contract';
export type InstaMusRow={readonly key:string;readonly kind:'match';readonly track:IPlayableTrack}
  |{readonly key:string;readonly kind:'note';readonly note:InstaMusNote}
  |{readonly key:string;readonly kind:'more'}|{readonly key:string;readonly kind:'heading'};
export function instaMusRows(tracks:readonly IPlayableTrack[],notes:readonly InstaMusNote[]):readonly InstaMusRow[]{
  const seen=new Set<string>();
  return [...tracks.filter(track=>{if(seen.has(track.id))return false;seen.add(track.id);return true;}).map(track=>({key:`match:${track.id}`,kind:'match' as const,track})),
    {key:'control:more',kind:'more'},{key:'control:saved',kind:'heading'},...notes.map(note=>({key:`note:${note.reelUrl}`,kind:'note' as const,note}))];
}
