import { create } from 'zustand';
import { isDecade, SEASONS } from '../catalog/demo-catalog';
import { IPlayableTrack } from '../data/sample-tracks';
import { HistoryService } from '../discovery/history.service';
import { IHistoryRepository, localTimePeriod, Mood, MOODS, PlayedTrack, WeatherCondition } from '../discovery/discovery.types';
import { DiscoveryContext, RecommendationService } from '../discovery/recommendation.service';
import { weatherService } from '../discovery/weather.service';
import {
  calculateSolarAltitude,
  resolveCoordinatesFromTimezone,
} from '../discovery/solar-context';

export interface IDiscoveryPlayer {
  prepare?(context: DiscoveryContext): Promise<boolean>;
  currentId(): string | undefined;
  play(tracks: readonly IPlayableTrack[], id: string, label: string): Promise<boolean>;
}
export interface DiscoveryState extends DiscoveryContext {
  weather: WeatherCondition | null;
  isDay: boolean;
  dayOrNight: 'Day' | 'Night';
  solarAltitude: number;
  tempCelsius: number | null;
  city: string | null;
  coords: { latitude: number; longitude: number } | null;
  history: readonly PlayedTrack[];
  historyReady: boolean;
  historyError: string | null;
  busy: boolean;
  message: string | null;
  resetForAccount: () => void;
  refreshTime: () => void;
  refreshWeather: () => Promise<void>;
  setMood: (mood: Mood | null) => void;
  clearFilters: () => void;
  setSeason: (season: string) => void;
  setDecade: (decade: string) => void;
  initializeHistory: () => Promise<boolean>;
  recordPlayed: (id: string) => Promise<void>;
  retryHistory: () => Promise<void>;
  playRandom: () => Promise<string | null>;
}

