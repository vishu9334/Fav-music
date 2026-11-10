import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ui, colors } from '../../components/app/ui';
import { useLibraryStore } from '../../store/useLibraryStore';
import { syncCaption } from '../../components/app/sync-caption';

export function AccountCollectionsPanel({ userId }: { userId: string }): React.JSX.Element {
  const scope = useLibraryStore((s) => s.scope);
  const status = useLibraryStore((s) => s.status);
  const data = useLibraryStore((s) => s.data);
  const error = useLibraryStore((s) => s.error);
  const sync = useLibraryStore((s) => s.sync);

  const ready = scope === userId && status === 'ready';

  const warehouseCount = Object.keys(data.warehouse ?? {}).length;
  const likesCount = data.likes?.length ?? 0;
  const favouritesCount = data.favourites?.length ?? 0;
  const bookmarksCount = data.bookmarks?.length ?? 0;
  const playlistsCount = data.playlists?.length ?? 0;

  return (
    <View style={styles.container}>
      <Text style={ui.sectionTitle}>Your account collections</Text>

      {/* Sync Status & Caption */}
      <Text style={ui.subtitle} accessibilityLiveRegion="polite">
        {syncCaption(sync)}
      </Text>

      {/* Primary Management Actions */}
      {ready && (
        <Button
          title={sync.status === 'syncing' ? 'Synchronizing…' : 'Sync account collections'}
          disabled={sync.status === 'syncing' || sync.status === 'blocked'}
          secondary
          onPress={() => {
            void useLibraryStore.getState().synchronize();
          }}
        />
      )}

      {/* Conflict Resolution Actions */}
      {ready && sync.status === 'conflict' && (
        <View style={styles.conflictBox}>
          <Text style={ui.body}>
            Choose which collection version to preserve. The alternate version remains saved locally for recovery.
          </Text>
          <Button
            title="Keep this device’s collection"
            onPress={() => {
              void useLibraryStore.getState().synchronize('local');
            }}
          />
          <Button
            title="Use the account’s collection"
            secondary
            onPress={() => {
              void useLibraryStore.getState().synchronize('remote');
            }}
          />
        </View>
      )}

      {!ready && status !== 'error' && (
        <Text style={ui.subtitle}>Opening collections…</Text>
      )}

      {!!error && (
        <Text style={[ui.body, { color: colors.text }]} accessibilityRole="alert">
          {error}
        </Text>
      )}

      {status === 'error' && (
        <Button
          title="Retry local collections"
          secondary
          onPress={() => {
            void useLibraryStore.getState().activateAccount(userId);
          }}
        />
      )}

      {/* Personal Music Collections Summary Cards */}
      {ready && (
        <View style={styles.collectionGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statCount}>{likesCount}</Text>
            <Text style={styles.statLabel}>Liked Songs</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCount}>{favouritesCount}</Text>
            <Text style={styles.statLabel}>Favourites</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCount}>{bookmarksCount}</Text>
            <Text style={styles.statLabel}>Bookmarks</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCount}>{playlistsCount}</Text>
            <Text style={styles.statLabel}>Playlists</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCount}>{warehouseCount}</Text>
            <Text style={styles.statLabel}>Warehouse</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 12,
  },
  conflictBox: {
    gap: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  statCard: {
    flexBasis: '31%',
    flexGrow: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  statCount: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
});
