export interface IAuthenticatedUserContext {
  readonly userId: string;
  readonly email: string;
  readonly sessionId?: string;
  readonly role?: string;
}

/**
 * Authentication Guard Contract
 */
export interface IAuthGuard {
  validateToken(authorizationHeader: string | undefined): Promise<IAuthenticatedUserContext>;
}