export function createDiscoveryStore(repository: IHistoryRepository | (()=>IHistoryRepository), recommendations: RecommendationService,
  player: IDiscoveryPlayer, excludedIds: () => readonly string[] = () => [], now: () => Date = () => new Date()) {
  let choosing: Promise<string | null> | null = null;
  return create<DiscoveryState>((set, get) => {
    let generation=0;
    const makeHistory=()=>{const version=generation;return new HistoryService(typeof repository==='function'?repository():repository,(entries)=>{if(version===generation)set({history:entries,historyReady:true});},()=>now().getTime());};
    let history=makeHistory();
    const errorText = (e: unknown) => e instanceof Error ? e.message : 'Listening history could not be saved.';
    const initialCoords = resolveCoordinatesFromTimezone();
    const initialSolar = calculateSolarAltitude(initialCoords.latitude, initialCoords.longitude, now());
    const initialIsDay = initialSolar > -0.833;

    return {
      period: localTimePeriod(now()), weather: null, mood: null, season: '', decade: '',
      isDay: initialIsDay, dayOrNight: initialIsDay ? 'Day' : 'Night', solarAltitude: initialSolar,
      tempCelsius: null, city: null, coords: initialCoords,
      history: [], historyReady: false, historyError: null,
      busy: false, message: null,
      resetForAccount:()=>{generation++;history=makeHistory();choosing=null;set({history:[],historyReady:false,historyError:null,message:null,busy:false,mood:null,season:'',decade:'',weather:null,tempCelsius:null,city:null});},
      refreshTime: () => {
        const currentDate = now();
        const coords = get().coords ?? resolveCoordinatesFromTimezone();
        const solar = calculateSolarAltitude(coords.latitude, coords.longitude, currentDate);
        const isDay = solar > -0.833;
        set({
          period: localTimePeriod(currentDate),
          isDay,
          dayOrNight: isDay ? 'Day' : 'Night',
          solarAltitude: solar,
        });
      },
      refreshWeather: async () => {
        const snapshot = await weatherService.getWeather();
        const coords = snapshot?.coords ?? weatherService.getLastCoords() ?? get().coords ?? resolveCoordinatesFromTimezone();
        const currentDate = now();
        const solar = calculateSolarAltitude(coords.latitude, coords.longitude, currentDate);
        const isDay = solar > -0.833;
        set({
          weather: snapshot?.condition ?? null,
          tempCelsius: snapshot?.tempCelsius ?? null,
          city: snapshot?.city ?? null,
          coords,
          isDay,
          dayOrNight: isDay ? 'Day' : 'Night',
          solarAltitude: solar,
          period: localTimePeriod(currentDate),
        });
      },
      clearFilters: () => set({ mood: null, season: '', decade: '', message: null }),
      setMood: (mood) => {
        if (!mood) { if (get().mood !== null) set({ mood: null, message: null }); return; }
        const matched = MOODS.find(m => m.toLowerCase() === (mood as string).trim().toLowerCase());
        if (matched && get().mood !== matched) set({ mood: matched, message: null });
      },
      setSeason: (season) => {
        if (!season) { if (get().season !== '') set({ season: '', message: null }); return; }
        const matched = (SEASONS as readonly string[]).find(s => s.toLowerCase() === season.trim().toLowerCase());
        if (matched && get().season !== matched) set({ season: matched, message: null });
      },
      setDecade: (decade) => {
        const norm = decade ? decade.replace(/-/g, '–').trim() : '';
        if ((!norm || isDecade(norm)) && get().decade !== norm) set({ decade: norm, message: null });
      },
      initializeHistory: async () => {
        let version=generation,current=history;
        try { await current.initialize(); if(version!==generation)return false; set({ historyReady: true, historyError: null }); return true; }
        catch (e) {
          if (typeof repository === 'function') {
            try {
              history = makeHistory();
              generation++;
              version = generation;
              await history.initialize();
              if (version === generation) { set({ historyReady: true, historyError: null }); return true; }
            } catch (retryError) {
              if (version === generation) set({ historyError: errorText(retryError) });
              return false;
            }
          }
          if(version===generation)set({ historyError: errorText(e) }); return false;
        }
      },
      recordPlayed: async (id) => {
        let version=generation,current=history;
        try { await current.record(id); if(version===generation)set({ historyError: null }); }
        catch (e) {
          if (typeof repository === 'function') {
            try {
              history = makeHistory();
              generation++;
              version = generation;
              await history.record(id);
              if (version === generation) set({ historyError: null });
              return;
            } catch (retryError) {
              if (version === generation) set({ historyError: `${errorText(retryError)} History may only be available for this session.` });
              return;
            }
          }
          if(version===generation)set({ historyError: `${errorText(e)} History may only be available for this session.` });
        }
      },
      retryHistory: async () => {
        const version=generation,current=history;
        try { await current.flush(); if(version===generation)set({ historyReady: true, historyError: null }); }
        catch (e) { if(version===generation)set({ historyError: errorText(e) }); }
      },
      playRandom: () => {
        if (choosing) return choosing;
        const version=generation;
        set({ busy: true, message: null });
        choosing = (async () => {
          if (!await get().initializeHistory()) { if(version===generation)set({ message: 'Saved history is unavailable. Open discovery to retry, or play a song directly.' }); return null; }
          if(version!==generation)return null;
          if (player.prepare && !await player.prepare(get())) { if(version===generation)set({ message: 'Your saved library is unavailable. Retry it before automatic discovery.' }); return null; }
          if(version!==generation)return null;
          get().refreshTime();
          await get().refreshWeather();
          const choice = recommendations.choose(get(), get().history, player.currentId(), excludedIds());
          if (!choice) { set({ message: 'No loaded tracks match. Clear a filter or restore a removed/hidden song.' }); return null; }
          if (!await player.play(choice.queue, choice.track.id, choice.label)) {
            if(version===generation)set({ message: 'Playback did not start. Open the player for details and retry.' }); return null;
          }
          // Only the native history observer records actual playback; queue selection itself is not a play.
          if(version!==generation)return null;
          set({ message: `${choice.track.title}. ${choice.message}` }); return choice.track.id;
        })().catch(() => { if(version===generation)set({ message: 'Discovery playback is unavailable. Try again from the player.' }); return null; })
          .finally(() => { if(version===generation){choosing = null; set({ busy: false });} });
        return choosing;
      },
    };
  });
}
