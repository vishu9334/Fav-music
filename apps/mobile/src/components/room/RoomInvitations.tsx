import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../design/controls';
import { colors } from '../../design/theme';
import { useRoomStore, type RoomInvitation } from '../../store/useRoomStore';

function InvitationCard({ invitation, onJoinRoom }: { invitation: RoomInvitation; onJoinRoom: (roomId: string, passcode?: string) => void }): React.JSX.Element {
  const [passcode, setPasscode] = useState('');
  const connected = useRoomStore(s => s.socketConnected);
  return <View style={styles.card}>
    <Text style={styles.title}>{invitation.invitedBy.displayName} invited you to {invitation.roomName}</Text>
    <Text style={styles.help}>For a private room, enter the passcode shared by the host.</Text>
    <TextInput value={passcode} onChangeText={setPasscode} secureTextEntry autoCapitalize="none" autoCorrect={false}
      accessibilityLabel="Invited room passcode" placeholder="Passcode, if private" placeholderTextColor={colors.text} style={styles.input} maxLength={64} />
    <View style={styles.actions}><Button title="Join room chat" disabled={!connected} onPress={() => onJoinRoom(invitation.roomId, passcode.trim() || undefined)} />
      <Button title="Dismiss invite" secondary onPress={() => useRoomStore.getState().dismissInvitation(invitation.roomId)} /></View>
  </View>;
}
export function RoomInvitations({ onJoinRoom }: { onJoinRoom: (roomId: string, passcode?: string) => void }): React.JSX.Element | null {
  const invitation = useRoomStore(s => s.invitations[0]);
  return invitation ? <InvitationCard key={invitation.roomId} invitation={invitation} onJoinRoom={onJoinRoom} /> : null;
}
const styles = StyleSheet.create({
  card: { margin: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.panel, gap: 8 },
  title: { color: colors.text, fontSize: 13, fontWeight: '600' }, help: { color: colors.text, fontSize: 12, lineHeight: 18 },
  input: { minHeight: 44, color: colors.text, fontSize: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
