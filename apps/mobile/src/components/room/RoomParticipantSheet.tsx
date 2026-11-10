import React from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Crown, Headphones, X, Check, Share2 } from 'lucide-react-native';
import { RoomControlRequestDto, RoomParticipantDto } from '@aadat/contracts';
import { colors, radius, spacing } from '../../design/theme';
import { roomSocketClient } from '../../services/room/room-socket.client';
import { UserIdCard } from '../../auth/components/user-id.card';

export interface RoomParticipantSheetProps {
  visible: boolean;
  roomId: string;
  currentUserId: string;
  isController: boolean;
  participants: RoomParticipantDto[];
  pendingRequests: RoomControlRequestDto[];
  onClose: () => void;
}

export function RoomParticipantSheet({
  visible,
  roomId,
  currentUserId,
  isController,
  participants,
  pendingRequests,
  onClose,
}: RoomParticipantSheetProps): React.JSX.Element {
  const handleApprove = (requestId: string) => {
    roomSocketClient.respondRequest(roomId, requestId, 'APPROVE');
  };

  const handleReject = (requestId: string) => {
    roomSocketClient.respondRequest(roomId, requestId, 'REJECT');
  };

  const renderParticipant = ({ item }: { item: RoomParticipantDto }) => {
    const isSelf = item.userId === currentUserId;
    const name = item.user?.displayName || 'Listener';
    const initials = name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();

    return (
      <View style={styles.participantRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || 'U'}</Text>
        </View>

        <View style={styles.participantInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.participantName} numberOfLines={1}>
              {name} {isSelf && '(You)'}
            </Text>
            {item.isHost && (
              <View style={styles.badgeHost}>
                <Crown size={12} color={colors.warning} />
                <Text style={styles.badgeTextHost}>Host</Text>
              </View>
            )}
            {item.isActiveController && (
              <View style={styles.badgeController}>
                <Headphones size={12} color={colors.accent} />
                <Text style={styles.badgeTextController}>DJ</Text>
              </View>
            )}
          </View>
          <Text style={styles.participantStatus}>
            {item.hasConsentedToPersistentChat ? 'Persistent Log Consented' : 'Ephemeral Mode'}
          </Text>
          <View style={styles.idRow}>
            <Text selectable style={styles.userIdText} numberOfLines={1}>
              ID: {item.userId}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Share ${name}'s User ID`}
              style={styles.shareIdBtn}
              onPress={() => {
                void Share.share({
                  title: `${name}'s Fav Music User ID`,
                  message: `Fav Music User ID for ${name}:\n${item.userId}`,
                }).catch(() => {});
              }}
            >
              <Share2 size={12} color={colors.accent} />
              <Text style={styles.shareIdBtnText}>Share ID</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Close participants sheet"
          accessibilityRole="button"
          onPress={onClose}
        />
        <View style={styles.sheetCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Room Participants</Text>
              <Text style={styles.countText}>{participants.length} of 10 listening</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeBtn}
              onPress={onClose}
            >
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>

          {/* Your User ID Card */}
          <View style={styles.myIdSection}>
            <UserIdCard userId={currentUserId} compact />
          </View>

          {/* Pending Requests Section (for Controller) */}
          {isController && pendingRequests.length > 0 && (
            <View style={styles.requestsSection}>
              <Text style={styles.sectionHeading}>Control Requests ({pendingRequests.length})</Text>
              {pendingRequests.map((req) => (
                <View key={req.id} style={styles.requestItem}>
                  <Text style={styles.requestText} numberOfLines={1}>
                    {req.requester?.displayName ?? 'A listener'} wants DJ control
                  </Text>
                  <View style={styles.actionRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Approve Request"
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={() => handleApprove(req.id)}
                    >
                      <Check size={14} color={colors.primaryForeground} />
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reject Request"
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => handleReject(req.id)}
                    >
                      <X size={14} color={colors.muted} />
                      <Text style={styles.rejectBtnText}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Participants List */}
          <FlatList
            data={participants}
            keyExtractor={(item) => item.userId}
            renderItem={renderParticipant}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: radius.large,
    borderTopRightRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    paddingTop: spacing.page,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  countText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  myIdSection: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.sm,
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.small,
  },
  requestsSection: {
    backgroundColor: colors.raised,
    padding: spacing.page,
    borderBottomWidth: 1,
    borderColor: colors.line,
    gap: spacing.sm,
  },
  sectionHeading: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    padding: spacing.sm,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  requestText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.small,
  },
  approveBtn: {
    backgroundColor: colors.accent,
  },
  approveBtnText: {
    color: colors.primaryForeground,
    fontSize: 11,
    fontWeight: '700',
  },
  rejectBtn: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rejectBtnText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.page,
    gap: spacing.md,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  participantInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  participantName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  badgeHost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.warningSurface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeTextHost: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  badgeController: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.darkAccent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeTextController: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  participantStatus: {
    color: colors.tertiary,
    fontSize: 11,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  userIdText: {
    color: colors.muted,
    fontSize: 10,
    flex: 1,
  },
  shareIdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.raised,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  shareIdBtnText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
});
