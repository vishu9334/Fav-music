/**
 * Base Domain Error following OOP hierarchy
 */
export abstract class DomainError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly code: string;

  public constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends DomainError {
  public readonly statusCode = 404;
  public readonly code = 'NOT_FOUND';
}

export class UnauthorizedError extends DomainError {
  public readonly statusCode = 401;
  public readonly code = 'UNAUTHORIZED';
}

export class ForbiddenError extends DomainError {
  public readonly statusCode = 403;
  public readonly code = 'FORBIDDEN';
}

export class ConflictError extends DomainError {
  public readonly statusCode = 409;
  public readonly code = 'CONFLICT';
}

export class ValidationFailedError extends DomainError {
  public readonly statusCode = 400;
  public readonly code = 'VALIDATION_FAILED';
}

export class PayloadTooLargeError extends DomainError {
  public readonly statusCode = 413;
  public readonly code = 'PAYLOAD_TOO_LARGE';
}

export class OperationNotImplementedError extends DomainError {
  public readonly statusCode = 501;
  public readonly code = 'NOT_IMPLEMENTED';
}


