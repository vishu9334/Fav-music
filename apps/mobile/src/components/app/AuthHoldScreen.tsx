import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, EmptyState, PageHeader, ui } from './ui';
export function AuthHoldScreen(): React.JSX.Element {
  const router = useRouter();
  return <SafeAreaView style={ui.screen}><PageHeader back title="Your music, here" />
    <EmptyState title="Sign-in unavailable">
      <Button title="Back to music" onPress={() => router.replace('/')} />
    </EmptyState>
  </SafeAreaView>;
}
