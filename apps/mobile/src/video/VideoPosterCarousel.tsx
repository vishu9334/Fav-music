import React, { useEffect, useRef } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { interpolate, SharedValue, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Video } from 'lucide-react-native';
import { VideoItem } from './video.contract';
import { useReducedMotion } from '../design/useReducedMotion';
import { colors } from '../components/app/ui';
import { ScrollInteraction } from '../components/lists/scroll-interaction';

function Card({ item, index, width, scroll, selected, disabled, reduced, choose }: {
  item: VideoItem; index: number; width: number; scroll: SharedValue<number>; selected: boolean; disabled: boolean; reduced: boolean; choose: () => void;
}): React.JSX.Element {
  const animated = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduced
          ? 1
          : interpolate(
              scroll.value,
              [(index - 1) * (width + 12), index * (width + 12), (index + 1) * (width + 12)],
              [0.94, 1, 0.94],
              'clamp',
            ),
      },
    ],
  }));

  const badge = item.description || (item.source.kind === 'local' ? item.source.resolution : undefined);

  return (
    <Animated.View style={[{ width }, animated]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select video ${item.title}`}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={choose}
        style={[styles.card, selected && styles.cardSelected]}
      >
        {item.poster ? (
          <Image source={item.poster} style={{ width: '100%', aspectRatio: 16 / 9 }} resizeMode="cover" fadeDuration={0} />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Video color={selected ? colors.accent : colors.muted} size={28} />
            <Text style={styles.thumbnailTag}>LOCAL VIDEO</Text>
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          {!!badge && (
            <Text style={styles.cardSubtitle} numberOfLines={1}>{badge}</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function VideoPosterCarousel({ items, index, reduced, disabled, select }: { items: readonly VideoItem[]; index: number; reduced: boolean; disabled: boolean; select: (index: number) => void }): React.JSX.Element {
  const still = useReducedMotion(reduced);
  const gesture = useRef(new ScrollInteraction()).current;
  const { width } = useWindowDimensions(), cardWidth = Math.min(280, width * 0.72);
  const ref = useRef<FlatList<VideoItem>>(null), scroll = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => { scroll.value = event.contentOffset.x; });
  useEffect(() => { ref.current?.scrollToOffset({ offset: index * (cardWidth + 12), animated: !still }); }, [index, cardWidth, still]);
  return (
    <View>
      <Animated.FlatList
        ref={ref}
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={gesture.beginDrag}
        onScrollEndDrag={gesture.endDrag}
        onMomentumScrollBegin={gesture.beginMomentum}
        onMomentumScrollEnd={gesture.endMomentum}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={3}
        renderItem={({ item, index: i }) => (
          <Card
            item={item}
            index={i}
            width={cardWidth}
            scroll={scroll}
            selected={i === index}
            disabled={disabled}
            reduced={still}
            choose={() => {
              if (!disabled && i !== index && gesture.allowPress()) select(i);
            }}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, gap: 12, paddingVertical: 12 },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  cardSelected: {
    borderColor: colors.accent,
  },
  thumbnailPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  thumbnailTag: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  cardInfo: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  cardSubtitle: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '500',
  },
});
