import React, { useSyncExternalStore } from 'react';
import { AuthModule } from '../auth.module';
import { AuthState } from '../controllers/auth.controller';
import { AuthScreen } from './auth.screen';

export function hasVerifiedAccount(state: AuthState): boolean {
  return !!state.user && (state.status === 'authenticated' || state.status === 'loading');
}
export function useAccountAccess(): boolean {
  const controller = AuthModule.getController();
  return hasVerifiedAccount(useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot));
}
export function withAccountScreen(Screen: React.ComponentType): () => React.JSX.Element {
  return function AccountScreen(): React.JSX.Element { const controller=AuthModule.getController(),state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);return hasVerifiedAccount(state) ? <Screen key={state.user!.id} /> : <AuthScreen />; };
}
export function AccountOnly({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const controller=AuthModule.getController(),state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  return hasVerifiedAccount(state) ? <React.Fragment key={state.user!.id}>{children}</React.Fragment> : null;
}
