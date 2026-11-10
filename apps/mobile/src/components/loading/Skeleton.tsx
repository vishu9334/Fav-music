import React, { memo, useCallback, useRef } from 'react';
import { Animated, AppState, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors } from '../../design/theme';
import { useReducedMotion } from '../../design/useReducedMotion';
import { startSkeletonMotion } from './skeleton-motion';

function SkeletonFrame({ children, label, style }: { children: React.ReactNode; label: string; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const opacity = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useFocusEffect(useCallback(() => {
    let stop: (() => void) | undefined;
    const update = (active: boolean) => { stop?.(); stop = active ? startSkeletonMotion(opacity, reduced) : undefined; };
    update(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => update(state === 'active'));
    return () => { stop?.(); subscription.remove(); };
  }, [opacity, reduced]));
  return <View style={style} pointerEvents="none" accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
    <Animated.View style={{ opacity }} accessible={false} importantForAccessibility="no-hide-descendants">{children}</Animated.View>
  </View>;
}
const Block = memo(function Block({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return <View style={[styles.block, style]} />;
});
const bounded = (count: number, maximum: number) => Math.max(1, Math.min(maximum, Math.floor(count) || 1));

export const SongListSkeleton = memo(function SongListSkeleton({ count = 6, label = 'Loading music catalog', linkActions = false }: { count?: number; label?: string; linkActions?:boolean }): React.JSX.Element {
  const { fontScale } = useWindowDimensions();
  return <SkeletonFrame label={label}>{Array.from({ length: bounded(count, 8) }, (_, index) => <View key={index}><View style={[styles.songRow, { minHeight: Math.max(76, 24 + 32 * fontScale) }]}>
    <Block style={styles.songArt} /><View style={styles.copy}><Block style={{ height: 18 * fontScale, width: '72%' }} /><Block style={{ height: 14 * fontScale, width: '48%', marginTop: 4 }} /></View>
    <View style={styles.actions}><Block style={styles.action} /><Block style={styles.action} /></View>
  </View>{linkActions && <View style={{paddingHorizontal:20,paddingBottom:14}}><Block style={{minHeight:48,borderRadius:14}} /></View>}</View>)}</SkeletonFrame>;
});
export const ArtworkSkeleton = memo(function ArtworkSkeleton({ size = 112 }: { size?: number }): React.JSX.Element {
  return <SkeletonFrame label="Loading artwork" style={{ width: size, height: size }}><Block style={{ width: size, height: size, borderRadius: Math.min(20, size / 4) }} /></SkeletonFrame>;
});
export const SongCardSkeleton = memo(function SongCardSkeleton(): React.JSX.Element {
  const { fontScale } = useWindowDimensions();
  return <SkeletonFrame label="Loading song" style={{ flex: 1 }}><Block style={{ width: '100%', aspectRatio: 1, borderRadius: 20 }} /><Block style={{ height: 18 * fontScale, width: '75%', marginTop: 10 }} /><Block style={{ height: 14 * fontScale, width: '50%', marginTop: 4 }} /></SkeletonFrame>;
});
export const PlaylistListSkeleton = memo(function PlaylistListSkeleton({ count = 3, resource = false }: { count?: number; resource?: boolean }): React.JSX.Element {
  const { fontScale } = useWindowDimensions();
  return <SkeletonFrame label="Loading playlists">{Array.from({ length: bounded(count, 6) }, (_, index) => <View key={index} style={[styles.playlist, resource && { padding: 16, marginBottom: 12, minHeight:Math.max(98,Math.ceil(34+58*fontScale)) }]}>
    <Block style={resource ? { width: 64, height: 64, borderRadius: 16 } : { width: 58, height: 62, borderRadius: 18 }} />
    <View style={styles.copy}><Block style={{ height: (resource ? 18 : 17) * fontScale, width: '70%' }} />{resource && <Block style={{ height: 14 * fontScale, width: '48%', marginTop: 6 }} />}</View>
  </View>)}</SkeletonFrame>;
});
export const CategoryGridSkeleton = memo(function CategoryGridSkeleton({ count = 4 }: { count?: number }): React.JSX.Element {
  const { fontScale } = useWindowDimensions();
  return <SkeletonFrame label="Loading categories"><View style={styles.grid}>{Array.from({ length: bounded(count, 6) }, (_, index) => <View key={index} style={styles.category}>
    <Block style={{ width: 23, height: 23 }} /><Block style={{ height: 17 * fontScale, width: '65%' }} />
  </View>)}</View></SkeletonFrame>;
});
export const SavedLinksSkeleton = memo(function SavedLinksSkeleton(): React.JSX.Element {
  const { fontScale } = useWindowDimensions();
  return <SkeletonFrame label="Loading saved links"><View style={{marginHorizontal:20,marginBottom:12,padding:16,gap:12,borderRadius:20,borderWidth:1,borderColor:colors.line,backgroundColor:colors.panel}}>
    <Block style={{width:'65%',height:20*fontScale}} /><Block style={{width:'90%',height:18*fontScale}} /><Block style={{width:'45%',height:18*fontScale}} />
    <Block style={{height:48,borderRadius:14}} /><Block style={{height:48,borderRadius:14}} />
  </View></SkeletonFrame>;
});
const styles = StyleSheet.create({
  block: { backgroundColor: colors.line, borderRadius: 5 }, copy: { flex: 1, minWidth: 0 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 6, paddingVertical: 10, minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  songArt: { width: 46, height: 46, borderRadius: 10 }, actions: { flexDirection: 'row', width: 88, justifyContent: 'space-around' }, action: { width: 16, height: 16 },
  playlist: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, gap: 8 }, category: { flexBasis: '45%', flexGrow: 1, minWidth: 125, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.subtle, gap: 8 },
});
