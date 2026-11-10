import React from 'react';
import { Tabs } from 'expo-router';
import { withAccountScreen } from '../../src/auth/components/account-access';
function TabLayout(): React.JSX.Element {
  return <Tabs screenOptions={{ headerShown: false, lazy: true }} tabBar={() => null}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} /><Tabs.Screen name="search" options={{ title: 'Search' }} />
    <Tabs.Screen name="library" options={{ title: 'Library' }} /><Tabs.Screen name="warehouse" options={{ title: 'Music Warehouse' }} />
  </Tabs>;
}
export default withAccountScreen(TabLayout);
