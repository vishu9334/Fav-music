import { describe, expect, it, vi } from 'vitest';
import {
  validateAndOptimizeProfilePhoto,
  PRESET_AVATARS,
} from '../services/profile-photo.service';
import { LocalProfileRepository } from '../repositories/local-profile.repository';
import { IDocumentStorage } from '../../library/library.contract';
import { AuthUser, IAuthRepository, IGoogleAuthProvider, ISessionRepository } from '../contracts/auth.contract';
import { AuthService } from '../services/auth.service';
import { AuthController } from '../controllers/auth.controller';

class MemoryStorage implements IDocumentStorage {
  public files = new Map<string, string>();
  public async read(name: string): Promise<string | null> {
    return this.files.get(name) ?? null;
  }
  public async write(name: string, value: string): Promise<void> {
    if (value === '') {
      this.files.delete(name);
    } else {
      this.files.set(name, value);
    }
  }
}

describe('Stage 15 — Profile & Privacy Management', () => {
  describe('Profile photo validation & optimization', () => {
    it('accepts valid JPEG, PNG, and WebP data URIs within the 2MB boundary', () => {
      // 100-byte dummy JPEG data URI
      const jpeg = `data:image/jpeg;base64,${'A'.repeat(128)}`;
      const resultJpeg = validateAndOptimizeProfilePhoto(jpeg);
      expect(resultJpeg.valid).toBe(true);
      expect(resultJpeg.photo?.mimeType).toBe('image/jpeg');

      // PNG data URI
      const png = `data:image/png;base64,${'B'.repeat(128)}`;
      const resultPng = validateAndOptimizeProfilePhoto(png);
      expect(resultPng.valid).toBe(true);
      expect(resultPng.photo?.mimeType).toBe('image/png');

      // WebP data URI
      const webp = `data:image/webp;base64,${'C'.repeat(128)}`;
      const resultWebp = validateAndOptimizeProfilePhoto(webp);
      expect(resultWebp.valid).toBe(true);
      expect(resultWebp.photo?.mimeType).toBe('image/webp');
    });

    it('rejects oversized images exceeding 2MB limit', () => {
      // Generate base64 string approximating 2.5MB
      const oversized = `data:image/jpeg;base64,${'X'.repeat(3.5 * 1024 * 1024)}`;
      const result = validateAndOptimizeProfilePhoto(oversized);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds allowed limit');
    });

    it('rejects unsupported or dangerous image formats (SVG, scripts, html)', () => {
      const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
      expect(validateAndOptimizeProfilePhoto(svg).valid).toBe(false);

      const html = 'data:text/html;base64,PGgxPkhlbGxvPC9oMT4=';
      expect(validateAndOptimizeProfilePhoto(html).valid).toBe(false);

      const script = 'javascript:alert(1)';
      expect(validateAndOptimizeProfilePhoto(script).valid).toBe(false);

      expect(validateAndOptimizeProfilePhoto('').valid).toBe(false);
    });

    it('accepts secure HTTPS URLs and local file URIs', () => {
      const httpsUrl = 'https://example.com/avatar.jpg';
      const resultHttps = validateAndOptimizeProfilePhoto(httpsUrl);
      expect(resultHttps.valid).toBe(true);
      expect(resultHttps.photo?.uri).toBe(httpsUrl);

      const fileUri = 'file:///data/user/0/com.favmusic/files/avatar.png';
      const resultFile = validateAndOptimizeProfilePhoto(fileUri);
      expect(resultFile.valid).toBe(true);
      expect(resultFile.photo?.uri).toBe(fileUri);
    });

    it('provides valid curated preset avatars with square ratio and valid URIs', () => {
      expect(PRESET_AVATARS.length).toBeGreaterThan(0);
      for (const preset of PRESET_AVATARS) {
        expect(preset.id).toBeTruthy();
        expect(preset.label).toBeTruthy();
        expect(preset.uri.startsWith('https://')).toBe(true);
      }
    });
  });

  describe('Local Profile Persistence & Account Isolation', () => {
    it('isolates saved profiles strictly by verified userId', async () => {
      const storage = new MemoryStorage();
      const repo = new LocalProfileRepository(storage);

      const userA = '10000000-0000-4000-8000-000000000001';
      const userB = '20000000-0000-4000-8000-000000000002';

      // Save profile for User A
      await repo.save(userA, {
        displayName: 'Alice Musician',
        avatarUrl: 'https://example.com/alice.jpg',
        chatRetentionPreference: 'PERSISTENT_HISTORY',
      });

      // User B initially has no profile
      expect(await repo.load(userB)).toBeNull();

      // Save distinct profile for User B
      await repo.save(userB, {
        displayName: 'Bob Listener',
        avatarUrl: null,
        chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY',
      });

      // Verify User A profile is intact and isolated from User B
      const alice = await repo.load(userA);
      expect(alice?.displayName).toBe('Alice Musician');
      expect(alice?.avatarUrl).toBe('https://example.com/alice.jpg');
      expect(alice?.chatRetentionPreference).toBe('PERSISTENT_HISTORY');

      const bob = await repo.load(userB);
      expect(bob?.displayName).toBe('Bob Listener');
      expect(bob?.avatarUrl).toBeNull();
      expect(bob?.chatRetentionPreference).toBe('EPHEMERAL_SESSION_ONLY');
    });

    it('supports replacing and removing profile photos', async () => {
      const storage = new MemoryStorage();
      const repo = new LocalProfileRepository(storage);
      const userId = '10000000-0000-4000-8000-000000000001';

      // Initial photo
      await repo.save(userId, { avatarUrl: 'https://example.com/photo1.jpg' });
      expect((await repo.load(userId))?.avatarUrl).toBe('https://example.com/photo1.jpg');

      // Replace photo
      await repo.save(userId, { avatarUrl: 'https://example.com/photo2.jpg' });
      expect((await repo.load(userId))?.avatarUrl).toBe('https://example.com/photo2.jpg');

      // Remove photo (sets avatarUrl to null)
      await repo.save(userId, { avatarUrl: null });
      expect((await repo.load(userId))?.avatarUrl).toBeNull();
    });

    it('rejects tampered or mismatched records on load', async () => {
      const storage = new MemoryStorage();
      const repo = new LocalProfileRepository(storage);
      const userA = 'user-a';
      const userB = 'user-b';

      // Manually store payload with mismatched userId in user-b's file
      await storage.write('aadat-profile-user-b.json', JSON.stringify({ userId: userA, displayName: 'Spoofed' }));

      // Loading userB must reject the spoofed record
      const loaded = await repo.load(userB);
      expect(loaded).toBeNull();
    });
  });

  describe('AuthService & AuthController Profile Integration', () => {
    it('restores local profile changes across app sessions and merges them with server user', async () => {
      const storage = new MemoryStorage();
      const profileRepo = new LocalProfileRepository(storage);

      const serverUser: AuthUser = {
        id: '10000000-0000-4000-8000-000000000001',
        email: 'user@example.test',
        displayName: 'Original Name',
        avatarUrl: null,
        chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY',
        createdAt: '2026-11-01T00:00:00Z',
      };

      // Pre-save local profile overrides (e.g. customized avatar and preference)
      await profileRepo.save(serverUser.id, {
        displayName: 'Updated Offline Name',
        avatarUrl: 'https://example.com/avatar.jpg',
        chatRetentionPreference: 'PERSISTENT_HISTORY',
      });

      const repo: IAuthRepository = {
        prepare: async () => {},
        login: async () => ({ accessToken: 'at-1', refreshToken: 'rt-1', expiresIn: 3600, user: serverUser }),
        refresh: async () => ({ accessToken: 'at-2', refreshToken: 'rt-2', expiresIn: 3600 }),
        me: async () => serverUser,
        logout: async () => {},
      };

      const sessions: ISessionRepository = {
        read: async () => ({ refreshToken: 'rt-1', userId: serverUser.id }),
        write: async () => {},
      };

      const google: IGoogleAuthProvider = {
        signIn: async () => 'id-token',
        signOut: async () => {},
      };

      const authService = new AuthService(repo, sessions, google, Date.now, () => {}, profileRepo);
      const controller = new AuthController(authService);

      await controller.restore();
      const snapshot = controller.getSnapshot();

      expect(snapshot.status).toBe('authenticated');
      expect(snapshot.user?.displayName).toBe('Updated Offline Name');
      expect(snapshot.user?.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(snapshot.user?.chatRetentionPreference).toBe('PERSISTENT_HISTORY');
    });

    it('synchronously updates active user in controller and notifies subscribers', async () => {
      const storage = new MemoryStorage();
      const profileRepo = new LocalProfileRepository(storage);

      const initialUser: AuthUser = {
        id: '10000000-0000-4000-8000-000000000001',
        email: 'user@example.test',
        displayName: 'Initial User',
        avatarUrl: null,
        chatRetentionPreference: 'EPHEMERAL_SESSION_ONLY',
        createdAt: '2026-11-01T00:00:00Z',
      };

      const repo: IAuthRepository = {
        login: async () => ({ accessToken: 'at-1', refreshToken: 'rt-1', expiresIn: 3600, user: initialUser }),
        refresh: async () => ({ accessToken: 'at-2', refreshToken: 'rt-2', expiresIn: 3600 }),
        me: async () => initialUser,
        logout: async () => {},
      };

      const sessions: ISessionRepository = {
        read: async () => ({ refreshToken: 'rt-1', userId: initialUser.id }),
        write: async () => {},
      };

      const google: IGoogleAuthProvider = { signIn: async () => 'token', signOut: async () => {} };
      const service = new AuthService(repo, sessions, google, Date.now, () => {}, profileRepo);
      const controller = new AuthController(service);

      await controller.restore();

      const listener = vi.fn();
      const unsubscribe = controller.subscribe(listener);

      // Perform live update
      await controller.updateUser({
        displayName: 'Renamed Listener',
        avatarUrl: 'https://example.com/new-avatar.png',
        chatRetentionPreference: 'PERSISTENT_HISTORY',
      });

      expect(listener).toHaveBeenCalled();
      const snapshot = controller.getSnapshot();
      expect(snapshot.user?.displayName).toBe('Renamed Listener');
      expect(snapshot.user?.avatarUrl).toBe('https://example.com/new-avatar.png');
      expect(snapshot.user?.chatRetentionPreference).toBe('PERSISTENT_HISTORY');

      // Check persisted in storage
      const saved = await profileRepo.load(initialUser.id);
      expect(saved?.displayName).toBe('Renamed Listener');
      expect(saved?.avatarUrl).toBe('https://example.com/new-avatar.png');

      unsubscribe();
    });
  });
});
