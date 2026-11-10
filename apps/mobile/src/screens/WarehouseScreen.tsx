import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { WarehouseStatus } from '@aadat/contracts';
import { demoCatalog } from '../catalog/demo-catalog';
import { warehouseIds } from '../library/warehouse';
import { useLibraryStore } from '../store/useLibraryStore';
import { SongList } from '../components/catalog/SongList';
import { GlassSurface } from '../design/GlassSurface';
import { Button, colors, PageHeader, ui } from '../components/app/ui';
import { syncCaption } from '../components/app/sync-caption';
import { useCatalogStore } from '../store/useCatalogStore';

const filters = [[WarehouseStatus.ACTIVE, 'Active'], [WarehouseStatus.ARCHIVED, 'Removed'], [WarehouseStatus.HIDDEN, 'Hidden']] as const;
export default function WarehouseScreen(): React.JSX.Element {
  const router = useRouter(); const [filter, setFilter] = useState<WarehouseStatus>(WarehouseStatus.ACTIVE);
  const data = useLibraryStore((s) => s.data), status = useLibraryStore((s) => s.status);
  const sync = useLibraryStore(s => s.sync);
  const revision = useCatalogStore((s) => s.revision);
  const tracks = useMemo(() => demoCatalog.tracks(warehouseIds(data, filter)), [data, filter, revision]);
  return <SafeAreaView style={ui.screen} edges={['left', 'right']}><SongList emptyContent={status==='error' ? null : undefined} loading={status==='loading'} loadingLabel="Loading Warehouse" tracks={tracks} label={`Warehouse · ${filters.find(([value]) => value === filter)?.[1]}`} warehouseMode={filter}
    emptyTitle={status === 'loading' ? 'Loading your Warehouse…' : filter === WarehouseStatus.ACTIVE ? 'No available songs' : 'Nothing here yet'}
    emptyMessage={filter === WarehouseStatus.ACTIVE ? 'Save a song' : 'No saved songs'}
    header={<View><PageHeader title="Music Warehouse" />
      <GlassSurface style={styles.info}><Text style={ui.body} accessibilityLiveRegion="polite">{syncCaption(sync)}</Text>
        {warehouseIds(data, filter).length > tracks.length && <Text style={ui.subtitle}>Some songs unavailable</Text>}
        <Button title="Find a song" secondary onPress={() => router.push('/search')} /></GlassSurface>
      <View style={styles.filters}>{filters.map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: value === filter }}
        onPress={() => setFilter(value)} style={[styles.chip, value === filter && styles.selected]}><Text style={{ color: colors.text }}>{label}</Text></Pressable>)}</View>
    </View>} /></SafeAreaView>;
}
const styles = StyleSheet.create({
  info: { marginHorizontal: 20, gap: 10, padding: 16, borderRadius: 20, },
  filters: { flexDirection: 'row', gap: 8, margin: 20, flexWrap: 'wrap' }, chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.darkAccent, borderColor: colors.selectedBorder },
});
