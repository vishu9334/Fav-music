import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Search,
  Plus,
  Lock,
  Globe,
  Users,
  Music,
  RotateCcw,
  X,
  KeyRound,
} from 'lucide-react-native';
import { RoomAccess, RoomChatPolicy, RoomDto } from '@aadat/contracts';
import { colors, radius, spacing } from '../../design/theme';
import { GlassSurface } from '../../design/GlassSurface';
import { roomApiClient } from '../../services/room/room-api.client';
import { CreateRoomModal } from './CreateRoomModal';
import { RoomInvitations } from './RoomInvitations';

export interface RoomDiscoveryViewProps {
  userId: string;
  onJoinRoom: (roomId: string, passcode?: string) => void;
}

export function RoomDiscoveryView({
  userId,
  onJoinRoom,
}: RoomDiscoveryViewProps): React.JSX.Element {
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [privateJoinModalVisible, setPrivateJoinModalVisible] = useState(false);
  const [targetRoomId, setTargetRoomId] = useState('');
  const [privatePasscode, setPrivatePasscode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      setError(null);
      const publicRooms = await roomApiClient.getPublicRooms();
      setRooms(publicRooms);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load listening rooms.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchRooms();
  }, [fetchRooms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchRooms();
  }, [fetchRooms]);

  const handleRoomCreated = (room: RoomDto, passcode?: string) => {
    setCreateModalVisible(false);
    onJoinRoom(room.id, passcode);
  };

  const handleJoinPrivate = () => {
    const trimmedId = targetRoomId.trim();
    if (!trimmedId) {
      setJoinError('Please enter the 6-character room code.');
      return;
    }
    const isCode = /^[a-z]{4}\d{2}$/i.test(trimmedId);
    const isLegacyId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(trimmedId);
    if (!isCode && !isLegacyId) {
      setJoinError('Enter 4 letters and 2 digits, for example VIKU42.');
      return;
    }
    setPrivateJoinModalVisible(false);
    setJoinError(null);
    onJoinRoom(isCode ? trimmedId.toUpperCase() : trimmedId, privatePasscode.trim() || undefined);
    setTargetRoomId('');
    setPrivatePasscode('');
  };

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const renderRoomCard = ({ item }: { item: RoomDto }) => {
    const isPrivate = item.access === RoomAccess.PRIVATE;
    const isFull = item.participantCount >= item.maxParticipants;

    return (
      <GlassSurface style={styles.roomCard}>
        <View style={styles.cardHeader}>
          <View style={styles.titleArea}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.badgeRow}>
              <View style={styles.accessBadge}>
                {isPrivate ? (
                  <Lock size={10} color={colors.muted} />
                ) : (
                  <Globe size={10} color={colors.muted} />
                )}
                <Text style={styles.badgeText}>{isPrivate ? 'Private' : 'Public'}</Text>
              </View>
              <Text style={styles.badgeDot}>•</Text>
              <Text style={styles.policyText}>
                {item.chatPolicy === RoomChatPolicy.PERSISTENT_LOG
                  ? 'Persistent'
                  : 'Ephemeral'}
              </Text>
            </View>
          </View>

          <View style={styles.participantCount}>
            <Users size={12} color={isFull ? colors.warning : colors.accent} />
            <Text style={[styles.countText, isFull && styles.countFull]}>
              {item.participantCount}/{item.maxParticipants}
            </Text>
          </View>
        </View>

        {item.currentTrack && (
          <View style={styles.currentTrackRow}>
            <Music size={12} color={colors.accent} />
            <Text style={styles.currentTrackText} numberOfLines={1}>
              {item.currentTrack.title} — {item.currentTrack.artistName}
            </Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFull ? 'Room full' : `Join ${item.name}`}
            style={[styles.joinBtn, isFull && styles.joinBtnDisabled]}
            disabled={isFull}
            onPress={() => {
              if (isPrivate) {
                setTargetRoomId(item.id);
                setPrivateJoinModalVisible(true);
              } else {
                onJoinRoom(item.id);
              }
            }}
          >
            <Text style={styles.joinBtnText}>{isFull ? 'Room Full' : 'Join Room'}</Text>
          </Pressable>
        </View>
      </GlassSurface>
    );
  };

  return (
    <View style={styles.container}>
      <RoomInvitations onJoinRoom={onJoinRoom} />
      {/* Search and Action Bar */}
      <View style={styles.actionBar}>
        <View style={styles.searchBox}>
          <Search size={16} color={colors.tertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search listening rooms…"
            placeholderTextColor={colors.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Search listening rooms"
          />
          {searchQuery.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setSearchQuery('')}
            >
              <X size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create Listening Room"
          style={styles.createBtn}
          onPress={() => setCreateModalVisible(true)}
        >
          <Plus size={18} color={colors.primaryForeground} />
          <Text style={styles.createBtnText}>Create</Text>
        </Pressable>
      </View>

      {/* Private Room Direct Join Bar */}
      <View style={styles.directJoinRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Join room by code"
          style={styles.directJoinBtn}
          onPress={() => {
            setTargetRoomId('');
            setPrivatePasscode('');
            setJoinError(null);
            setPrivateJoinModalVisible(true);
          }}
        >
          <KeyRound size={14} color={colors.accent} />
          <Text style={styles.directJoinText}>Have a room code?</Text>
        </Pressable>
      </View>

      {/* Rooms List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Discovering active listening rooms…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading rooms"
            style={styles.retryBtn}
            onPress={fetchRooms}
          >
            <RotateCcw size={16} color={colors.primaryForeground} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredRooms}
          keyExtractor={(item) => item.id}
          renderItem={renderRoomCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Users size={36} color={colors.tertiary} />
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No matching rooms found' : 'No active listening rooms'}
              </Text>
              <Text style={styles.emptyBody}>
                {searchQuery
                  ? 'Try adjusting your search terms'
                  : 'Start a collaborative room to listen with friends'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create First Room"
                style={styles.emptyCreateBtn}
                onPress={() => setCreateModalVisible(true)}
              >
                <Plus size={16} color={colors.primaryForeground} />
                <Text style={styles.emptyCreateText}>Create Room</Text>
              </Pressable>
            </View>
          }
        />
      )}

      {/* Create Room Modal */}
      <CreateRoomModal
        visible={createModalVisible}
        userId={userId}
        onClose={() => setCreateModalVisible(false)}
        onCreated={handleRoomCreated}
      />

      {/* Private Room Join Modal */}
      <Modal
        visible={privateJoinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPrivateJoinModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close join private room"
            accessibilityRole="button"
            onPress={() => setPrivateJoinModalVisible(false)}
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join with room code</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setPrivateJoinModalVisible(false)}
              >
                <X size={18} color={colors.muted} />
              </Pressable>
            </View>

            <View style={styles.modalContent}>
              {joinError && <Text style={styles.modalError}>{joinError}</Text>}

              <Text style={styles.inputLabel}>Room code</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. VIKU42"
                placeholderTextColor={colors.tertiary}
                value={targetRoomId}
                onChangeText={(text) => {
                  setTargetRoomId(text);
                  if (joinError) setJoinError(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={36}
                accessibilityLabel="Room code input"
              />

              <Text style={styles.inputLabel}>Passcode (if required)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Room passcode"
                placeholderTextColor={colors.tertiary}
                value={privatePasscode}
                onChangeText={setPrivatePasscode}
                secureTextEntry
                accessibilityLabel="Passcode input"
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enter Room"
                style={styles.modalSubmitBtn}
                onPress={handleJoinPrivate}
              >
                <Text style={styles.modalSubmitText}>Join Room</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.raised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    padding: 0,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  createBtnText: {
    color: colors.primaryForeground,
    fontSize: 13,
    fontWeight: '700',
  },
  directJoinRow: {
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.xs,
  },
  directJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  directJoinText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.page,
    gap: spacing.md,
  },
  roomCard: {
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleArea: {
    flex: 1,
    gap: 4,
    marginRight: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  badgeText: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  badgeDot: {
    color: colors.tertiary,
    fontSize: 10,
  },
  policyText: {
    color: colors.tertiary,
    fontSize: 11,
  },
  participantCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.raised,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  countText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  countFull: {
    color: colors.text,
  },
  currentTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.raised,
    padding: spacing.sm,
    borderRadius: radius.small,
  },
  currentTrackText: {
    color: colors.muted,
    fontSize: 12,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 4,
  },
  joinBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.small,
  },
  joinBtnDisabled: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  joinBtnText: {
    color: colors.primaryForeground,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.page,
  },
  errorText: {
    color: colors.text,
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.page,
    paddingVertical: 10,
    borderRadius: radius.small,
  },
  retryBtnText: {
    color: colors.primaryForeground,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.page,
    paddingVertical: 10,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  emptyCreateText: {
    color: colors.primaryForeground,
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.page,
  },
  modalBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.panel,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  modalContent: {
    padding: spacing.page,
    gap: spacing.md,
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modalInput: {
    backgroundColor: colors.raised,
    color: colors.text,
    fontSize: 13,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalSubmitBtn: {
    backgroundColor: colors.accent,
    minHeight: 48,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  modalSubmitText: {
    color: colors.primaryForeground,
    fontSize: 14,
    fontWeight: '700',
  },
  modalError: {
    color: colors.text,
    fontSize: 12,
  },
});

