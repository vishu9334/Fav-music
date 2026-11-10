import { catalogPending } from '../components/loading/loading-state';
import { catalogEnabled } from '../catalog/catalog-runtime';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { WarehouseStatus } from '@aadat/contracts';
import { demoCatalog, DECADES, SEASONS } from '../catalog/demo-catalog';
import { MOODS, Mood } from '../discovery/discovery.types';
import { recommendations, useDiscoveryStore } from '../store/useDiscoveryStore';
import { useLibraryStore } from '../store/useLibraryStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { FilterRow } from '../components/discovery/FilterRow';
import { SongList } from '../components/catalog/SongList';
import { Button, colors, PageHeader, ui } from '../components/app/ui';
import { useCatalogStore } from '../store/useCatalogStore';
import { catalogQuery } from '../catalog/catalog-query';
import { useCatalogPage } from '../catalog/use-catalog-page';
import { GlassSurface } from '../design/GlassSurface';
import { CatalogNotice } from '../components/catalog/CatalogNotice';
import { Artwork } from '../design/Artwork';

const QUICK_VIBES: readonly { title: string; emoji: string; desc: string; moodVal: Mood }[] = [
  { title: 'High Energy', emoji: '🔥', desc: 'Fast beats', moodVal: 'Energy' },
  { title: 'Chill & Relax', emoji: '🌧️', desc: 'Lo-fi & acoustic', moodVal: 'Calm' },
  { title: 'Dil Se', emoji: '💖', desc: 'Romantic soul', moodVal: 'Reflective' },
  { title: 'Late Night', emoji: '🌙', desc: 'Deep ambience', moodVal: 'Calm' },
  { title: 'Desi Party', emoji: '⚡', desc: 'Club & dance', moodVal: 'Energy' },
  { title: 'Peaceful', emoji: '🧘', desc: 'Calm focus', moodVal: 'Focus' },
];

