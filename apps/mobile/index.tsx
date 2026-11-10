import React from 'react';
import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import TrackPlayer from 'react-native-track-player';
import { playbackService } from './src/services/playback/playback-service';

// Declare require.context for Metro environment
declare const require: {
  (name: string): unknown;
  context: (
    directory: string,
    useSubdirectories?: boolean,
    regExp?: RegExp
  ) => {
    keys: () => string[];
    <T>(id: string): T;
    resolve: (id: string) => string;
    id: string;
  };
};

export function App(): React.JSX.Element {
  if (process.env.EXPO_PUBLIC_APP_MODE === 'development-playback-verification' && process.env.EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENABLED === 'true') {
    const Screen = (require('./src/development/DevelopmentPlaybackScreen') as { default: React.ComponentType }).default;
    return <Screen />;
  }
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

// 1. MUST register root component first so "main" is immediately available to Android runtime
registerRootComponent(App);

// 2. Register background headless playback service for Android Media Notification
try {
  TrackPlayer.registerPlaybackService(() => playbackService);
} catch (error) {
  console.error('[PlaybackService] Failed to register playback service:', error);
}
