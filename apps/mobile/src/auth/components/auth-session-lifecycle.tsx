import { usePlayerStore } from '../../store/usePlayerStore';
import { useDiscoveryStore } from '../../store/useDiscoveryStore';
import { useRoomStore } from '../../store/useRoomStore';
import React from 'react';
import { AppState, NativeEventSubscription } from 'react-native';
import { AuthModule } from '../auth.module';
import { AuthCollectionBinding } from '../controllers/auth-collection.binding';
import { useLibraryStore } from '../../store/useLibraryStore';
import { roomSocketClient } from '../../services/room/room-socket.client';

/** Restore account state without gating or remounting the music player. */
export class AuthSessionLifecycle extends React.Component {
  private subscription?: NativeEventSubscription;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private binding?: AuthCollectionBinding;
  private schedule = (): void => {
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    const controller = AuthModule.getController(), expires = controller.getExpiresAt();
    if (AppState.currentState !== 'active' || controller.getSnapshot().status !== 'authenticated' || expires === null) return;
    this.timer = setTimeout(() => { void controller.restore(); }, Math.max(1000, Math.min(2_147_483_647, expires - Date.now() - 30_000)));
  };
  public override componentDidMount(): void {
    const controller = AuthModule.getController();
    this.binding = new AuthCollectionBinding(controller, async (id) => {
      roomSocketClient.disconnect();
      const reset=usePlayerStore.getState().resetForAccount();
      const activation=useLibraryStore.getState().activateAccount(id);
      useDiscoveryStore.getState().resetForAccount();
      useRoomStore.getState().leaveRoom();
      await activation;
      await reset;
    }); this.binding.start();
    this.unsubscribe = controller.subscribe(this.schedule);
    void controller.restore();
    this.subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // A Google picker also resumes this activity. Do not replace its result/error
        // with an empty-session restore; retries from the sign-in screen are explicit.
        const status = controller.getSnapshot().status;
        if (status === 'authenticated') void controller.restore();
      } else if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    });
  }
  public override componentWillUnmount(): void { this.subscription?.remove(); this.unsubscribe?.(); this.binding?.stop(); if (this.timer) clearTimeout(this.timer); }
  public override render(): null { return null; }
}
