import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useDiscoveryStore } from '../../store/useDiscoveryStore';
import { GlassSurface } from '../../design/GlassSurface';
import { Button, ui } from '../app/ui';

export function DiscoverySummary(): React.JSX.Element {
  const router = useRouter(), period = useDiscoveryStore((s) => s.period), mood = useDiscoveryStore((s) => s.mood);
  return <GlassSurface style={styles.card}><Text style={ui.eyebrow}>A MIX FOR RIGHT NOW</Text><Text style={ui.sectionTitle}>{period ?? 'Your time'}, your way</Text>
    <Text style={ui.body}>{mood ? `${mood} mood selected.` : 'Pick a mood or let local time guide a music choice.'} Based on available catalog tags, with fewer recent repeats.</Text>
    <Button title="Explore moods & seasons" secondary onPress={() => router.push('/discovery')} /></GlassSurface>;
}
const styles = StyleSheet.create({ card: { marginHorizontal: 20, marginTop: 20, padding: 20, gap: 12 } });
