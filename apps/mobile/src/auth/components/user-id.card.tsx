import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../design/controls';
import { colors } from '../../design/theme';

/** The server-verified account ID, never a Google identifier or a session credential. */
export function UserIdCard({ userId, compact = false }: { userId: string; compact?: boolean }): React.JSX.Element {
  return <View style={[styles.card, compact && styles.row]}>
    <Text style={[styles.label, compact && styles.smallLabel]}>Your Fav Music User ID</Text>
    <Text selectable accessibilityLabel={`Your Fav Music User ID: ${userId}`} style={[styles.id, compact && styles.smallId]}>{userId}</Text>
    {!compact && <Text style={styles.help}>Long-press to copy, or share this ID. Open Listening rooms to receive a host’s invite.</Text>}
    <Button title={compact ? 'Share ID' : 'Share my User ID'} secondary onPress={() => {
      void Share.share({ title: 'My Fav Music User ID', message: `Invite me to your Fav Music listening room.\nMy User ID: ${userId}` }).catch(() => {});
    }} />
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 8 },
  label: { color: colors.text, fontSize: 13, fontWeight: '600' },
  id: { color: colors.text, fontSize: 12, lineHeight: 18 },
  help: { color: colors.text, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center' }, smallLabel: { maxWidth: 64, fontSize: 11 }, smallId: { flex: 1, minWidth: 0, fontSize: 11 },
});
