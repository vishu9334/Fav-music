import { colors } from '../src/design/theme';
import {IncomingShareLifecycle} from '../src/sharing/IncomingShareLifecycle';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLifecycle } from '../src/components/app/AppLifecycle';
import { View } from 'react-native';
import { AppHeader } from '../src/components/app/AppHeader';
import { AppDock } from '../src/components/app/AppTabBar';
import { AuthSessionLifecycle } from '../src/auth/components/auth-session-lifecycle';
import { AccountOnly } from '../src/auth/components/account-access';

export const unstable_settings = { initialRouteName: '(tabs)' };
export default function RootLayout(): React.JSX.Element {
  return <SafeAreaProvider><StatusBar style="light" /><View style={{ flex: 1, backgroundColor: colors.bg }}><AccountOnly><AppHeader /></AccountOnly><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Screen name="(tabs)" /><Stack.Screen name="player" options={{ presentation: 'modal' }} />
    <Stack.Screen name="collection" /><Stack.Screen name="playlist" />
    <Stack.Screen name="instamus" /><Stack.Screen name="shared" />
    <Stack.Screen name="discovery" /><Stack.Screen name="history" />
    <Stack.Screen name="videos" />
    <Stack.Screen name="offline" />
    <Stack.Screen name="rooms" />
    <Stack.Screen name="login" /><Stack.Screen name="profile" />
  </Stack><AccountOnly><AppDock /><AppLifecycle /></AccountOnly></View><AuthSessionLifecycle /><IncomingShareLifecycle /></SafeAreaProvider>;
}
