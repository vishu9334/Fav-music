import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatRetentionPreference } from '@aadat/contracts';
import { AuthService } from '../services/auth.service.js';
import { IUserRepository, IUserEntity } from '../contracts/user-repository.contract.js';
import {
  IGoogleTokenVerifier,
  IJwtTokenService,
  ISessionService,
} from '../contracts/auth-service.contract.js';
import {
  ConflictError,
  UnauthorizedError,
} from '../../../shared/errors/domain.error.js';

describe('AuthService (Authentication Policies & Anti-Takeover Security)', () => {
  let mockUserRepository: IUserRepository;
  let mockVerifier: IGoogleTokenVerifier;
  let mockJwtService: IJwtTokenService;
  let mockSessionService: ISessionService;
  let authService: AuthService;

  const mockUser: IUserEntity = {
    status: 'ACTIVE',
    id: 'user-uuid-1',
    email: 'listener@aadat.music',
    displayName: 'Aadat Listener',
    avatarKey: null,
    googleSub: 'google-sub-12345',
    chatRetentionPreference: ChatRetentionPreference.EPHEMERAL_SESSION_ONLY,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockUserRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByGoogleSub: vi.fn(),
      create: vi.fn(),
      updateChatRetentionPreference: vi.fn(),
      updateAvatarKey: vi.fn(),
    };

    mockVerifier = {
      verifyIdToken: vi.fn(),
    };

    mockJwtService = {
      signAccessToken: vi.fn().mockResolvedValue('signed-jwt-access-token'),
      verifyAccessToken: vi.fn(),
    };

    mockSessionService = {
      createSession: vi.fn().mockResolvedValue({
        rawRefreshToken: 'mock-raw-refresh-token',
        familyId: 'mock-family-uuid',
        sessionId: 'mock-session-uuid',
      }),
      rotateRefreshToken: vi.fn(),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeSessionById: vi.fn().mockResolvedValue(undefined),
      revokeFamily: vi.fn().mockResolvedValue(undefined),
      isSessionActive: vi.fn().mockResolvedValue(true),
    };

    authService = new AuthService({
      enabled: true,
      userRepository: mockUserRepository,
      tokenVerifier: mockVerifier,
      jwtTokenService: mockJwtService,
      sessionService: mockSessionService,
      tokenExpirationSeconds: 900,
    });
  });

  describe('loginWithGoogle', () => {
    it('fails closed by default before verifier, repository or session operations', async () => {
      const held = new AuthService({ userRepository: mockUserRepository, tokenVerifier: mockVerifier, jwtTokenService: mockJwtService, sessionService: mockSessionService });
      await expect(held.loginWithGoogle('private-token')).rejects.toMatchObject({ code: 'AUTH_ON_HOLD' });
      await expect(held.refreshSession('private-refresh')).rejects.toMatchObject({ code: 'AUTH_ON_HOLD' });
      await expect(held.logout('private-refresh')).rejects.toMatchObject({ code: 'AUTH_ON_HOLD' });
      await expect(held.getCurrentUser('u')).rejects.toMatchObject({ code: 'AUTH_ON_HOLD' });
      expect(mockVerifier.verifyIdToken).not.toHaveBeenCalled(); expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockSessionService.createSession).not.toHaveBeenCalled(); expect(mockSessionService.rotateRefreshToken).not.toHaveBeenCalled(); expect(mockSessionService.revokeSession).not.toHaveBeenCalled();
    });
    it('creates a new user when neither googleSub nor email matches an existing account', async () => {
      vi.mocked(mockVerifier.verifyIdToken).mockResolvedValue({
        sub: 'new-google-sub-999',
        email: 'newuser@gmail.com',
        emailVerified: true,
        name: 'New User',
      });

      vi.mocked(mockUserRepository.findByGoogleSub).mockResolvedValue(null);
      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(mockUserRepository.create).mockResolvedValue({
        ...mockUser,
        id: 'new-user-uuid',
        email: 'newuser@gmail.com',
        displayName: 'New User',
        googleSub: 'new-google-sub-999',
      });

      const result = await authService.loginWithGoogle('valid-google-id-token');

      expect(mockUserRepository.create).toHaveBeenCalledWith({
        email: 'newuser@gmail.com',
        displayName: 'New User',
        googleSub: 'new-google-sub-999',
        avatarKey: null,
      });
      expect(result.accessToken).toBe('signed-jwt-access-token');
      expect(result.refreshToken).toBe('mock-raw-refresh-token');
      expect(result.user.id).toBe('new-user-uuid');
    });

    it('authenticates an existing user when googleSub matches', async () => {
      vi.mocked(mockVerifier.verifyIdToken).mockResolvedValue({
        sub: 'google-sub-12345',
        email: 'listener@aadat.music',
        emailVerified: true,
      });

      vi.mocked(mockUserRepository.findByGoogleSub).mockResolvedValue(mockUser);

      const result = await authService.loginWithGoogle('valid-google-id-token');

      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(result.user.id).toBe(mockUser.id);
      expect(result.accessToken).toBe('signed-jwt-access-token');
      expect(result.refreshToken).toBe('mock-raw-refresh-token');
    });

    it('ANTI-ACCOUNT-TAKEOVER: rejects with ConflictError (409) if email exists with different or missing googleSub', async () => {
      vi.mocked(mockVerifier.verifyIdToken).mockResolvedValue({
        sub: 'attacker-or-new-sub-999',
        email: 'listener@aadat.music',
        emailVerified: true,
      });

      // User not found with this googleSub
      vi.mocked(mockUserRepository.findByGoogleSub).mockResolvedValue(null);
      // But email already exists in DB!
      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(mockUser);

      await expect(authService.loginWithGoogle('google-id-token')).rejects.toThrow(ConflictError);
      await expect(authService.loginWithGoogle('google-id-token')).rejects.toThrow(
        /Automatic linking is prohibited for security reasons/i
      );

      // Verify no user was created or linked
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    it('rejects authentication with UnauthorizedError if Google email is not verified', async () => {
      vi.mocked(mockVerifier.verifyIdToken).mockResolvedValue({
        sub: 'google-sub-unverified',
        email: 'unverified@gmail.com',
        emailVerified: false,
      });

      await expect(authService.loginWithGoogle('unverified-id-token')).rejects.toThrow(
        UnauthorizedError
      );
      await expect(authService.loginWithGoogle('unverified-id-token')).rejects.toThrow(
        /email is not verified/i
      );

      expect(mockUserRepository.findByGoogleSub).not.toHaveBeenCalled();
    });
  });

  describe('refreshSession', () => {
    it('rotates refresh token and issues newly minted access token', async () => {
      vi.mocked(mockSessionService.rotateRefreshToken).mockResolvedValue({
        rawRefreshToken: 'new-rotated-raw-refresh-token',
        familyId: 'family-1',
        sessionId: 'new-session-2',
        userId: mockUser.id,
      });

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockJwtService.signAccessToken).mockResolvedValue('new-signed-jwt');

      const result = await authService.refreshSession('old-refresh-token');

      expect(result.accessToken).toBe('new-signed-jwt');
      expect(result.refreshToken).toBe('new-rotated-raw-refresh-token');
      expect(result.expiresIn).toBe(900);
      expect(mockJwtService.signAccessToken).toHaveBeenCalledWith({
        userId: mockUser.id,
        email: mockUser.email,
        sessionId: 'new-session-2',
      });
    });

    it('rejects refresh when user associated with session no longer exists', async () => {
      vi.mocked(mockSessionService.rotateRefreshToken).mockResolvedValue({
        rawRefreshToken: 'new-rotated-raw-refresh-token',
        familyId: 'family-1',
        sessionId: 'new-session-2',
        userId: 'deleted-user-uuid',
      });

      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      await expect(authService.refreshSession('old-refresh-token')).rejects.toThrow(
        UnauthorizedError
      );
      expect(mockSessionService.revokeSessionById).toHaveBeenCalledWith('new-session-2');
    });
  });

  describe('logout', () => {
    it('revokes both refresh token and session ID when provided', async () => {
      await authService.logout('raw-refresh-token-xyz', 'session-uuid-123');

      expect(mockSessionService.revokeSession).toHaveBeenCalledWith('raw-refresh-token-xyz');
      expect(mockSessionService.revokeSessionById).toHaveBeenCalledWith('session-uuid-123');
    });
  });

  describe('getCurrentUser', () => {
    it('returns existing user when authenticated userId exists in persistence', async () => {
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);

      const user = await authService.getCurrentUser(mockUser.id);
      expect(user.id).toBe(mockUser.id);
      expect(user.email).toBe(mockUser.email);
    });

    it('throws UnauthorizedError when authenticated user cannot be found', async () => {
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      await expect(authService.getCurrentUser('non-existent-user')).rejects.toThrow(
        UnauthorizedError
      );
    });
  });
});

