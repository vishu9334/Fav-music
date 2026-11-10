import { colors } from '../../design/theme';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music } from 'lucide-react-native';
import {
  useWindowDimensions,
  Pressable,
  FlatList,
  Image,
  StyleSheet,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Animated, {
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { IPlayableTrack } from '../../data/sample-tracks';
import { carouselGeometry, carouselIndex } from '../../design/playback-geometry';
import { ScrollInteraction } from '../lists/scroll-interaction';
import { useReducedMotion } from '../../design/useReducedMotion';
import { mediaLeases } from '../../catalog/catalog-runtime';

export interface ArtworkCarouselProps {
  tracks: readonly IPlayableTrack[];
  activeIndex: number;
  onTrackSelect: (index: number) => void;
  isReducedMotion?: boolean;
  getSelectionVersion?: () => number;
  swipeToSelect?: boolean;
}

interface CarouselItemProps {
  width: number;
  selected: boolean;
  choose: () => void;
  item: IPlayableTrack;
  index: number;
  scrollX: SharedValue<number>;
  isReducedMotion: boolean;
}

// In-memory artwork prefetch registry to eliminate reload delay on card swap
const prefetchedUrls = new Set<string>();

const AnimatedCarouselCard: React.FC<CarouselItemProps> = ({
  item,
  width,
  selected,
  choose,
  index,
  scrollX,
  isReducedMotion,
}) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.artwork]);

  // Pre-cache image into OS disk/memory cache on mount
  useEffect(() => {
    if (item.artwork && !prefetchedUrls.has(item.artwork)) {
      prefetchedUrls.add(item.artwork);
      void Image.prefetch(item.artwork).catch(() => {});
    }
  }, [item.artwork]);

  const animatedCardStyle = useAnimatedStyle(() => {
    if (isReducedMotion) {
      return {
        transform: [{ scale: 1 }],
        opacity: 1,
      };
    }

    const inputRange = [
      (index - 1) * width,
      index * width,
      (index + 1) * width,
    ];

    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.86, 1.0, 0.86],
      'clamp'
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.55, 1.0, 0.55],
      'clamp'
    );

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <Pressable
      style={[styles.cardContainer, { width, height: width }]}
      onPress={choose}
      accessibilityRole="button"
      accessibilityLabel={`Play ${item.title} by ${item.artist}`}
      accessibilityState={{ selected }}
    >
      <Animated.View
        style={[
          styles.imageWrapper,
          { width: Math.max(1, width - 16), height: Math.max(1, width - 16) },
          selected && styles.imageWrapperSelected,
          animatedCardStyle,
        ]}
      >
        {item.artwork && !failed ? (
          <Image
            source={{ uri: item.artwork }}
            style={styles.artworkImage}
            resizeMode="cover"
            fadeDuration={0}
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={styles.fallback}>
            <Music size={56} color={colors.accent} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
};

/**
 * Fluid, low-latency song card carousel inspired by Kobra Systems Carousel.
 * Features in-memory prefetching, smooth spring scaling, and gesture swipe selection.
 */
export const ArtworkCarousel: React.FC<ArtworkCarouselProps> = ({
  tracks,
  activeIndex,
  onTrackSelect,
  isReducedMotion = false,
  getSelectionVersion: _getSelectionVersion,
  swipeToSelect = false,
}) => {
  const { width: viewport } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const { card: width, inset } = carouselGeometry(measuredWidth || viewport);
  const reduced = useReducedMotion(isReducedMotion);
  const flatListRef = useRef<FlatList<IPlayableTrack>>(null);
  const scrollX = useSharedValue(activeIndex * width);
  const gesture = useRef(new ScrollInteraction()).current;
  const isUserDragging = useRef(false);
  const isProgrammaticScroll = useRef(false);
  const wasUserGesture = useRef(false);
  const queueKey = useMemo(() => tracks.map((track) => track.id).join('\0'), [tracks]);

  // Prefetch first 6 queue artworks in background for zero-latency swap
  useEffect(() => {
    tracks.slice(0, 6).forEach((track) => {
      if (track.artwork && !prefetchedUrls.has(track.artwork)) {
        prefetchedUrls.add(track.artwork);
        void Image.prefetch(track.artwork).catch(() => {});
      }
    });
  }, [queueKey]);

  // Prefetch active track audio lease in background for instant sub-second playback on tap
  useEffect(() => {
    const active = tracks[activeIndex];
    if (active && active.catalogSource === 'catalog') {
      void mediaLeases.resolve([active.id], 'AUDIO').catch(() => {});
    }
  }, [activeIndex, tracks]);

  // Synchronize carousel position when external controls (Next/Previous) trigger track change
  useEffect(() => {
    if (!isUserDragging.current && flatListRef.current) {
      isProgrammaticScroll.current = true;
      flatListRef.current.scrollToOffset({
        offset: activeIndex * width,
        animated: !reduced,
      });
      scrollX.value = activeIndex * width;
    }
  }, [activeIndex, reduced, width, queueKey, scrollX]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleScrollBeginDrag = () => {
    isUserDragging.current = true;
    wasUserGesture.current = true;
    isProgrammaticScroll.current = false;
    gesture.beginDrag();
  };

  const handleScrollEndDrag = (event?: NativeSyntheticEvent<NativeScrollEvent>) => {
    gesture.endDrag();
    if (isProgrammaticScroll.current) {
      isProgrammaticScroll.current = false;
      wasUserGesture.current = false;
      return;
    }
    if (!wasUserGesture.current) return;
    if (!swipeToSelect || !event?.nativeEvent) {
      isUserDragging.current = false;
      return;
    }
    const velocity = event.nativeEvent.velocity?.x ?? 0;
    if (Math.abs(velocity) < 0.1) {
      isUserDragging.current = false;
      wasUserGesture.current = false;
      const offset = event.nativeEvent.contentOffset.x;
      const nextIndex = carouselIndex(offset, width, tracks.length);
      if (nextIndex >= 0 && nextIndex < tracks.length && nextIndex !== activeIndex) {
        onTrackSelect(nextIndex);
      }
    }
  };

  const handleMomentumBegin = () => {
    gesture.beginMomentum();
  };

  const handleMomentumEnd = (event?: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserDragging.current = false;
    gesture.endMomentum();
    if (isProgrammaticScroll.current) {
      isProgrammaticScroll.current = false;
      wasUserGesture.current = false;
      return;
    }
    if (!wasUserGesture.current) return;
    wasUserGesture.current = false;
    if (!swipeToSelect || !event?.nativeEvent) return;
    const offset = event.nativeEvent.contentOffset.x;
    const nextIndex = carouselIndex(offset, width, tracks.length);
    if (nextIndex >= 0 && nextIndex < tracks.length && nextIndex !== activeIndex) {
      onTrackSelect(nextIndex);
    }
  };

  return (
    <View
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
      style={[styles.carouselContainer, { height: width + 24, width: '100%' }]}
    >
      <Animated.FlatList
        ref={flatListRef}
        data={tracks as IPlayableTrack[]}
        keyExtractor={(item) => item.id}
        horizontal
        nestedScrollEnabled={true}
        disableIntervalMomentum={true}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        getItemLayout={(_data, index) => ({ length: width, offset: width * index, index })}
        showsHorizontalScrollIndicator={false}
        snapToInterval={width}
        snapToAlignment="start"
        decelerationRate="fast"
        bounces={false}
        contentContainerStyle={{
          paddingHorizontal: inset,
        }}
        onScroll={onScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollBegin={handleMomentumBegin}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => (
          <AnimatedCarouselCard
            item={item}
            index={index}
            scrollX={scrollX}
            width={width}
            selected={index === activeIndex}
            choose={() => {
              if (index !== activeIndex && gesture.allowPress()) onTrackSelect(index);
            }}
            isReducedMotion={reduced}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  carouselContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
  },
  cardContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.raised,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  imageWrapperSelected: {
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
  },
});
