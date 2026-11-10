import TrackPlayer, { Event, RemoteDuckEvent, RemoteSeekEvent } from 'react-native-track-player';
import { AudioPlaybackService } from './AudioPlaybackService';
import { mediaPlaybackCoordinator } from './MediaPlaybackCoordinator';

let registered = false;

/** Notification commands share queue recovery and ordering with screen controls. */
export async function playbackService(): Promise<void> {
  if (registered) return;
  registered = true;
  const service = AudioPlaybackService.getInstance();

  TrackPlayer.addEventListener(Event.RemotePlay, () => service.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => service.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => service.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => service.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek,
    (event: RemoteSeekEvent) => service.seekTo(event.position));
  TrackPlayer.addEventListener(Event.RemoteStop, () => service.stop());
  TrackPlayer.addEventListener(Event.RemoteDuck, (event: RemoteDuckEvent) => {
    if (event.permanent) return service.stop();
    if (event.paused) return service.pause();
    // A focus return caused by video must not unexpectedly restart the audio queue.
    if (mediaPlaybackCoordinator.mayResumeAudioFocus) return service.play();
    return undefined;
  });
}
