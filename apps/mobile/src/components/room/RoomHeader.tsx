import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowLeft, Lock, Globe, Users, UserPlus } from 'lucide-react-native';
import { RoomAccess, RoomChatPolicy, RoomDto } from '@aadat/contracts';
import { colors, radius, spacing } from '../../design/theme';

export interface RoomHeaderProps {
  room: RoomDto;
  participantCount: number;
  onLeave: () => void;
  onOpenParticipants: () => void;
  onOpenInvite: () => void;
}

export function RoomHeader({
  room,
  participantCount,
  onLeave,
  onOpenParticipants,
  onOpenInvite,
}: RoomHeaderProps): React.JSX.Element {
  const isPrivate = room.access === RoomAccess.PRIVATE;

  return (
    <View style={styles.headerContainer}>
      <View style={styles.leftRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave room"
          style={styles.iconBtn}
          onPress={onLeave}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>

        <View style={styles.titleArea}>
          <Text style={styles.roomName} numberOfLines={1}>
            {room.name}
          </Text>
          <Text selectable style={styles.roomCode} accessibilityLabel={`Room code: ${room.id}`}>Code: {room.id}</Text>
          <View style={styles.tagRow}>
            <View style={styles.accessTag}>
              {isPrivate ? (
                <Lock size={10} color={colors.muted} />
              ) : (
                <Globe size={10} color={colors.muted} />
              )}
              <Text style={styles.tagText}>{isPrivate ? 'Private' : 'Public'}</Text>
            </View>
            <Text style={styles.tagDot}>•</Text>
            <Text style={styles.tagText}>
              {room.chatPolicy === RoomChatPolicy.PERSISTENT_LOG
                ? 'Persistent Log'
                : 'Ephemeral'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.rightRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Invite listeners to room"
          style={styles.iconBtn}
          onPress={onOpenInvite}
        >
          <UserPlus size={19} color={colors.muted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${participantCount} of 10 participants`}
          style={styles.participantsPill}
          onPress={onOpenParticipants}
        >
          <Users size={14} color={colors.accent} />
          <Text style={styles.participantsText}>{participantCount}/10</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  roomCode: { color: colors.accent, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.small,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleArea: {
    flex: 1,
    gap: 2,
  },
  roomName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accessTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tagDot: {
    color: colors.tertiary,
    fontSize: 10,
  },
  tagText: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  participantsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.darkAccent,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  participantsText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
});

