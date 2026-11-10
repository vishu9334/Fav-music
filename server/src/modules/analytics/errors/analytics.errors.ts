import { DomainError } from '../../../shared/errors/domain.error.js';

export class SessionNotFoundError extends DomainError {
  public readonly statusCode = 404;
  public readonly code = 'SESSION_NOT_FOUND';
}

export class SessionExpiredError extends DomainError {
  public readonly statusCode = 410;
  public readonly code = 'SESSION_EXPIRED';
}

export class InvalidSessionStateError extends DomainError {
  public readonly statusCode = 400;
  public readonly code = 'INVALID_SESSION_STATE';
}

export class UnauthorizedSessionAccessError extends DomainError {
  public readonly statusCode = 403;
  public readonly code = 'UNAUTHORIZED_SESSION_ACCESS';
}

export class TrackNotPlayableError extends DomainError {
  public readonly statusCode = 400;
  public readonly code = 'TRACK_NOT_PLAYABLE';
}

export class DuplicatePlaybackEventError extends DomainError {
  public readonly statusCode = 409;
  public readonly code = 'DUPLICATE_PLAYBACK_EVENT';
}

export class PlaybackIngestionError extends DomainError {
  public readonly statusCode = 500;
  public readonly code = 'PLAYBACK_INGESTION_ERROR';
}

export class MigrationRequiredError extends DomainError {
  public readonly statusCode = 503;
  public readonly code = 'MIGRATION_REQUIRED';
}

