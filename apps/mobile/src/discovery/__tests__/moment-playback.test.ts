import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlaybackState } from '@aadat/contracts';
import { DemoCatalog } from '../../catalog/demo-catalog';
import { IPlayableTrack } from '../../data/sample-tracks';
import { DiscoveryContext, RecommendationService } from '../recommendation.service';
import { ReliableWeatherProvider } from '../weather.service';
import { createDiscoveryStore } from '../../store/createDiscoveryStore';

describe('Stage 19: Smart Moment Playback — Deterministic Contextual Recommendation', () => {
  const sampleTracks: IPlayableTrack[] = [
    {
      id: 'track-morning-sunny',
      title: 'Morning Sun',
      artist: 'Acoustic Sunrise',
      duration: 180,
      url: 'https://cdn.aadat.internal/audio/1.mp3',
      artwork: 'https://cdn.aadat.internal/artwork/1.jpg',
    },
    {
      id: 'track-morning-rainy',
      title: 'Rainy Morning Tea',
      artist: 'Monsoon Ensemble',
      duration: 210,
      url: 'https://cdn.aadat.internal/audio/2.mp3',
      artwork: 'https://cdn.aadat.internal/artwork/2.jpg',
    },
    {
      id: 'track-evening-chill',
      title: 'Sunset Reverie',
      artist: 'Dusk Collective',
      duration: 240,
      url: 'https://cdn.aadat.internal/audio/3.mp3',
      artwork: 'https://cdn.aadat.internal/artwork/3.jpg',
    },
    {
      id: 'track-night-beats',
      title: 'Midnight Drive',
      artist: 'Neon Night',
      duration: 195,
      url: 'https://cdn.aadat.internal/audio/4.mp3',
      artwork: 'https://cdn.aadat.internal/artwork/4.jpg',
    },
    {
      id: 'track-corrupt-no-url',
      title: 'Broken Track',
      artist: 'Ghost Artist',
      duration: 120,
      url: '', // Unplayable URL
      artwork: '',
    },
    {
      id: 'track-corrupt-zero-duration',
      title: 'Zero Length',
      artist: 'Unknown',
      duration: 0, // Invalid duration
      url: 'https://cdn.aadat.internal/audio/broken.mp3',
      artwork: '',
    },
  ];

  const catalog = new DemoCatalog([
    {
      track: sampleTracks[0]!,
      times: ['Morning'],
      weatherAffinities: ['CLEAR_SUNNY'],
      seasons: ['Summer'],
    },
    {
      track: sampleTracks[1]!,
      times: ['Morning'],
      weatherAffinities: ['RAINY'],
      seasons: ['Monsoon'],
    },
    {
      track: sampleTracks[2]!,
      times: ['Evening'],
      weatherAffinities: ['CLEAR_SUNNY', 'CLOUDY'],
      seasons: ['Autumn'],
    },
    {
      track: sampleTracks[3]!,
      times: ['Night'],
      weatherAffinities: ['CLEAR_SUNNY'],
      seasons: ['Winter'],
    },
    {
      track: sampleTracks[4]!,
      times: ['Morning'],
      weatherAffinities: ['CLEAR_SUNNY'],
      seasons: ['Summer'],
    },
    {
      track: sampleTracks[5]!,
      times: ['Morning'],
      weatherAffinities: ['CLEAR_SUNNY'],
      seasons: ['Summer'],
    },
  ]);

  let service: RecommendationService;

  beforeEach(() => {
    service = new RecommendationService(catalog);
  });

  it('validates candidate tracks and filters out broken/empty streaming URLs or invalid durations', () => {
    const context: DiscoveryContext = {
      period: 'Morning',
      weather: null,
      mood: null,
      season: '',
      decade: '',
    };

    const candidates = service.candidates(context);
    expect(candidates.map((t) => t.id)).not.toContain('track-corrupt-no-url');
    expect(candidates.map((t) => t.id)).not.toContain('track-corrupt-zero-duration');
    expect(candidates.map((t) => t.id)).toContain('track-morning-sunny');
    expect(candidates.map((t) => t.id)).toContain('track-morning-rainy');
  });

  it('is completely deterministic: produces identical recommendation for identical context and history', () => {
    const context: DiscoveryContext = {
      period: 'Morning',
      weather: null,
      mood: null,
      season: '',
      decade: '',
    };

    const choice1 = service.choose(context, []);
    const choice2 = service.choose(context, []);

    expect(choice1).not.toBeNull();
    expect(choice2).not.toBeNull();
    expect(choice1!.track.id).toBe(choice2!.track.id);
    expect(choice1!.queue.map((t) => t.id)).toEqual(choice2!.queue.map((t) => t.id));
  });

  it('gracefully uses time-based selection when weather is unavailable (null) without inventing weather', () => {
    const morningContext: DiscoveryContext = {
      period: 'Morning',
      weather: null, // Weather unavailable
      mood: null,
      season: '',
      decade: '',
    };

    const choice = service.choose(morningContext, []);
    expect(choice).not.toBeNull();
    // In morning with no weather, a morning track must be selected
    expect(choice!.track.id).toMatch(/^track-morning-/);
    expect(choice!.label).not.toContain('Rainy');
    expect(choice!.label).not.toContain('Sunny');
    expect(choice!.label).toContain('Morning');
  });

  it('considers actual weather when reliable weather data and permission are present', () => {
    const rainyMorningContext: DiscoveryContext = {
      period: 'Morning',
      weather: 'Rainy',
      mood: null,
      season: '',
      decade: '',
    };

    const choice = service.choose(rainyMorningContext, []);
    expect(choice).not.toBeNull();
    // Both track-morning-sunny and track-morning-rainy match morning, but rainy matches weather!
    expect(choice!.track.id).toBe('track-morning-rainy');
    expect(choice!.label).toContain('Rainy');
  });

  it('selects evening tracks in the evening and night tracks at night', () => {
    const eveningChoice = service.choose(
      { period: 'Evening', weather: null, mood: null, season: '', decade: '' },
      []
    );
    expect(eveningChoice?.track.id).toBe('track-evening-chill');

    const nightChoice = service.choose(
      { period: 'Night', weather: null, mood: null, season: '', decade: '' },
      []
    );
    expect(nightChoice?.track.id).toBe('track-night-beats');
  });

  it('avoids repeatedly selecting recently played songs and current playing track', () => {
    const morningContext: DiscoveryContext = {
      period: 'Morning',
      weather: null,
      mood: null,
      season: '',
      decade: '',
    };

    // If track-morning-sunny is currently playing or was just played:
    const history = [{ trackId: 'track-morning-sunny', playedAt: Date.now() }];
    const choice = service.choose(morningContext, history, 'track-morning-sunny');

    expect(choice).not.toBeNull();
    // Must avoid the current track and pick track-morning-rainy instead
    expect(choice!.track.id).toBe('track-morning-rainy');
    // Current track must be pushed to the end of the queue
    expect(choice!.queue.at(-1)?.id).toBe('track-morning-sunny');
  });
});

