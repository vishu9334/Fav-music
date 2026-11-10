import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Send, Clock, ShieldAlert, Check, X } from 'lucide-react-native';
import { RoomChatMessageDto } from '@aadat/contracts';
import { colors, radius, spacing } from '../../design/theme';
import { useRoomStore } from '../../store/useRoomStore';
import { roomSocketClient } from '../../services/room/room-socket.client';
import { RoomTypingSignal } from '../../services/room/room-typing.signal';

export interface RoomChatViewProps {
  roomId: string;
  currentUserId: string;
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

export function RoomChatView({ roomId, currentUserId }: RoomChatViewProps): React.JSX.Element {
  const chatMessages = useRoomStore((s) => s.chatMessages);
  const typingUserIds = useRoomStore((s) => s.typingUserIds);
  const participants = useRoomStore((s) => s.participants);
  const requiresConsentPrompt = useRoomStore((s) => s.requiresConsentPrompt);
  const connected = useRoomStore(s => s.socketConnected);

  const [inputText, setInputText] = useState('');
  const [typing] = useState(() => new RoomTypingSignal(value => {
    if (roomSocketClient.isConnected()) roomSocketClient.sendTyping(roomId, value);
  }));
  const flatListRef = useRef<FlatList>(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    if (!connected) typing.stop();
    return () => typing.stop();
  }, [typing, connected]);

  // Auto scroll on new messages
  useEffect(() => {
    if (chatMessages.length > 0 && (nearBottom.current || chatMessages[chatMessages.length - 1]?.senderId === currentUserId)) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [chatMessages[chatMessages.length - 1]?.id, currentUserId]);

  const handleTextChange = (text: string) => {
    setInputText(text);

    if (connected) typing.update(text);
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || !connected) return;

    roomSocketClient.sendMessage(roomId, trimmed);
    setInputText('');

    typing.stop();
  };

  const handleConsent = (consent: boolean) => {
    roomSocketClient.sendConsentResponse(roomId, consent);
  };

  // Find typing user display names (excluding self)
  const typingNames = typingUserIds
    .filter((id) => id !== currentUserId)
    .map((id) => {
      const p = participants.find((part) => part.userId === id);
      return p?.user?.displayName ?? 'Someone';
    });

  const typingString =
    typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : typingNames.length > 1
      ? `${typingNames.slice(0, 2).join(', ')} are typing…`
      : null;

  const renderMessage = ({ item }: { item: RoomChatMessageDto }) => {
    const isSelf = item.senderId === currentUserId;
    const senderName = isSelf ? 'You' : item.sender?.displayName ?? 'Listener';

    const handleShareUserId = () => {
      void Share.share({
        title: `${senderName}'s Fav Music User ID`,
        message: `Fav Music User ID for ${senderName}:\n${item.senderId}`,
      }).catch(() => {});
    };

    return (
      <View style={[styles.bubbleContainer, isSelf ? styles.alignRight : styles.alignLeft]}>
        {!isSelf && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share User ID for ${senderName}`}
            onPress={handleShareUserId}
          >
            <Text style={styles.senderLabel}>{senderName}</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.bubble, isSelf ? styles.bubbleSelf : styles.bubbleOther]}
          onLongPress={handleShareUserId}
          accessibilityHint="Long press to share user ID to continue chat"
        >
          <Text style={[styles.messageText, isSelf && styles.messageTextSelf]}>
            {item.content}
          </Text>
          <View style={styles.metaRow}>
            {item.isEphemeral && (
              <View style={styles.ephemeralBadge}>
                <Clock size={10} color={isSelf ? colors.accent : colors.tertiary} />
                <Text style={[styles.ephemeralText, isSelf && styles.ephemeralTextSelf]}>
                  Ephemeral
                </Text>
              </View>
            )}
            <Text style={[styles.timeText, isSelf && styles.timeTextSelf]}>
              {formatMessageTime(item.timestamp)}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Consent Prompt Banner */}
      {requiresConsentPrompt && (
        <View style={styles.consentBanner} accessibilityRole="alert">
          <View style={styles.consentHeader}>
            <ShieldAlert size={16} color={colors.accent} />
            <Text style={styles.consentTitle}>Persistent Chat Notice</Text>
          </View>
          <Text style={styles.consentBody}>
            This room logs messages to persistent history. Would you like your messages saved in
            this room's log?
          </Text>
          <View style={styles.consentActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Consent to Persistent Log"
              style={[styles.consentBtn, styles.consentApprove]}
              onPress={() => handleConsent(true)}
            >
              <Check size={14} color={colors.primaryForeground} />
              <Text style={styles.consentApproveText}>Consent to Log</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decline and Keep Ephemeral"
              style={[styles.consentBtn, styles.consentDecline]}
              onPress={() => handleConsent(false)}
            >
              <X size={14} color={colors.muted} />
              <Text style={styles.consentDeclineText}>Keep Ephemeral</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Messages Stream */}
      <FlatList
        ref={flatListRef}
        data={chatMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        onScroll={event => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
        }}
        scrollEventThrottle={100}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet. Say hello to the room!</Text>
          </View>
        }
      />

      {/* Typing Indicator Strip */}
      {typingString && (
        <View style={styles.typingStrip}>
          <Text style={styles.typingText}>{typingString}</Text>
        </View>
      )}

      {/* Input Row */}
      {!connected && <Text style={styles.typingText} accessibilityLiveRegion="polite">Reconnecting. Your message draft stays here.</Text>}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Say something…"
          placeholderTextColor={colors.tertiary}
          value={inputText}
          onChangeText={handleTextChange}
          maxLength={1000}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          accessibilityLabel="Chat Message Input"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={[styles.sendBtn, (!inputText.trim() || !connected) && styles.sendBtnDisabled]}
          disabled={!inputText.trim() || !connected}
          onPress={handleSend}
        >
          <Send size={18} color={inputText.trim() ? colors.primaryForeground : colors.muted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.sm,
  },
  listContent: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  bubbleContainer: {
    maxWidth: '82%',
    gap: 3,
  },
  alignLeft: {
    alignSelf: 'flex-start',
  },
  alignRight: {
    alignSelf: 'flex-end',
  },
  senderLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  bubble: {
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  bubbleOther: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: 4,
  },
  bubbleSelf: {
    backgroundColor: colors.darkAccent,
    borderWidth: 1,
    borderColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  messageText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextSelf: {
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 2,
  },
  ephemeralBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ephemeralText: {
    color: colors.tertiary,
    fontSize: 10,
  },
  ephemeralTextSelf: {
    color: colors.text,
  },
  timeText: {
    color: colors.tertiary,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  timeTextSelf: {
    color: colors.tertiary,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.tertiary,
    fontSize: 13,
  },
  typingStrip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  typingText: {
    color: colors.muted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  input: {
    flex: 1,
    backgroundColor: colors.raised,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  consentBanner: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.small,
    padding: spacing.md,
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  consentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  consentTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  consentBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  consentActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  consentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.small,
  },
  consentApprove: {
    backgroundColor: colors.accent,
  },
  consentApproveText: {
    color: colors.primaryForeground,
    fontSize: 11,
    fontWeight: '700',
  },
  consentDecline: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  consentDeclineText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
});

