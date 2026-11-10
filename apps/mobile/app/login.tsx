import React, { useSyncExternalStore } from 'react';
import { Redirect } from 'expo-router';
import { AuthModule } from '../src/auth/auth.module';
import { AuthScreen } from '../src/auth/components/auth.screen';
export default function LoginRoute(): React.JSX.Element {
  const controller = AuthModule.getController();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return state.status === 'authenticated' && state.user ? <Redirect href="/" /> : <AuthScreen />;
}
