import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Button } from '../design/controls';
import { colors } from '../design/theme';
import { ui } from '../design/styles';
import { AccountLayoutReview } from './AccountLayoutReview';
import { nativeBlurAvailable } from '../design/NativeBackdrop';
import { GlassSurface } from '../design/GlassSurface';
import { KobraPlaybackControls } from '../components/kobra/KobraPlaybackControls';
import { PlaybackState } from '@aadat/contracts';
import { VIDEO_ITEMS } from '../video/video-catalog';
const screens = ['Home', 'Search', 'Library', 'Playlists', 'Music Warehouse', 'InstaMus', 'Discovery & history', 'Decades & seasons', 'Artists, albums & provider playlists', 'Shared tracks', 'Login', 'Profile', 'Audio player', 'Video player'] as const;
type Review = 'menu' | 'login' | 'profile' | 'loading' | 'video' | 'effects' | 'navigation';
/** A separate presentation laboratory: no AuthUser/AuthState, controller, account API or store mutation. */
export function VisualReviewHub({ close }: { close: () => void }): React.JSX.Element {
  const [page, setPage] = useState<Review>('menu');
  if (page === 'video') return <LocalVideoReview back={() => setPage('menu')} />;
  return <SafeAreaView style={ui.screen}><KeyboardAvoidingView style={ui.grow} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20, flexGrow: 1 }}>
    <Text style={ui.eyebrow}>AADAT · VISUAL ACCEPTANCE ONLY</Text><Text accessibilityRole="header" style={ui.title}>{page === 'menu' ? 'Review the interface' : page === 'navigation' ? 'Feature navigation' : `${page[0]!.toUpperCase()}${page.slice(1)} layout`}</Text>
    <Text style={ui.body}>No account is signed in here. This view never loads or saves personal collections. The real screens share these layouts. Account actions are disabled; review text is never saved.</Text>
    <Button title={page === 'menu' ? 'Back to real-song playback' : 'Back to visual review'} secondary onPress={page === 'menu' ? close : () => setPage('menu')} />
    {page === 'menu' && <><Button title="Review Login layout" onPress={() => setPage('login')} /><Button title="Review Profile layout" onPress={() => setPage('profile')} /><Button title="Review Loading layout" secondary onPress={() => setPage('loading')} /><Button title="Play original local video clips" onPress={() => setPage('video')} /><Button title="Review glass & motion" secondary onPress={() => setPage('effects')} /><Button title="View intended feature navigation" secondary onPress={() => setPage('navigation')} /></>}
    {(page === 'login' || page === 'profile' || page === 'loading') && <AccountLayoutReview key={page} page={page} />}
    {page === 'effects' && <EffectsReview />}
    {page === 'navigation' && <>{screens.map(name => <GlassSurface key={name} style={{ padding: 16, gap: 8 }}><Text style={ui.sectionTitle}>{name}</Text><Text style={ui.subtitle}>{name === 'Login' || name === 'Profile' ? 'Presentation layouts are available above. Real operations require authentication.' : name === 'Video player' ? 'Original local clips are available above. Remote video remains unverified.' : name === 'Audio player' || name === 'Search' ? 'Real read-only catalog playback is available from the diagnostic screen.' : 'Available through the main app’s guarded navigation after real authentication.'}</Text></GlassSurface>)}</>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
function EffectsReview(): React.JSX.Element {
  const [playing, setPlaying] = useState(false), [lightweight, setLightweight] = useState(false);
  return <><Text style={ui.body}>Native blur module: {nativeBlurAvailable() ? 'available in this runtime' : 'missing · a future native build is needed'}. Android 12+ uses bounded native blur; older devices and reduced-motion/transparency settings keep the inexpensive tint.</Text><Button title={lightweight ? 'Use automatic glass effects' : 'Use lightweight effects'} secondary onPress={() => setLightweight(value => !value)} /><View style={{ backgroundColor: colors.darkAccent, padding: 12, borderRadius: 28 }}><Text style={ui.subtitle}>Glass backdrop & glyph animation sample · no media is playing</Text><KobraPlaybackControls reducedMotion={lightweight} playbackState={playing ? PlaybackState.PLAYING : PlaybackState.PAUSED} onPlayPause={() => setPlaying(value => !value)} onPrevious={() => setPlaying(false)} onNext={() => setPlaying(true)} /></View><Text style={ui.subtitle}>The toggle above changes only the visual glyph sample. Real playback is tested in the audio/video views. The lens rim/highlight approximates liquid glass; live optical pixel distortion is not claimed.</Text></>;
}
export function LocalVideoReview({ back }: { back: () => void }): React.JSX.Element {
  let available = false, orientation = false;
  try { available = !!requireOptionalNativeModule('ExpoVideo'); orientation = !!requireOptionalNativeModule('ExpoScreenOrientation'); } catch {}
  if (!available) return <SafeAreaView style={ui.screen}><ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}><Text style={ui.title}>Original local videos</Text><Text style={ui.body}>This runtime has no ExpoVideo module. No playback success is claimed.</Text><Button title="Back to visual review" onPress={back} /></ScrollView></SafeAreaView>;
  const Session = (require('../video/NativeVideoSession') as typeof import('../video/NativeVideoSession')).NativeVideoSession;
  return <Session items={VIDEO_ITEMS} orientationAvailable={orientation} back={back} />;
}
