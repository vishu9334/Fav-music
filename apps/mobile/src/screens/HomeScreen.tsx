import { ArtworkSkeleton } from '../components/loading/Skeleton';
import { catalogPending } from '../components/loading/loading-state';
import { catalogEnabled } from '../catalog/catalog-runtime';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowUpRight, CloudRain, Leaf, Moon, Play, Snowflake, Sun, Sunrise, Sunset, Wind } from 'lucide-react-native';
import { DECADES, SEASONS } from '../catalog/demo-catalog';
import { SAMPLE_TRACKS, type IPlayableTrack } from '../data/sample-tracks';
import { usePlayerStore } from '../store/usePlayerStore';
import { SongList } from '../components/catalog/SongList';
import { Button, colors, LibraryNotice, ui } from '../components/app/ui';
import { Artwork } from '../design/Artwork';
import { useDiscoveryStore } from '../store/useDiscoveryStore';
import { useCatalogStore } from '../store/useCatalogStore';
import { FeatureLinks } from '../components/app/FeatureLinks';
import { GlassSurface } from '../design/GlassSurface';
import { CatalogNotice } from '../components/catalog/CatalogNotice';
import { useCatalogPage } from '../catalog/use-catalog-page';
import { NostalgicCassette } from '../design/NostalgicCassette';
import { HOME_CATALOG_QUERY } from '../catalog/home-catalog';
import { uniqueTracks } from '../catalog/unique-tracks';
import { buildMomentInfo } from '../discovery/solar-context';

const seasonIcons = [Leaf, Sun, CloudRain, Wind, Snowflake];

const SEASON_FEEL_TAGS: Record<string, string> = {
  Summer: 'Taazgi · Refreshing Breeze',
  Monsoon: 'Rimjhim · Romantic Rain',
  Winter: 'Sukoon · Cozy Bonfire',
  Spring: 'Khilte Sur · Blossom Joy',
  Autumn: 'Safarnama · Sunset Calm',
};

