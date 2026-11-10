import { AuthController } from './auth.controller';

/** Only server-verified presentation identity selects an account journal. No tokens are persisted here. */
export class AuthCollectionBinding {
  private target: string | null | undefined;
  private unsubscribe?: () => void;
  public constructor(private readonly auth: Pick<AuthController, 'getSnapshot' | 'subscribe'>,
    private readonly activate: (userId: string | null) => Promise<void>) {}
  public start(): void {
    if (this.unsubscribe) return;
    const changed = () => {
      const state = this.auth.getSnapshot();
      if (state.status === 'loading' && state.user) return; // Keep previously verified local data during revalidation.
      const userId = state.status === 'authenticated' ? state.user?.id ?? null : null;
      if (userId === this.target) return;
      this.target = userId; void this.activate(userId).catch(() => {});
    };
    this.unsubscribe = this.auth.subscribe(changed); changed();
  }
  public stop(): void { this.unsubscribe?.(); this.unsubscribe = undefined; this.target = undefined; }
}
