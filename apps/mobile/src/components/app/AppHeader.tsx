import React, { useState, useSyncExternalStore } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Search, Shuffle, X, ChevronRight, Home, Library, Boxes, Compass, Video, Disc3, Clock3, UserCircle, Radio } from 'lucide-react-native';
import { AuthModule } from '../../auth/auth.module';
import { useDiscoveryStore } from '../../store/useDiscoveryStore';
import { colors, IconButton, ui } from './ui';
import { useReducedMotion } from '../../design/useReducedMotion';
import { APP_NAME, APP_WORDMARK } from '../../design/branding';
import { BrandLogo } from '../../design/BrandLogo';

export const accountNavigation = [
  { title: 'Home', route: '/', icon: Home, group: 'Your space' },
  { title: 'Search', route: '/search', icon: Search, group: 'Your space' },
  { title: 'Listening rooms', route: '/rooms', icon: Radio, group: 'Your space' },
  { title: 'Library & playlists', route: '/library', icon: Library, group: 'Your space' },
  { title: 'Music Warehouse', route: '/warehouse', icon: Boxes, group: 'Your space' },
  { title: 'Your moment', route: '/discovery', icon: Compass, group: 'Find your feeling' },
  { title: 'Music videos', route: '/videos', icon: Video, group: 'Find your feeling' },
  { title: 'Explore catalog', route: '/provider-browse', icon: Disc3, group: 'Find your feeling' },
  { title: 'Listening history', route: '/history', icon: Clock3, group: 'Your account' },
  { title: 'Profile & privacy', route: '/profile', icon: UserCircle, group: 'Your account' },
] as const;

/** Reference header and grouped navigation; identity always comes from the verified controller. */
export function AppHeader(): React.JSX.Element | null {
  const router = useRouter(), pathname = usePathname();
  const controller = AuthModule.getController();
  const { user } = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const busy = useDiscoveryStore(s => s.busy);
  const title = accountNavigation.find(item => item.route === pathname)?.title ?? (pathname.includes('playlist') ? 'Playlist' : 'Your music');
  if (pathname === '/player') return null;
  const navigate = (route: string) => { setOpen(false); router.push(route as Href); };
  const random = () => { setOpen(false); void useDiscoveryStore.getState().playRandom().then(id => router.push(id ? '/player' : '/discovery')); };
  const initials = user?.displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() ?? '';
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.header}>
    <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel={`Open ${APP_NAME} navigation`} accessibilityState={{ expanded: open }} style={[styles.mark, pathname === '/' && styles.homeMark]} onPress={() => setOpen(true)}><BrandLogo size={32} decorative /></Pressable>
      <Text style={styles.label} numberOfLines={1}>{title}</Text>
      <IconButton icon={Radio} label="Open listening rooms" onPress={() => navigate('/rooms')} />
      <IconButton icon={Shuffle} label="Play a suitable random song" disabled={busy} onPress={random} />
      <IconButton icon={Search} label="Open search" onPress={() => navigate('/search')} />
      <Pressable accessibilityRole="button" accessibilityLabel="Open your account" style={styles.avatar} onPress={() => navigate('/profile')}>
        {user?.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.initials}>{initials}</Text>
        )}
      </Pressable>
    </View>
    <Modal transparent visible={open} animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setOpen(false)} statusBarTranslucent>
      <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close navigation" accessibilityRole="button" onPress={() => setOpen(false)} />
        <SafeAreaView style={styles.menu} edges={['top', 'bottom', 'left', 'right']}><View style={styles.menuHeading}><Text style={ui.eyebrow}>{APP_WORDMARK}</Text><IconButton icon={X} label="Close navigation" onPress={() => setOpen(false)} /></View>
          <ScrollView contentContainerStyle={styles.menuContent} keyboardShouldPersistTaps="handled">
            <Pressable accessibilityRole="button" disabled={busy} onPress={random} style={styles.random}><Shuffle size={20} color={colors.accent} /><Text style={styles.menuTitle}>{busy ? 'Finding your next song…' : 'Play something for this moment'}</Text></Pressable>
            {accountNavigation.map(({ title: label, route, icon: Icon, group }, index) => <React.Fragment key={route}>
              {index > 0 && accountNavigation[index - 1]?.group !== group && <Text style={styles.group}>{group}</Text>}
              <Pressable accessibilityRole="button" accessibilityState={{ selected: pathname === route }} onPress={() => navigate(route)} style={[styles.menuRow, pathname === route && styles.selected]}><Icon size={20} color={pathname === route ? colors.accent : colors.muted} /><Text style={styles.menuTitle}>{label}</Text><ChevronRight size={16} color={colors.muted} /></Pressable>
            </React.Fragment>)}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, row: { minHeight: 60, paddingHorizontal: 18, gap: 8, flexDirection: 'row', alignItems: 'center' },
  mark: { minWidth: 44, minHeight: 44, borderRadius: 14, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, label: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '600' },
  homeMark: { backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 44, height: 44, borderRadius: 22, resizeMode: 'cover' },
  initials: { color: colors.text, fontSize: 12, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-start' }, menu: { backgroundColor: colors.panel, maxWidth: 480, width: '100%', maxHeight: '94%', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderWidth: 1, borderColor: colors.line },
  menuHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 }, menuContent: { padding: 18, gap: 6, paddingBottom: 24 },
  random: { minHeight: 52, borderRadius: 16, padding: 14, backgroundColor: colors.darkAccent, flexDirection: 'row', alignItems: 'center', gap: 12 }, group: { color: colors.muted, textTransform: 'uppercase', fontSize: 10, fontWeight: '600', letterSpacing: 1.5, paddingTop: 18, paddingBottom: 6 },
  menuRow: { flexDirection: 'row', alignItems: 'center', minHeight: 50, padding: 12, gap: 14, borderRadius: 14 }, selected: { backgroundColor: colors.raised }, menuTitle: { color: colors.text, fontSize: 14, flex: 1 },
});