export default function DiscoveryScreen(): React.JSX.Element {
  const router = useRouter();
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const period = useDiscoveryStore((s) => s.period), weather = useDiscoveryStore((s) => s.weather), mood = useDiscoveryStore((s) => s.mood), season = useDiscoveryStore((s) => s.season), decade = useDiscoveryStore((s) => s.decade);
  const history = useDiscoveryStore((s) => s.history), error = useDiscoveryStore((s) => s.historyError), ready = useDiscoveryStore((s) => s.historyReady);
  const states = useLibraryStore((s) => s.data.warehouseStates);
  const remoteQuery=useMemo(()=>catalogQuery({mood,season,decade}),[mood,season,decade]);
  const page=useCatalogPage(remoteQuery,300),hasMore=page.hasMore,catalogStatus=page.status;
  const revision = useCatalogStore((s) => s.revision);
  const remote = catalogEnabled();
  const tracks = useMemo(() => {
    const excluded = states.filter(s => s.status !== WarehouseStatus.ACTIVE).map(s => s.trackId);
    if (!remote) return recommendations.candidates({ period, weather, mood, season, decade }, excluded);
    const hidden = new Set(excluded);
    // A filtered page is authoritative; fall back to candidates if remote returned no tracks
    const remoteTracks = page.tracks.filter(track => !hidden.has(track.id));
    if (remoteTracks.length > 0) return remoteTracks;
    return recommendations.candidates({ period, weather, mood, season, decade }, excluded);
  }, [remote, page.tracks, period, weather, mood, season, decade, states]);
  const recent = useMemo(() => demoCatalog.tracks([...new Set(history.map((entry) => entry.trackId))]).slice(0, 5), [history, revision]);
  const label = ['Discovery', mood ?? period ?? 'Music mix', weather ?? '', season, decade].filter(Boolean).join(' · ');
  const pending = catalogPending(catalogStatus, page.error, catalogEnabled());

  const handlePlayMoment = useCallback(() => {
    if (tracks.length > 0 && tracks[0]) {
      void usePlayerStore.getState().playQueue(tracks, tracks[0].id, 'Your moment mix');
    }
  }, [tracks]);

  const handleVibePress = useCallback((v: { title: string; moodVal: Mood }) => {
    const isSelected = selectedVibe === v.title && mood === v.moodVal;
    if (isSelected) {
      setSelectedVibe(null);
      useDiscoveryStore.getState().setMood(null);
    } else {
      setSelectedVibe(v.title);
      useDiscoveryStore.getState().setMood(v.moodVal);
    }
  }, [selectedVibe, mood]);

  const handleMoodSelect = useCallback((value: string) => {
    setSelectedVibe(null);
    useDiscoveryStore.getState().setMood(value ? (value as Mood) : null);
  }, []);

  const handleSeasonSelect = useCallback((value: string) => {
    useDiscoveryStore.getState().setSeason(value);
  }, []);

  const handleDecadeSelect = useCallback((value: string) => {
    useDiscoveryStore.getState().setDecade(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedVibe(null);
    useDiscoveryStore.getState().clearFilters();
  }, []);

  const header = useMemo(() => (
    <View><PageHeader back title="Your moment" /><CatalogNotice query={remoteQuery} loadingHandled={pending&&!tracks.length} />
      {/* 1-Tap Moment Hero */}
      <GlassSurface style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <Text style={styles.periodBadge}>{period ?? 'Afternoon'} ☀️ {weather ? `· ${weather}` : ''} {season ? `· ${season} 🍂` : ''}</Text>
          <Text style={styles.heroTitle} accessibilityRole="header">{period ?? 'Your Moment'}</Text>
          <Text style={styles.heroSubtitle}>Instant personalized mix crafted for your time and feeling.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play My Moment"
          disabled={!tracks.length || pending}
          accessibilityState={{ disabled: !tracks.length || pending }}
          style={[styles.playMomentBtn, (!tracks.length || pending) && { opacity: 0.5 }]}
          onPress={handlePlayMoment}
        >
          <Text style={styles.playMomentBtnText}>▶  Play My Moment</Text>
        </Pressable>
        {error && <View style={{ gap: 10, marginTop: 8 }}><Text style={ui.body} accessibilityLiveRegion="polite">{error}</Text><Button title="Retry listening history" secondary onPress={() => { void useDiscoveryStore.getState().retryHistory(); }} /></View>}
      </GlassSurface>

      {/* Quick Vibe Cards */}
      <View style={styles.vibesContainer}>
        <Text style={styles.vibeSectionTitle}>Pick Your Vibe</Text>
        <View style={styles.vibesGrid}>
          {QUICK_VIBES.map((v) => {
            const isSelected = selectedVibe === v.title && mood === v.moodVal;
            return (
              <Pressable
                key={v.title}
                accessibilityRole="button"
                accessibilityLabel={`Vibe ${v.title}`}
                accessibilityState={{ selected: isSelected }}
                style={[styles.vibeCard, isSelected && styles.vibeCardSelected]}
                onPress={() => handleVibePress(v)}
              >
                <Text style={styles.vibeEmoji}>{v.emoji}</Text>
                <Text style={[styles.vibeTitle, isSelected && styles.vibeTitleSelected]}>{v.title}</Text>
                <Text style={styles.vibeDesc}>{v.desc}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FilterRow responsive title="Mood" values={MOODS} selected={mood ?? ''} select={handleMoodSelect} />
      <FilterRow responsive title="Season" values={SEASONS} selected={season} select={handleSeasonSelect} />
      <FilterRow responsive title="Release years" values={DECADES} selected={decade} select={handleDecadeSelect} />
      <View style={styles.content}>
        <Button title="Clear discovery filters" secondary onPress={handleClearFilters} />
        <Text style={ui.sectionTitle} accessibilityRole="header">Recently played</Text><Button title="View full listening history" secondary onPress={() => router.push('/history')} />
        {!recent.length && !error && <Text style={ui.body} accessibilityLiveRegion="polite">{ready ? 'No history yet' : 'Loading history…'}</Text>}
        {recent.map((track) => <Pressable key={track.id} accessibilityRole="button" accessibilityLabel={`Replay ${track.title}`} style={styles.recentRow}
          onPress={() => { void usePlayerStore.getState().playQueue(recent, track.id, 'Recently played music'); }}><Artwork uri={track.artwork} size={46} /><View style={styles.recentCopy}><Text style={styles.recentTitle} numberOfLines={2}>{track.title}</Text><Text style={ui.subtitle} numberOfLines={1}>{track.artist}</Text></View></Pressable>)}
        <Text style={[ui.sectionTitle, styles.recommendations]} accessibilityRole="header">Recommended tracks</Text>
      </View>
    </View>
  ), [
    remoteQuery, pending, tracks.length, period, weather, season, error, handlePlayMoment,
    selectedVibe, mood, handleVibePress, handleMoodSelect, handleSeasonSelect, handleDecadeSelect,
    decade, handleClearFilters, router, recent, ready
  ]);

  return <SafeAreaView style={ui.screen} edges={['left', 'right']}><SongList loading={pending} emptyContent={page.error ? null : undefined} minimalMetadata={!!season} scrollKey="discovery" tracks={tracks} label={label}
    footer={hasMore ? <View style={{padding:20}}><Button title={catalogStatus==='loading'?'Loading…':'Load more recommendations'} secondary disabled={catalogStatus==='loading'} onPress={()=>{void useCatalogStore.getState().load(catalogQuery({mood,season,decade}),true);}} /></View> : undefined}
    emptyTitle="No matching tracks" emptyMessage="Try another filter"
    header={header} /></SafeAreaView>;
}
const styles = StyleSheet.create({
  heroCard: {
    marginHorizontal: 18,
    marginTop: 10,
    marginBottom: 16,
    padding: 20,
    borderRadius: 20,
    gap: 14,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroHeader: { gap: 4 },
  periodBadge: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  playMomentBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  playMomentBtnText: {
    color: '#040415',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  vibesContainer: {
    paddingHorizontal: 18,
    marginBottom: 16,
    gap: 10,
  },
  vibeSectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  vibesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  vibeCard: {
    width: '48%',
    backgroundColor: colors.raised,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  vibeCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.darkAccent,
  },
  vibeEmoji: { fontSize: 24, marginBottom: 2 },
  vibeTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  vibeTitleSelected: { color: colors.accent },
  vibeDesc: { color: colors.muted, fontSize: 11 },
  period: { marginHorizontal: 20, padding: 20, gap: 12 },
  content: { padding: 20, gap: 12, minWidth: 0 },
  recentRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 12 },
  recentCopy: { flex: 1, minWidth: 0 },
  recentTitle: { color: colors.text, fontSize: 14, flexShrink: 1 },
  recommendations: { marginTop: 12 },
});
