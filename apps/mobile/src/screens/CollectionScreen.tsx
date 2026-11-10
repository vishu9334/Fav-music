import { catalogPending } from '../components/loading/loading-state';
import React, { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { isDecade, SEASONS, demoCatalog } from '../catalog/demo-catalog';
import { COLLECTIONS, CollectionKind } from '../library/library.contract';
import { useLibraryStore } from '../store/useLibraryStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { SongList } from '../components/catalog/SongList';
import { Button, colors, PageHeader, ui } from '../components/app/ui';
import { warehouseIds } from '../library/warehouse';
import { useCatalogStore } from '../store/useCatalogStore';
import { catalogQuery, catalogQueryKey } from '../catalog/catalog-query';
import { useCatalogPage } from '../catalog/use-catalog-page';
import { catalogEnabled } from '../catalog/catalog-runtime';
import { CatalogNotice } from '../components/catalog/CatalogNotice';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckCircle, Play, Shuffle } from 'lucide-react-native';
import { Artwork } from '../design/Artwork';
import type { TimePeriod } from '../discovery/discovery.types';

const INDIAN_CATEGORIES = ['Bollywood', 'Bhojpuri', 'Punjabi', 'South', 'Indie'] as const;
const titles = { likes: 'Liked Tracks', favourites: 'Favourites', bookmarks: 'Bookmarks', warehouse: 'Music Warehouse' };
const timeTitles: Record<string, string> = {
  Morning: 'Subah ke Geet (Morning)',
  Afternoon: 'Dopahar ke Gaane (Afternoon)',
  Evening: 'Shaam ke Sur (Evening)',
  Night: 'Raat ke Geet (Night)',
};

const SEASON_CATEGORY_QUERIES: Record<string, Record<string, string>> = {
  Summer: {
    Bollywood: 'Bollywood Summer',
    Punjabi: 'Punjabi Summer',
    Indie: 'Indie Hindi',
    Bhojpuri: 'Bhojpuri Hits',
    South: 'South Hits',
  },
  Monsoon: {
    Bollywood: 'Monsoon Hits',
    Punjabi: 'Punjabi Romantic',
    Indie: 'Baarishein Anuv Jain',
    Bhojpuri: 'Bhojpuri Baarish',
    South: 'South Monsoon Rain',
  },
  Winter: {
    Bollywood: 'Winter Bollywood',
    Punjabi: 'Punjabi Romantic Hits',
    Indie: 'Indie Acoustic Hindi',
    Bhojpuri: 'Bhojpuri Romantic',
    South: 'South Melodies',
  },
  Spring: {
    Bollywood: 'Basant Bollywood',
    Punjabi: 'Punjabi Upbeat',
    Indie: 'Prateek Kuhad',
    Bhojpuri: 'Bhojpuri Holi',
    South: 'South Festive',
  },
  Autumn: {
    Bollywood: 'Safarnama Bollywood',
    Punjabi: 'Punjabi Sufi',
    Indie: 'Indie Safar Hindi',
    Bhojpuri: 'Bhojpuri Nirgun',
    South: 'South Unplugged',
  },
};

const SEASON_FEEL_SUBTITLES: Record<string, string> = {
  Summer: 'Taazgi · Refreshing breeze & morning nature bliss',
  Monsoon: 'Rimjhim · Romantic rain & cozy petrichor vibes',
  Winter: 'Sukoon · Cozy bonfire & warm acoustic melodies',
  Spring: 'Khilte Sur · Playful blossoms & chirping joy',
  Autumn: 'Safarnama · Golden hour sunset & thoughtful travel',
};

