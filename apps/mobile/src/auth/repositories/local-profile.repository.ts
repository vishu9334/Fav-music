import { IDocumentStorage } from '../../library/library.contract';
import { ExpoDocumentStorage } from '../../library/file-library.repository';

export interface StoredUserProfile {
  readonly userId: string;
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
  readonly chatRetentionPreference?: string;
  readonly updatedAt: number;
}

/**
 * Account-isolated local profile cache.
 * Ensures user-specific profile overrides and custom photos survive app restarts
 * while enforcing strict partition boundaries between accounts.
 */
export class LocalProfileRepository {
  public constructor(
    private readonly storage: IDocumentStorage = new ExpoDocumentStorage()
  ) {}

  private key(userId: string): string {
    const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `aadat-profile-${safeId}.json`;
  }

  public async load(userId: string): Promise<StoredUserProfile | null> {
    if (!userId || typeof userId !== 'string') return null;
    try {
      const raw = await this.storage.read(this.key(userId));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      const record = parsed as Record<string, unknown>;
      // Strict account boundary: reject payload if userId does not match requested user
      if (record['userId'] !== userId) return null;

      return {
        userId,
        displayName: typeof record['displayName'] === 'string' ? record['displayName'] : undefined,
        avatarUrl: typeof record['avatarUrl'] === 'string' ? record['avatarUrl'] : record['avatarUrl'] === null ? null : undefined,
        chatRetentionPreference: typeof record['chatRetentionPreference'] === 'string' ? record['chatRetentionPreference'] : undefined,
        updatedAt: typeof record['updatedAt'] === 'number' ? record['updatedAt'] : Date.now(),
      };
    } catch {
      return null;
    }
  }

  public async save(userId: string, data: Partial<Omit<StoredUserProfile, 'userId' | 'updatedAt'>>): Promise<void> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid userId is required to save profile.');
    }
    const current = (await this.load(userId)) ?? { userId, updatedAt: Date.now() };
    const merged: StoredUserProfile = {
      userId,
      displayName: data.displayName !== undefined ? data.displayName : current.displayName,
      avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : current.avatarUrl,
      chatRetentionPreference: data.chatRetentionPreference !== undefined ? data.chatRetentionPreference : current.chatRetentionPreference,
      updatedAt: Date.now(),
    };
    await this.storage.write(this.key(userId), JSON.stringify(merged));
  }

  public async clear(userId: string): Promise<void> {
    if (!userId || typeof userId !== 'string') return;
    try {
      await this.storage.write(this.key(userId), '');
    } catch {
      // Best-effort cleanup
    }
  }
}