describe('ReliableWeatherProvider — Permission & Freshness Safety', () => {
  let provider: ReliableWeatherProvider;

  beforeEach(() => {
    provider = new ReliableWeatherProvider(false);
  });

  it('returns null if user permission has not been granted', async () => {
    provider.setWeatherSnapshot({
      condition: 'Sunny',
      isReliable: true,
      timestamp: Date.now(),
    });

    // Permission is false
    expect(provider.hasPermission()).toBe(false);
    expect(await provider.getWeather()).toBeNull();
  });

  it('returns null if weather data is marked unreliable', async () => {
    provider.setPermission(true);
    provider.setWeatherSnapshot({
      condition: 'Sunny',
      isReliable: false, // Unreliable source
      timestamp: Date.now(),
    });

    expect(await provider.getWeather()).toBeNull();
  });

  it('returns null if weather data is stale (> 30 minutes old)', async () => {
    provider.setPermission(true);
    const staleTime = Date.now() - 35 * 60 * 1000;
    provider.setWeatherSnapshot({
      condition: 'Sunny',
      isReliable: true,
      timestamp: staleTime,
    });

    expect(await provider.getWeather()).toBeNull();
  });

  it('returns valid WeatherSnapshot when permission is granted and data is fresh and reliable', async () => {
    provider.setPermission(true);
    const now = Date.now();
    provider.setWeatherSnapshot({
      condition: 'Rainy',
      isReliable: true,
      timestamp: now,
    });

    const weather = await provider.getWeather();
    expect(weather).not.toBeNull();
    expect(weather!.condition).toBe('Rainy');
    expect(weather!.isReliable).toBe(true);
  });
});

