import React from 'react';
import { Text, View } from 'react-native';
import { ArrowLeft, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLibraryStore } from '../../store/useLibraryStore';

export { colors } from '../../design/theme';
import { GlassSurface } from '../../design/GlassSurface';
export { Button, IconButton } from '../../design/controls';
import { Button, IconButton } from '../../design/controls';
export { ui } from '../../design/styles';
import { ui } from '../../design/styles';
export function BackButton(): React.JSX.Element {
  const router = useRouter();
  return <IconButton icon={ArrowLeft} label="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />;
}
export function LibraryNotice(): React.JSX.Element | null {
  const error = useLibraryStore((s) => s.error);
  const status = useLibraryStore((s) => s.status);
  if (!error) return null;
  return <View style={ui.notice} accessibilityLiveRegion="polite"><Text style={ui.noticeText}>{error}</Text>
    {status === 'error' ? <Button title="Retry" secondary onPress={() => { void useLibraryStore.getState().initialize(); }} />
      : <IconButton icon={X} label="Dismiss library message" onPress={useLibraryStore.getState().dismissError} />}
  </View>;
}
export function PageHeader({ title, subtitle, eyebrow = '', back = false, compact = false }: { title: string; subtitle?: string; eyebrow?: string; back?: boolean; compact?: boolean }): React.JSX.Element {
  return <View style={[ui.pageHeader, compact && { paddingTop: 16, paddingBottom: 12, gap: 0 }]}><View style={ui.headingRow}>{back && <BackButton />}<View style={ui.grow}>
    {!!eyebrow && <Text style={ui.eyebrow}>{eyebrow}</Text>}<Text accessibilityRole="header" style={ui.title}>{title}</Text>
  </View></View>{!!subtitle && <Text style={ui.subtitle}>{subtitle}</Text>}<LibraryNotice /></View>;
}
export function EmptyState({ title, message, children }: { title: string; message?: string; children?: React.ReactNode }): React.JSX.Element {
  return <GlassSurface style={ui.empty}><Text style={ui.sectionTitle}>{title}</Text>{!!message && <Text style={ui.body}>{message}</Text>}{children}</GlassSurface>;
}
