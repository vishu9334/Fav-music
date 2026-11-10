import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Headphones,
  AlertTriangle,
  Check,
  X,
  Search,
  Play,
  Pause,
} from 'lucide-react-native';
import { PlaybackState } from '@aadat/contracts';
import { colors, radius, spacing } from '../../design/theme';
import { GlassSurface } from '../../design/GlassSurface';
import { useRoomStore } from '../../store/useRoomStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { RoomPlaybackBridge } from '../../services/room/room-playback-bridge';
import { roomSocketClient } from '../../services/room/room-socket.client';
import { demoCatalog } from '../../catalog/demo-catalog';
import { SAMPLE_TRACKS } from '../../data/sample-tracks';
import { RoomSongSearch } from './RoomSongSearch';

export interface RoomSharedPlayerProps {
  roomId: string;
}

export function RoomSharedPlayer({ roomId }: RoomSharedPlayerProps): React.JSX.Element {
  const currentRoom = useRoomStore((s) => s.currentRoom);
  const isController = useRoomStore((s) => s.isController);
  const activeControllerId = useRoomStore((s) => s.activeControllerId);
  const participants = useRoomStore((s) => s.participants);
  const currentPlayback = useRoomStore((s) => s.currentPlayback);
  const queue = useRoomStore((s) => s.queue);
  const takeoverPrompt = useRoomStore((s) => s.takeoverPrompt);
  const pendingRequests = useRoomStore((s) => s.pendingControlRequests);

  const playerError = usePlayerStore((s) => s.errorMessage);
  const playerState = usePlayerStore((s) => s.playbackState);
  const playerTracks = usePlayerStore((s) => s.tracks);
  const activeTrackIndex = usePlayerStore((s) => s.activeTrackIndex);
  const playerTrack = playerTracks[activeTrackIndex];

  const [requestedControl, setRequestedControl] = useState(false);
  const [takeoverCountdown, setTakeoverCountdown] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandPending, setCommandPending] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Takeover countdown timer
  useEffect(() => {
    if (!takeoverPrompt) {
      setTakeoverCountdown(0);
      return;
    }

    const updateRemaining = () => {
      const remainingMs = takeoverPrompt.expiresAt - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setTakeoverCountdown(remainingSec);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 500);
    return () => clearInterval(interval);
  }, [takeoverPrompt]);

  // Find active controller display name
  const activeController = participants.find((p) => p.userId === activeControllerId);
  const controllerName = isController ? 'You' : activeController?.user?.displayName ?? 'Host';
  const currentTrackId = currentPlayback?.trackId || currentRoom?.currentTrackId || queue[0]?.trackId;
  const currentQueueItem = queue.find((q) => q.trackId === currentTrackId);
  const roomTrack = currentRoom?.currentTrack?.id === currentTrackId ? currentRoom?.currentTrack : undefined;
  const known = currentTrackId ? demoCatalog.get(currentTrackId) ?? SAMPLE_TRACKS.find(t => t.id === currentTrackId) : SAMPLE_TRACKS[0];
  const track = currentQueueItem?.track ?? roomTrack;
  const matchingPlayerTrack = playerTrack?.id === currentTrackId ? playerTrack : undefined;
  const isDemo = !currentTrackId || SAMPLE_TRACKS.some(t => t.id === currentTrackId);
  const title = track?.title ?? known?.title ?? matchingPlayerTrack?.title ?? 'Song unavailable';
  const artist = track?.artistName ?? known?.artist ?? matchingPlayerTrack?.artist ?? 'Search for another song';
  // Reflect the native player, including failures, instead of claiming server PLAYING means audible audio.
  const effectivePlaybackState = playerState;
  const handlePlayPause = async () => {
    if (!isController || commandPending) return;
    setCommandPending(true);
    setPlaybackError(null);
    try {
      const bridge = RoomPlaybackBridge.getInstance();
      const accepted = effectivePlaybackState === PlaybackState.PLAYING
        ? await bridge.commandPause(roomId)
        : await bridge.commandPlay(roomId);
      if (!accepted) setPlaybackError('Playback control is unavailable. Wait for the room to reconnect.');
    } catch {
      setPlaybackError('This song could not load. Retry or search for another song.');
    } finally {
      setCommandPending(false);
    }
  };

  const handleRequestControl = () => {
    roomSocketClient.requestControl(roomId);
    setRequestedControl(true);
    setTimeout(() => setRequestedControl(false), 4000);
  };

  const handleClaimTakeover = () => {
    roomSocketClient.claimTakeover(roomId);
  };

  const handleApproveRequest = (requestId: string) => {
    roomSocketClient.respondRequest(roomId, requestId, 'APPROVE');
  };

  const handleRejectRequest = (requestId: string) => {
    roomSocketClient.respondRequest(roomId, requestId, 'REJECT');
  };

  return (
    <GlassSurface style={searchOpen ? styles.containerExpanded : styles.containerChatbot}>
      {/* 1. Takeover Active Banner */}
      {takeoverPrompt && (
        <View style={styles.takeoverBanner} accessibilityRole="alert">
          <View style={styles.takeoverHeader}>
            <AlertTriangle size={15} color={colors.warning} />
            <Text style={styles.takeoverTitle}>
              DJ Disconnected! ({takeoverCountdown}s)
            </Text>
          </View>
          <Text style={styles.takeoverBody}>
            Control is unclaimed. First to claim becomes the DJ.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Claim DJ Control"
            style={styles.claimBtn}
            onPress={handleClaimTakeover}
          >
            <Text style={styles.claimBtnText}>Claim DJ Control</Text>
          </Pressable>
        </View>
      )}

      {/* 2. Pending Control Requests Banner (for Controller) */}
      {isController && pendingRequests.length > 0 && pendingRequests[0] && (
        <View style={styles.pendingRequestBanner}>
          <Text style={styles.pendingRequestTitle} numberOfLines={1}>
            {pendingRequests[0].requester?.displayName ?? 'Listener'} requested playback control
          </Text>
          <View style={styles.pendingActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Approve control request"
              style={[styles.smallBtn, styles.approveBtn]}
              onPress={() => pendingRequests[0] && handleApproveRequest(pendingRequests[0].id)}
            >
              <Check size={12} color={colors.primaryForeground} />
              <Text style={styles.approveText}>Approve</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reject control request"
              style={[styles.smallBtn, styles.rejectBtn]}
              onPress={() => pendingRequests[0] && handleRejectRequest(pendingRequests[0].id)}
            >
              <X size={12} color={colors.muted} />
              <Text style={styles.rejectText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 3. Search Mode: Expanded Overlay */}
      {searchOpen ? (
        <View style={styles.searchPanel}>
          <View style={styles.searchPanelHeader}>
            <View style={styles.searchTitleRow}>
              <Search size={15} color={colors.accent} />
              <Text style={styles.searchHeaderTitle}>Queue Song to Play</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close song search"
              style={styles.closeSearchBtn}
              onPress={() => setSearchOpen(false)}
            >
              <X size={16} color={colors.text} />
            </Pressable>
          </View>
          <RoomSongSearch
            key={roomId}
            roomId={roomId}
            onSongSelected={() => setSearchOpen(false)}
          />
        </View>
      ) : (
        /* 4. Chatbot-Style Pop-In Mini Widget */
        <View style={styles.chatbotRow}>
          {/* Kobra Systems Play/Pause Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={effectivePlaybackState === PlaybackState.PLAYING ? 'Pause' : 'Play'}
            style={[styles.kobraPlayBtn, (!isController || commandPending) && styles.kobraPlayBtnDisabled]}
            disabled={!isController || commandPending}
            onPress={handlePlayPause}
          >
            {effectivePlaybackState === PlaybackState.PLAYING ? (
              <Pause size={17} color="#000000" />
            ) : (
              <Play size={17} color="#000000" style={styles.playIconOffset} />
            )}
          </Pressable>

          {/* Compact Song Info */}
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {isDemo ? `Audio demo · ${title}` : title}
            </Text>
            <View style={styles.subMetaRow}>
              <Headphones size={11} color={isController ? colors.accent : colors.muted} />
              <Text style={styles.artist} numberOfLines={1}>
                {artist} · {isController ? 'You' : `DJ: ${controllerName}`}
              </Text>
            </View>
          </View>

          {/* Listener Request DJ Button */}
          {!isController && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Request playback control"
              style={[styles.requestBtn, requestedControl && styles.requestBtnSent]}
              disabled={requestedControl}
              onPress={handleRequestControl}
            >
              <Text style={styles.requestBtnText}>
                {requestedControl ? 'Requested' : 'Request DJ'}
              </Text>
            </Pressable>
          )}

          {/* Search Button (Opens popin search panel) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search song to play"
            style={styles.searchBtn}
            onPress={() => setSearchOpen(true)}
          >
            <Search size={16} color={colors.accent} />
          </Pressable>
        </View>
      )}
      {!!(playbackError || playerError) && <Text style={styles.playbackError} accessibilityRole="alert">{playbackError || playerError}</Text>}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  playbackError: { color: colors.text, fontSize: 11, lineHeight: 16, paddingTop: 6 },
  containerChatbot: {
    marginHorizontal: spacing.page,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    borderRadius: 22,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(16, 16, 28, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(233, 255, 96, 0.22)',
  },
  containerExpanded: {
    marginHorizontal: spacing.page,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: 'rgba(16, 16, 28, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(233, 255, 96, 0.35)',
  },
  chatbotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kobraPlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  kobraPlayBtnDisabled: {
    opacity: 0.45,
  },
  playIconOffset: {
    marginLeft: 2,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  artist: {
    color: colors.muted,
    fontSize: 11,
    flex: 1,
  },
  requestBtn: {
    backgroundColor: colors.darkAccent,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  requestBtnSent: {
    backgroundColor: colors.raised,
    borderColor: colors.line,
  },
  requestBtnText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: 'rgba(233, 255, 96, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPanel: {
    gap: 8,
  },
  searchPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  searchTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchHeaderTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  closeSearchBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeoverBanner: {
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.small,
    padding: spacing.sm,
    gap: 4,
    marginBottom: spacing.xs,
  },
  takeoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  takeoverTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  takeoverBody: {
    color: colors.muted,
    fontSize: 11,
  },
  claimBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.small,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  claimBtnText: {
    color: colors.primaryForeground,
    fontSize: 12,
    fontWeight: '700',
  },
  pendingRequestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.darkAccent,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.small,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  pendingRequestTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.xs,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 4,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.small,
  },
  approveBtn: {
    backgroundColor: colors.accent,
  },
  approveText: {
    color: colors.primaryForeground,
    fontSize: 10,
    fontWeight: '700',
  },
  rejectBtn: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rejectText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
});
