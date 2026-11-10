import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthModule } from '../auth/auth.module';
import { colors, spacing } from '../design/theme';
import { useRoomStore } from '../store/useRoomStore';
import { roomSocketClient } from '../services/room/room-socket.client';
import { RoomDiscoveryView } from '../components/room/RoomDiscoveryView';
import { RoomHeader } from '../components/room/RoomHeader';
import { RoomSharedPlayer } from '../components/room/RoomSharedPlayer';
import { RoomChatView } from '../components/room/RoomChatView';
import { RoomParticipantSheet } from '../components/room/RoomParticipantSheet';
import { RoomInviteModal } from '../components/room/RoomInviteModal';
import { UserIdCard } from '../auth/components/user-id.card';

export function RoomsScreen(): React.JSX.Element {
  const controller = AuthModule.getController();
  const { user } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  const currentRoom = useRoomStore((s) => s.currentRoom);
  const isRoomActive = useRoomStore((s) => s.isRoomActive);
  const participants = useRoomStore((s) => s.participants);
  const isController = useRoomStore((s) => s.isController);
  const pendingRequests = useRoomStore((s) => s.pendingControlRequests);
  const socketConnected = useRoomStore((s) => s.socketConnected);

  const [connecting, setConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participantsModalOpen, setParticipantsModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [lastUsedPasscode, setLastUsedPasscode] = useState<string | undefined>(undefined);

  // Connect socket with authenticated user session
  useEffect(() => {
    if (!user?.id) return;

    let mounted = true;
    setConnecting(true);

    roomSocketClient
      .connect(user.id)
      .catch(() => {
        if (mounted) {
          setErrorMessage('Failed to connect to real-time room server.');
        }
      })
      .finally(() => {
        if (mounted) setConnecting(false);
      });

    // Set error listener
    roomSocketClient.setListener({
      onError: (err) => {
        setErrorMessage(err.message || 'Room error occurred.');
        setTimeout(() => setErrorMessage(null), 5000);
      },
    });

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleJoinRoom = async (roomId: string, passcode?: string) => {
    if (!user?.id) return;

    try {
      setErrorMessage(null);
      if (!roomSocketClient.isConnected()) {
        await roomSocketClient.connect(user.id);
      }
      setLastUsedPasscode(passcode);
      roomSocketClient.joinRoom(roomId, passcode);
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Failed to join room.');
    }
  };

  const handleLeaveRoom = () => {
    if (!currentRoom) return;
    roomSocketClient.leaveRoom(currentRoom.id);
    setParticipantsModalOpen(false);
    setInviteModalOpen(false);
    setLastUsedPasscode(undefined);
  };

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.infoText}>Please sign in to access listening rooms.</Text>
      </View>
    );
  }

  if (connecting && !socketConnected && !isRoomActive) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.infoText}>Connecting to Listening Rooms…</Text>
        <UserIdCard userId={user.id} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeContainer}>
      {/* Global Error Banner */}
      {errorMessage && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      {/* Main View: In-Room vs Discovery */}
      {isRoomActive && currentRoom ? (
        <View style={styles.roomContainer}>
          {/* Room Header */}
          <RoomHeader
            room={currentRoom}
            participantCount={participants.length}
            onLeave={handleLeaveRoom}
            onOpenParticipants={() => setParticipantsModalOpen(true)}
            onOpenInvite={() => setInviteModalOpen(true)}
          />

          {/* Shared Player with Kobra Controls */}
          <RoomSharedPlayer key={currentRoom.id} roomId={currentRoom.id} />

          {/* Real-time Chat */}
          <RoomChatView key={currentRoom.id} roomId={currentRoom.id} currentUserId={user.id} />

          {/* Participants Sheet */}
          <RoomParticipantSheet
            visible={participantsModalOpen}
            roomId={currentRoom.id}
            currentUserId={user.id}
            isController={isController}
            participants={participants}
            pendingRequests={pendingRequests}
            onClose={() => setParticipantsModalOpen(false)}
          />

          {/* Invite Modal */}
          <RoomInviteModal
            key={currentRoom.id}
            visible={inviteModalOpen}
            room={currentRoom}
            passcode={lastUsedPasscode}
            onClose={() => setInviteModalOpen(false)}
          />
        </View>
      ) : (
        <RoomDiscoveryView userId={user.id} onJoinRoom={handleJoinRoom} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.page,
  },
  infoText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  roomContainer: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: colors.errorSurface,
    borderBottomWidth: 1,
    borderColor: colors.destructive,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.page,
  },
  errorBannerText: {
    color: colors.text,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default RoomsScreen;