describe('createDiscoveryStore — Playback Race and Buffering Tolerance', () => {
  it('succeeds and starts playback when native player is in BUFFERING or LOADING state', async () => {
    const sampleTrack: IPlayableTrack = {
      id: 'track-1',
      title: 'Buffering Track',
      artist: 'Artist',
      duration: 180,
      url: 'https://cdn.aadat.internal/audio/1.mp3',
      artwork: '',
    };

    const catalog = new DemoCatalog([{ track: sampleTrack, times: ['Morning'], seasons: [] }]);
    const recommendations = new RecommendationService(catalog, () => 0);

    let playerPlaybackState: PlaybackState = PlaybackState.BUFFERING;
    let playedTrackId: string | null = null;

    const mockPlayer = {
      currentId: () => undefined,
      prepare: async () => true,
      play: async (_tracks: readonly IPlayableTrack[], id: string) => {
        playedTrackId = id;
        // Simulates realistic network audio streaming: player transitions to BUFFERING, not immediately PLAYING
        const acceptableStates: readonly PlaybackState[] = [
          PlaybackState.PLAYING,
          PlaybackState.BUFFERING,
          PlaybackState.LOADING,
        ];
        const isAcceptable = acceptableStates.includes(playerPlaybackState);
        return isAcceptable;
      },
    };

    const store = createDiscoveryStore(
      { load: async () => null, save: async () => {} },
      recommendations,
      mockPlayer,
      () => [],
      () => new Date(2026, 10, 6, 8) // 8 AM = Morning
    );

    const chosenId = await store.getState().playRandom();
    expect(chosenId).toBe('track-1');
    expect(playedTrackId).toBe('track-1');
    expect(store.getState().busy).toBe(false);
  });

  it('shares in-flight promise and prevents duplicate queue requests during rapid taps', async () => {
    const sampleTrack: IPlayableTrack = {
      id: 'track-rapid',
      title: 'Rapid Track',
      artist: 'Artist',
      duration: 180,
      url: 'https://cdn.aadat.internal/audio/rapid.mp3',
      artwork: '',
    };

    const catalog = new DemoCatalog([{ track: sampleTrack, times: ['Morning'], seasons: [] }]);
    const recommendations = new RecommendationService(catalog, () => 0);

    let playCalls = 0;
    let releasePlay!: (value: boolean) => void;

    const mockPlayer = {
      currentId: () => undefined,
      prepare: async () => true,
      play: async () => {
        playCalls++;
        return new Promise<boolean>((resolve) => {
          releasePlay = resolve;
        });
      },
    };

    const store = createDiscoveryStore(
      { load: async () => null, save: async () => {} },
      recommendations,
      mockPlayer,
      () => [],
      () => new Date(2026, 10, 6, 8)
    );

    // Rapid double-tap
    const firstCall = store.getState().playRandom();
    const secondCall = store.getState().playRandom();

    expect(firstCall).toBe(secondCall); // Must return the identical promise
    expect(store.getState().busy).toBe(true);

    await vi.waitFor(() => {
      expect(playCalls).toBe(1);
    });

    releasePlay(true);
    await firstCall;

    expect(playCalls).toBe(1); // Only 1 playQueue execution occurred
    expect(store.getState().busy).toBe(false);
  });
});