export default function HomeScreen(): React.JSX.Element {
  const router = useRouter(), page = useCatalogPage(HOME_CATALOG_QUERY);
  const tracks = useMemo(() => uniqueTracks(page.tracks), [page.tracks]);
  const pending = catalogPending(page.status, page.error, catalogEnabled());
  const { width, fontScale } = useWindowDimensions();

  // Dynamic Weather, Solar Altitude & Time of Day context
  const weather = useDiscoveryStore((s) => s.weather);
  const tempCelsius = useDiscoveryStore((s) => s.tempCelsius);
  const city = useDiscoveryStore((s) => s.city);
  const coords = useDiscoveryStore((s) => s.coords);

  useEffect(() => {
    useDiscoveryStore.getState().refreshTime();
    void useDiscoveryStore.getState().refreshWeather();
  }, []);

  const [featuredIndex, setFeaturedIndex] = useState(0);
  useEffect(() => {
    if (tracks.length > 1) {
      setFeaturedIndex(Math.floor(Math.random() * tracks.length));
    }
  }, [tracks.length]);

  const moment = useMemo(() => buildMomentInfo(coords, weather), [coords, weather]);
  const trendingTracks = useMemo(() => {
    const list = tracks.length ? tracks : (SAMPLE_TRACKS as readonly IPlayableTrack[]);
    return list.slice(0, 6);
  }, [tracks]);

  const featuredTrack = tracks[featuredIndex] ?? tracks[0];
  const artwork = featuredTrack?.artwork ?? tracks[0]?.artwork;
  const showArtwork = width >= 360 && fontScale < 1.3 && !!(artwork || (pending && !tracks.length));
  const open = (kind: string, value: string) => {
    if (kind === 'season') useDiscoveryStore.getState().setSeason(value);
    if (kind === 'decade') useDiscoveryStore.getState().setDecade(value);
    router.push({ pathname: '/collection', params: { kind, value } });
  };

  return <SafeAreaView style={ui.screen} edges={['left', 'right']}><SongList loading={pending} emptyContent={page.error ? null : undefined} scrollKey="home" tracks={tracks} label="Bollywood" footer={page.hasMore?<View style={{padding:20}}><Button title={page.status==='loading'?'Loading…':'Load more music'} secondary disabled={page.status==='loading'} onPress={()=>{void useCatalogStore.getState().load(HOME_CATALOG_QUERY,true);}} /></View>:undefined} header={<View>
    <View style={styles.notices}><LibraryNotice /></View>
    <CatalogNotice query={HOME_CATALOG_QUERY} loadingHandled={pending&&!tracks.length} />
    {/* Single Direct Play Button */}
    <View style={styles.quickPlayRow}>
      <Pressable
        style={styles.quickPlayBtn}
        accessibilityRole="button"
        accessibilityLabel="Play song"
        onPress={() => {
          const list = tracks.length ? tracks : (SAMPLE_TRACKS as readonly IPlayableTrack[]);
          const chosen = featuredTrack ?? list[Math.floor(Math.random() * list.length)] ?? list[0];
          if (chosen) {
            void usePlayerStore.getState().playQueue(list, chosen.id, 'Bollywood Direct');
          }
        }}
      >
        <Play size={16} color="#040415" fill="#040415" />
        <Text style={styles.quickPlayBtnText}>Play</Text>
      </Pressable>
    </View>
    <GlassSurface style={[styles.hero, !showArtwork && styles.heroTextOnly]}>
      {/* Live Dynamic Context Pill */}
      <View style={styles.momentRow}>
        <View style={styles.momentBadge}>
          <Text style={styles.momentBadgeText}>{moment.badgeLabel}</Text>
        </View>
        {city && (
          <View style={styles.cityBadge}>
            <Text style={styles.cityBadgeText}>📍 {city}{tempCelsius !== null ? ` ${tempCelsius}°C` : ''}</Text>
          </View>
        )}
      </View>

      <Text style={styles.heroTitle} accessibilityRole="header">Bollywood for you</Text>

      <View style={styles.heroButton}><Button title="Play Bollywood" disabled={!tracks.length} onPress={() => {
        const first = tracks[0]; if (first) { void usePlayerStore.getState().playQueue(tracks, first.id, 'Bollywood'); router.push('/player'); }
      }} /></View>
      
      {showArtwork && <><View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.memory}><NostalgicCassette /></View><View style={styles.heroArtwork}>{artwork ? <Artwork uri={artwork} size={110} /> : <ArtworkSkeleton size={110} />}</View></>}
    </GlassSurface>
    <FeatureLinks />

    {/* Location-Based Trending Section */}
    <View style={styles.sectionHeaderRow}>
      <Text style={ui.sectionTitle} accessibilityRole="header">
        {city ? `Trending in ${city}` : 'Trending in India'}
      </Text>
      <View style={styles.trendingBadge}>
        <Text style={styles.trendingBadgeText}>🔥 TOP STREAMED</Text>
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
      {trendingTracks.map((t, i) => (
        <Pressable
          key={t.id}
          style={styles.trendingCard}
          accessibilityRole="button"
          accessibilityLabel={`Play trending track ${t.title} by ${t.artist}`}
          onPress={() => {
            const list = tracks.length ? tracks : (SAMPLE_TRACKS as readonly IPlayableTrack[]);
            void usePlayerStore.getState().playQueue(list, t.id, 'Trending Hits');
            router.push('/player');
          }}
        >
          <View style={styles.trendingArtContainer}>
            <Artwork uri={t.artwork} size={132} />
            <View style={styles.streamPill}>
              <Text style={styles.streamPillText}>{i === 0 ? '🔥 2.4M plays' : i === 1 ? '⚡ Top 1' : `🔥 #${i + 1} Trending`}</Text>
            </View>
            <View style={styles.voltPlayCircle}>
              <Play size={13} color="#040415" fill="#040415" />
            </View>
          </View>
          <Text numberOfLines={1} style={styles.trendingTrackTitle}>{t.title}</Text>
          <Text numberOfLines={1} style={styles.trendingTrackArtist}>{t.artist}</Text>
        </Pressable>
      ))}
    </ScrollView>
    
    <View style={styles.section}><Text style={ui.sectionTitle} accessibilityRole="header">Through the decades</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.decades}>
      {DECADES.map((decade) => <Pressable key={decade} style={styles.decade} accessibilityRole="button" accessibilityLabel={`Browse ${decade}`}
        onPress={() => open('decade', decade)}><ArrowUpRight size={18} color={colors.accent} /><Text style={styles.cardTitle}>{decade}</Text>
        </Pressable>)}
    </ScrollView>

    <View style={styles.seasonHeading}><Text style={ui.sectionTitle} accessibilityRole="header">Seasons</Text></View>
    <View style={styles.seasons}>{SEASONS.map((season, i) => { const Icon = seasonIcons[i] ?? Leaf;
      const isCurrent = season === moment.season;
      const vibeTag = SEASON_FEEL_TAGS[season];
      return <Pressable key={season} style={[styles.season, isCurrent && styles.activeSeason]} accessibilityRole="button" accessibilityLabel={`Browse ${season} mix`}
        onPress={() => open('season', season)}>
        <View style={styles.seasonRow}>
          <Icon size={23} color={isCurrent ? '#38BDF8' : colors.accent} />
          {isCurrent && <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>CURRENT</Text></View>}
        </View>
        <Text style={styles.cardTitle}>{season}</Text>
        {vibeTag && <Text style={styles.seasonVibeText}>{vibeTag}</Text>}
      </Pressable>;
    })}</View>

    <View style={styles.seasonHeading}><Text style={ui.sectionTitle} accessibilityRole="header">Day and night</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.decades}>
      {[
        { key: 'Morning', label: 'Subah (Morning)', time: '5 AM – 12 PM', icon: Sunrise },
        { key: 'Afternoon', label: 'Dopahar (Afternoon)', time: '12 PM – 5 PM', icon: Sun },
        { key: 'Evening', label: 'Shaam (Evening)', time: '5 PM – 8:30 PM', icon: Sunset },
        { key: 'Night', label: 'Raat (Night)', time: '8:30 PM – 5 AM', icon: Moon },
      ].map((slot) => {
        const Icon = slot.icon;
        const isCurrent = slot.key === moment.timePeriod;
        return (
          <Pressable
            key={slot.key}
            style={[styles.timeCard, isCurrent && styles.activeTimeCard]}
            accessibilityRole="button"
            accessibilityLabel={`Browse ${slot.label}`}
            onPress={() => open('time', slot.key)}
          >
            <View style={styles.seasonRow}>
              <Icon size={20} color={isCurrent ? '#38BDF8' : colors.accent} />
              {isCurrent && <View style={styles.nowBadge}><Text style={styles.nowBadgeText}>NOW</Text></View>}
            </View>
            <Text style={styles.cardTitle}>{slot.label}</Text>
            <Text style={styles.timeSubtext}>{slot.time}</Text>
          </Pressable>
        );
      })}
    </ScrollView>

    <View style={styles.section}><Text style={ui.sectionTitle} accessibilityRole="header">Bollywood songs</Text></View>
  </View>} /></SafeAreaView>;
}
const styles = StyleSheet.create({
  notices: { paddingHorizontal: 18 },
  quickPlayRow: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'flex-start',
  },
  quickPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#E9FF60',
  },
  quickPlayBtnText: {
    color: '#040415',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 12,
  },
  trendingBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(233, 255, 96, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(233, 255, 96, 0.3)',
  },
  trendingBadgeText: { color: '#E9FF60', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  trendingScroll: { paddingHorizontal: 18, gap: 12 },
  trendingCard: { width: 132, gap: 6 },
  trendingArtContainer: {
    width: 132,
    height: 132,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#121320',
  },
  streamPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: 'rgba(4, 4, 21, 0.75)',
  },
  streamPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  voltPlayCircle: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E9FF60',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  trendingTrackTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  trendingTrackArtist: { color: '#8A8A9E', fontSize: 11 },
  hero: { marginHorizontal: 18, marginTop: 18, padding: 18, paddingTop: 28, paddingBottom: 100, minHeight: 300, borderRadius: 24, borderColor: colors.line, backgroundColor: colors.hero, overflow: 'hidden', gap: 14 },
  heroTextOnly: { minHeight: 0, paddingBottom: 24 },
  momentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  momentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  momentBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  cityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  cityBadgeText: { color: '#BAE6FD', fontSize: 11, fontWeight: '600' },
  heroContext: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 13, lineHeight: 18 },
  memory: { position: 'absolute', left: 20, bottom: 24, width: 84, height: 56 },
  heroArtwork: { position: 'absolute', right: 16, bottom: 16, transform: [{ rotate: '2deg' }] },
  heroTitle: { color: colors.text, fontSize: 37, fontWeight: '700', letterSpacing: -1.3, lineHeight: 41 }, heroButton: { alignSelf: 'flex-start', marginTop: 2 },
  section: { paddingHorizontal: 18, paddingTop: 26, paddingBottom: 14, gap: 7 },
  decades: { paddingHorizontal: 18, gap: 10 }, decade: { width: 128, minHeight: 110, padding: 13, gap: 12, borderRadius: 16, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  seasonHeading: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 10 },
  seasons: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, gap: 8 },
  season: { flexBasis: '45%', flexGrow: 1, minWidth: 125, padding: 13, borderRadius: 16, backgroundColor: colors.subtle, borderWidth: 1, borderColor: colors.line, gap: 8 },
  seasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  activeSeason: { borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.08)' },
  seasonVibeText: { color: '#8A8A9E', fontSize: 11, fontWeight: '500', marginTop: -2 },
  currentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
  },
  currentBadgeText: { color: '#38BDF8', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  timeCard: {
    width: 140,
    minHeight: 100,
    padding: 13,
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  activeTimeCard: { borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.08)' },
  nowBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
  },
  nowBadgeText: { color: '#38BDF8', fontSize: 9, fontWeight: '700' },
  timeSubtext: { color: colors.muted, fontSize: 11 },
});
