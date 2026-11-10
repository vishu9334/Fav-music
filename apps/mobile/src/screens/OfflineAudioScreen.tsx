import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OFFLINE_TRACKS } from '../catalog/offline-samples';
import { SongList } from '../components/catalog/SongList';
import { PageHeader, ui } from '../components/app/ui';
export default function OfflineAudioScreen(): React.JSX.Element {
  return <SafeAreaView style={ui.screen}><SongList tracks={OFFLINE_TRACKS} label="Original offline test audio"
    header={<PageHeader back title="Offline test audio" subtitle="Original test tones" />} /></SafeAreaView>;
}
