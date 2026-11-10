import TrackPlayer, { State } from 'react-native-track-player';
import { usePlayerStore } from '../store/usePlayerStore';
import { IPlaybackObservationSource } from './playback-history.observer';
import { useLibraryStore } from '../store/useLibraryStore';
import { historyTrackId } from './history-normalization';

let episode=0;
const scope=()=>{const value=useLibraryStore.getState();return `${value.scopeVersion}:${value.scope??''}`;};

export const nativeHistorySource: IPlaybackObservationSource = {
  subscribe: (changed) => {
    const player=usePlayerStore.subscribe((next, previous) => {
      const restarted=next.position<=0.25 && previous.position>0.5 && next.tracks[next.activeTrackIndex]?.id===previous.tracks[previous.activeTrackIndex]?.id;
      if(restarted)episode++;
      if(restarted || next.playbackState!==previous.playbackState || next.activeTrackIndex!==previous.activeTrackIndex || next.tracks!==previous.tracks)changed();
    });
    const account=useLibraryStore.subscribe((next,previous)=>{if(next.scopeVersion!==previous.scopeVersion||next.scope!==previous.scope||next.status!==previous.status)changed();});
    return()=>{player();account();};
  },
  snapshot: async () => {
    const owner=scope(),version=episode;
    const before = await TrackPlayer.getPlaybackState(), index = await TrackPlayer.getActiveTrackIndex();
    const queue = await TrackPlayer.getQueue();
    const afterQueue=await TrackPlayer.getQueue(),afterIndex = await TrackPlayer.getActiveTrackIndex(), after = await TrackPlayer.getPlaybackState();
    const id=historyTrackId(queue[index??-1]?.id),afterId=historyTrackId(afterQueue[afterIndex??-1]?.id);
    const committed=!!id && usePlayerStore.getState().tracks.some(track=>historyTrackId(track.id)===id);
    const confirmed=owner===scope() && version===episode && committed && index!==undefined && index===afterIndex && id===afterId;
    const playing=confirmed && before.state===State.Playing && after.state===State.Playing;
    return { playing,trackId:confirmed?id!:undefined,scope:owner,episode:version,reset:!committed||[State.None,State.Stopped,State.Ended].includes(after.state) };
  },
};