export default function CollectionScreen({ warehouse = false }: { warehouse?: boolean }): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; value?: string }>();
  const kind = warehouse ? 'warehouse' : typeof params.kind === 'string' ? params.kind : '';
  const value = typeof params.value === 'string' ? params.value : '';
  const isArtist = kind === 'artist';
  const [category, setCategory] = useState<string>('');
  const [following, setFollowing] = useState<boolean>(false);
  const data = useLibraryStore((s) => s.data), status = useLibraryStore((s) => s.status);
  const isSeasonalOrDecade = kind === 'decade' || kind === 'season';
  const remoteQuery = useMemo(() => {
    if (kind === 'decade') return catalogQuery({ decade: value, query: category });
    if (kind === 'season') {
      const catQuery = category ? (SEASON_CATEGORY_QUERIES[value]?.[category] || `${category} ${value}`) : '';
      return catalogQuery({ season: value, query: catQuery });
    }
    if (kind === 'time') return catalogQuery({ query: `${value} Bollywood` });
    if (kind === 'artist') return catalogQuery({ query: value });
    return catalogQuery({});
  }, [kind, value, category]);

  const page = useCatalogPage(remoteQuery, 0, kind === 'decade' || kind === 'season' || kind === 'time' || kind === 'artist');
  const hasMore = page.hasMore, catalogStatus = page.status;
  const matchingPage = catalogQueryKey(remoteQuery) === catalogQueryKey(page.query);
  const revision = useCatalogStore((s) => s.revision);
  const tracks = useMemo(() => {
    if (kind === 'warehouse') return demoCatalog.tracks(warehouseIds(data));
    if (COLLECTIONS.includes(kind as CollectionKind)) return demoCatalog.tracks(data[kind as CollectionKind]);
    if (kind === 'artist') {
      const artistTracks = demoCatalog.search({ query: value });
      return matchingPage && page.tracks.length ? page.tracks : artistTracks.length ? artistTracks : demoCatalog.search();
    }
    if (catalogEnabled() && (kind === 'decade' || kind === 'season' || kind === 'time' || kind === 'artist')) return matchingPage ? page.tracks : [];
    if (matchingPage && page.tracks.length > 0) return page.tracks;
    if (kind === 'decade' && isDecade(value)) return demoCatalog.search({ decade: value, query: category });
    if (kind === 'season' && (SEASONS as readonly string[]).includes(value)) return demoCatalog.search({ season: value, query: category });
    if (kind === 'time') {
      const timeTracks = demoCatalog.search().filter((t) => demoCatalog.metadata(t.id)?.times?.includes(value as TimePeriod));
      return matchingPage && page.tracks.length ? page.tracks : timeTracks.length ? timeTracks : demoCatalog.search();
    }
    return [];
  }, [kind, value, category, data, revision, page.tracks, matchingPage]);

  const title = COLLECTIONS.includes(kind as CollectionKind) ? titles[kind as CollectionKind] : timeTitles[value] || value || 'Collection unavailable';
  const savedIds = COLLECTIONS.includes(kind as CollectionKind) ? kind === 'warehouse' ? warehouseIds(data) : data[kind as CollectionKind] : [];
  const missing = savedIds.length - tracks.length;
  const seasonal = kind === 'season';
  const pending = ((kind === 'season' || kind === 'decade' || kind === 'time' || kind === 'artist') && catalogPending(catalogStatus, page.error, catalogEnabled())) || (COLLECTIONS.includes(kind as CollectionKind) && status === 'loading');
  const seasonalEmpty = seasonal && catalogStatus === 'ready' && !page.error ? <View style={{paddingHorizontal:18,paddingVertical:16}}><Text style={ui.subtitle} accessibilityRole="text" accessibilityLiveRegion="polite">No songs yet</Text></View> : null;

  const playRandom = () => {
    if (!tracks.length) return;
    const randomIndex = Math.floor(Math.random() * tracks.length);
    const chosen = tracks[randomIndex];
    if (chosen) {
      void usePlayerStore.getState().playQueue(tracks, chosen.id, title);
      router.push('/player');
    }
  };

  return <SafeAreaView style={ui.screen} edges={['left', 'right']}><SongList loading={pending} minimalMetadata={seasonal} emptyContent={seasonal ? seasonalEmpty : undefined} scrollKey={`collection:${kind}:${value}:${category}`} tracks={tracks} label={title}
    footer={hasMore && (kind === 'decade' || kind === 'season' || kind === 'time') ? <View style={{ padding: 20 }}><Button title={catalogStatus === 'loading' ? 'Loading…' : 'Load more tracks'} secondary disabled={catalogStatus === 'loading'} onPress={() => { void useCatalogStore.getState().load(remoteQuery, true); }} /></View> : undefined}
    header={<View>
      {isArtist ? (
        <View style={styles.artistHero}>
          <PageHeader compact title="" back={!warehouse} />
          <View style={styles.artistBanner}>
            <View style={styles.artistAvatarWrap}>
              {tracks[0]?.artwork ? (
                <Artwork uri={tracks[0].artwork} size={110} />
              ) : (
                <View style={styles.artistAvatarFallback}><Text style={styles.artistAvatarInitial}>{value.charAt(0).toUpperCase()}</Text></View>
              )}
            </View>
            <View style={styles.verifiedRow}>
              <CheckCircle size={14} color="#E9FF60" />
              <Text style={styles.verifiedText}>Verified Artist</Text>
            </View>
            <Text style={styles.artistName} accessibilityRole="header">{value}</Text>
            <Text style={styles.artistStats}>34.8M monthly listeners · 12.4M followers</Text>
            <View style={styles.genreRow}>
              {['Bollywood', 'Romantic', 'Pop'].map((g) => (
                <View key={g} style={styles.genrePill}><Text style={styles.genrePillText}>{g}</Text></View>
              ))}
            </View>
            <View style={styles.artistActionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={following ? `Following ${value}` : `Follow ${value}`}
                style={[styles.followBtn, following && styles.followingBtn]}
                onPress={() => setFollowing((prev) => !prev)}
              >
                <Text style={[styles.followBtnText, following && styles.followingBtnText]}>{following ? 'Following' : '+ Follow'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play all songs by ${value}`}
                style={styles.artistPlayBtn}
                onPress={() => {
                  if (tracks[0]) {
                    void usePlayerStore.getState().playQueue(tracks, tracks[0].id, value);
                    router.push('/player');
                  }
                }}
              >
                <Play size={16} color="#040415" fill="#040415" />
                <Text style={styles.artistPlayBtnText}>Play All</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Shuffle artist songs"
                style={styles.artistShuffleBtn}
                onPress={playRandom}
              >
                <Shuffle size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          <View style={styles.songsSectionRow}>
            <Text style={ui.sectionTitle} accessibilityRole="header">Popular Releases</Text>
          </View>
        </View>
      ) : (
        <PageHeader compact={seasonal} title={title} subtitle={missing > 0 ? 'Some songs unavailable' : (seasonal ? SEASON_FEEL_SUBTITLES[value] : undefined)} back={!warehouse} />
      )}
      <CatalogNotice query={remoteQuery} initialLoading={seasonal && catalogStatus === 'unavailable' && catalogEnabled()} loadingHandled={pending && !tracks.length} />
      {/* Indian regional languages/categories */}
      {isSeasonalOrDecade && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="All categories" style={[styles.chip, !category && styles.activeChip]} onPress={() => setCategory('')}>
            <Text style={[styles.chipText, !category && styles.activeChipText]}>All</Text>
          </Pressable>
          {INDIAN_CATEGORIES.map((cat) => (
            <Pressable key={cat} accessibilityRole="button" accessibilityLabel={`Category ${cat}`} style={[styles.chip, category === cat && styles.activeChip]} onPress={() => setCategory(cat)}>
              <Text style={[styles.chipText, category === cat && styles.activeChipText]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {/* Shuffle/Random Play button */}
      {tracks.length > 0 && isSeasonalOrDecade && (
        <View style={styles.shuffleRow}>
          <Button title="Shuffle play" secondary onPress={playRandom} />
        </View>
      )}
    </View>}
    emptyTitle={status === 'loading' && COLLECTIONS.includes(kind as CollectionKind) ? 'Loading your library…' : kind === 'warehouse' ? 'No available songs' : 'No available songs'}
    emptyMessage={kind === 'warehouse' ? 'Save a song' : kind === 'likes' ? 'Like a song' : 'Try another selection'} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  artistHero: { paddingBottom: 10 },
  artistBanner: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16, gap: 10 },
  artistAvatarWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E9FF60',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121320',
  },
  artistAvatarFallback: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#121320',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistAvatarInitial: { color: '#E9FF60', fontSize: 44, fontWeight: '800' },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(233, 255, 96, 0.15)',
  },
  verifiedText: { color: '#E9FF60', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  artistName: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  artistStats: { color: '#8A8A9E', fontSize: 12, textAlign: 'center' },
  genreRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  genrePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#121320',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  genrePillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  artistActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E9FF60',
    backgroundColor: 'transparent',
  },
  followingBtn: { backgroundColor: 'rgba(233, 255, 96, 0.2)' },
  followBtnText: { color: '#E9FF60', fontSize: 13, fontWeight: '700' },
  followingBtnText: { color: '#FFFFFF' },
  artistPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#E9FF60',
  },
  artistPlayBtnText: { color: '#040415', fontSize: 13, fontWeight: '800' },
  artistShuffleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#121320',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songsSectionRow: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line },
  activeChip: { borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.12)' },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  activeChipText: { color: '#38BDF8', fontWeight: '700' },
  shuffleRow: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 },
});
