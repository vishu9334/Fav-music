import { StyleSheet } from 'react-native';
import { colors, radius } from './theme';
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, grow: { flex: 1, minWidth: 0 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.panel, color: colors.text, fontSize: 16 },
  card: { padding: 18, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, gap: 12 },
  pageHeader: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 24, gap: 8 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.7, marginBottom: 4 },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.7, flexShrink: 1 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  iconButton: { minHeight: 44, minWidth: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.darkAccent }, pressed: { opacity: 0.9 }, disabled: { opacity: 0.4 },
  button: { maxWidth: '100%', minHeight: 48, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.controlBorder },
  buttonText: { textAlign: 'center', color: colors.primaryForeground, fontWeight: '700', fontSize: 14 },
  empty: { margin: 20, padding: 24, borderRadius: 24, gap: 14 },
  notice: { padding: 12, borderRadius: 16, backgroundColor: colors.errorSurface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { color: colors.text, fontSize: 13, lineHeight: 19, flex: 1 },
});
