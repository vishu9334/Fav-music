import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Lock, Globe, MessageSquare, Clock, X } from 'lucide-react-native';
import { RoomAccess, RoomChatPolicy, RoomDto } from '@aadat/contracts';
import { colors, radius, spacing } from '../../design/theme';
import { roomApiClient } from '../../services/room/room-api.client';

export interface CreateRoomModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (room: RoomDto, passcode?: string) => void;
}

export function CreateRoomModal({
  visible,
  userId,
  onClose,
  onCreated,
}: CreateRoomModalProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [access, setAccess] = useState<RoomAccess>(RoomAccess.PUBLIC);
  const [passcode, setPasscode] = useState('');
  const [chatPolicy, setChatPolicy] = useState<RoomChatPolicy>(
    RoomChatPolicy.EPHEMERAL_SESSION_ONLY
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Room name is required.');
      return;
    }

    if (access === RoomAccess.PRIVATE && (!passcode || passcode.length < 4)) {
      setError('Private rooms require a passcode of at least 4 characters.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const room = await roomApiClient.createRoom(userId, {
        name: trimmedName,
        access,
        passcode: access === RoomAccess.PRIVATE ? passcode : undefined,
        chatPolicy,
      });

      setName('');
      setPasscode('');
      setAccess(RoomAccess.PUBLIC);
      setChatPolicy(RoomChatPolicy.EPHEMERAL_SESSION_ONLY);
      onCreated(room, access === RoomAccess.PRIVATE ? passcode : undefined);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

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
          accessibilityLabel="Close create room modal"
          accessibilityRole="button"
          onPress={onClose}
        />
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>Create Listening Room</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeBtn}
              onPress={onClose}
            >
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {error && (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Room Name */}
            <Text style={styles.label}>Room Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Midnight Beats, Indie Chill"
              placeholderTextColor={colors.tertiary}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (error) setError(null);
              }}
              maxLength={50}
              autoFocus
              accessibilityLabel="Room Name Input"
            />

            {/* Access Selector (Public vs Private) */}
            <Text style={styles.label}>Room Access</Text>
            <View style={styles.pillRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Public Room"
                style={[styles.pill, access === RoomAccess.PUBLIC && styles.pillActive]}
                onPress={() => setAccess(RoomAccess.PUBLIC)}
              >
                <Globe
                  size={16}
                  color={access === RoomAccess.PUBLIC ? colors.accent : colors.muted}
                />
                <Text
                  style={[
                    styles.pillText,
                    access === RoomAccess.PUBLIC && styles.pillTextActive,
                  ]}
                >
                  Public
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Private Room"
                style={[styles.pill, access === RoomAccess.PRIVATE && styles.pillActive]}
                onPress={() => setAccess(RoomAccess.PRIVATE)}
              >
                <Lock
                  size={16}
                  color={access === RoomAccess.PRIVATE ? colors.accent : colors.muted}
                />
                <Text
                  style={[
                    styles.pillText,
                    access === RoomAccess.PRIVATE && styles.pillTextActive,
                  ]}
                >
                  Private (Passcode)
                </Text>
              </Pressable>
            </View>

            {/* Passcode (if private) */}
            {access === RoomAccess.PRIVATE && (
              <View style={styles.passcodeContainer}>
                <Text style={styles.label}>Passcode</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Min 4 digits or characters"
                  placeholderTextColor={colors.tertiary}
                  value={passcode}
                  onChangeText={(text) => {
                    setPasscode(text);
                    if (error) setError(null);
                  }}
                  secureTextEntry
                  maxLength={16}
                  accessibilityLabel="Passcode Input"
                />
              </View>
            )}

            {/* Chat Policy */}
            <Text style={styles.label}>Chat Retention Policy</Text>
            <View style={styles.pillRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ephemeral Chat Policy"
                style={[
                  styles.pill,
                  chatPolicy === RoomChatPolicy.EPHEMERAL_SESSION_ONLY && styles.pillActive,
                ]}
                onPress={() => setChatPolicy(RoomChatPolicy.EPHEMERAL_SESSION_ONLY)}
              >
                <Clock
                  size={16}
                  color={
                    chatPolicy === RoomChatPolicy.EPHEMERAL_SESSION_ONLY
                      ? colors.accent
                      : colors.muted
                  }
                />
                <Text
                  style={[
                    styles.pillText,
                    chatPolicy === RoomChatPolicy.EPHEMERAL_SESSION_ONLY &&
                      styles.pillTextActive,
                  ]}
                >
                  Ephemeral (Session Only)
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Persistent Log Policy"
                style={[
                  styles.pill,
                  chatPolicy === RoomChatPolicy.PERSISTENT_LOG && styles.pillActive,
                ]}
                onPress={() => setChatPolicy(RoomChatPolicy.PERSISTENT_LOG)}
              >
                <MessageSquare
                  size={16}
                  color={
                    chatPolicy === RoomChatPolicy.PERSISTENT_LOG ? colors.accent : colors.muted
                  }
                />
                <Text
                  style={[
                    styles.pillText,
                    chatPolicy === RoomChatPolicy.PERSISTENT_LOG && styles.pillTextActive,
                  ]}
                >
                  Persistent Log
                </Text>
              </Pressable>
            </View>

            {/* Submit Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create and Enter Room"
              style={[styles.createBtn, loading && styles.btnDisabled]}
              disabled={loading || !name.trim()}
              onPress={handleCreate}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.createBtnText}>Create & Join Room</Text>
              )}
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
    maxWidth: 440,
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
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: colors.raised,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.raised,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 46,
  },
  pillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.darkAccent,
  },
  pillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextActive: {
    color: colors.text,
  },
  passcodeContainer: {
    gap: spacing.sm,
  },
  createBtn: {
    backgroundColor: colors.accent,
    minHeight: 50,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: colors.primaryForeground,
    fontSize: 14,
    fontWeight: '700',
  },
  errorBox: {
    padding: spacing.sm,
    backgroundColor: colors.errorSurface,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.destructive,
  },
  errorText: {
    color: colors.text,
    fontSize: 12,
    textAlign: 'center',
  },
});

