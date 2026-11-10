import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { X, Lock, Hash, Share2 } from 'lucide-react-native';
import { RoomDto } from '@aadat/contracts';
import { colors, radius, spacing } from '../../design/theme';

export interface RoomInviteModalProps {
  visible: boolean;
  room: RoomDto;
  passcode?: string;
  onClose: () => void;
}

export function RoomInviteModal({
  visible,
  room,
  passcode,
  onClose,
}: RoomInviteModalProps): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Close invite modal"
          accessibilityRole="button"
          onPress={onClose}
        />
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>Share room code</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeBtn}
              onPress={onClose}
            >
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.roomName}>{room.name}</Text>

            {/* Share the room code; no username or account ID is needed. */}
            <View style={styles.fieldBox}>
              <View style={styles.fieldHeader}>
                <Hash size={14} color={colors.muted} />
                <Text style={styles.fieldLabel}>Room code</Text>
              </View>
              <Text selectable style={styles.selectableText} accessibilityLabel={`Room code: ${room.id}`}>{room.id}</Text>
              <Text style={styles.successText}>Share this code. Your friend can enter it in Listening rooms to join.</Text>
            </View>

            {/* Passcode (if provided) */}
            {passcode && (
              <View style={styles.fieldBox}>
                <View style={styles.fieldHeader}>
                  <Lock size={14} color={colors.muted} />
                  <Text style={styles.fieldLabel}>Passcode</Text>
                </View>
                <TextInput
                  style={styles.selectableText}
                  value={passcode}
                  editable={false}
                  selectTextOnFocus
                  accessibilityLabel="Room Passcode"
                />
              </View>
            )}

            {/* Share Room Invite */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share Room Invite"
              style={styles.shareInviteBtn}
              onPress={() => {
                const inviteMsg = `Join my Fav Music listening room "${room.name}"!\nRoom code: ${room.id}${passcode ? `\nPasscode: ${passcode}` : ''}\nListen & chat together in real time on Fav Music!`;
                void Share.share({ title: `Join ${room.name} on Fav Music`, message: inviteMsg }).catch(() => {});
              }}
            >
              <Share2 size={15} color={colors.primaryForeground} />
              <Text style={styles.shareInviteBtnText}>Share Room Invite</Text>
            </Pressable>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.page,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    maxWidth: 420,
    backgroundColor: colors.panel,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.small,
  },
  content: {
    padding: spacing.page,
    gap: spacing.md,
  },
  roomName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  fieldBox: {
    backgroundColor: colors.raised,
    padding: spacing.sm,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.xs,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  selectableText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    padding: 0,
    margin: 0,
  },
  shareInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.small,
  },
  shareInviteBtnText: {
    color: colors.primaryForeground,
    fontSize: 13,
    fontWeight: '700',
  },
  inviteSection: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.raised,
    color: colors.text,
    fontSize: 13,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sendBtn: {
    width: 44,
    height: 44,
    backgroundColor: colors.accent,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  successText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});

