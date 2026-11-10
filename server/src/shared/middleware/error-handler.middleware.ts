import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  DomainError,
  NotFoundError,
  ValidationFailedError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  PayloadTooLargeError,
  OperationNotImplementedError,
} from '../errors/domain.error.js';

export interface IStandardErrorResponse {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly details?: unknown;
  readonly timestamp: string;
}

/**
 * Centralized Application Error Handler Middleware
 * Adheres to OOP: encapsulates HTTP error mapping, preserves domain exception boundaries,
 * and guarantees zero credential/stack trace leakage.
 */
export class ErrorHandlerMiddleware {
  public static handle(
    error: FastifyError | Error | unknown,
    request: FastifyRequest,
    reply: FastifyReply
  ): void {
    const timestamp = new Date().toISOString();

    // 1. Domain Errors
    if (error instanceof DomainError) {
      if (error instanceof NotFoundError) {
        reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: error.message,
          timestamp,
        } satisfies IStandardErrorResponse);
        return;
      }

      if (error instanceof ValidationFailedError) {
        reply.status(400).send({
          statusCode: 400,
          error: 'Validation Failed',
          message: error.message,
          timestamp,
        } satisfies IStandardErrorResponse);
        return;
      }

      if (error instanceof UnauthorizedError) {
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: error.message,
          timestamp,
        } satisfies IStandardErrorResponse);
        return;
      }

      if (error instanceof ForbiddenError) {
        reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: error.message,
          timestamp,
        } satisfies IStandardErrorResponse);
        return;
      }

      if (error instanceof ConflictError) {
        reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: error.message,
          timestamp,
        } satisfies IStandardErrorResponse);
        return;
      }

      if (error instanceof PayloadTooLargeError) {
        reply.status(413).send({
          statusCode: 413,
          error: 'Payload Too Large',
          message: error.message,
          timestamp,
        } satisfies IStandardErrorResponse);
        return;
      }

      if (error instanceof OperationNotImplementedError) {
        reply.status(501).send({
          statusCode: 501,
          error: 'Not Implemented',
          message: error.message,
          timestamp,
        } satisfies IStandardErrorResponse);
        return;
      }
      if (error.statusCode === 503) {
        reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: error.message, timestamp } satisfies IStandardErrorResponse);
        return;
      }
    }

    // 2. Fastify Schema Validation Errors
    const fastifyError = error as FastifyError;
    if (fastifyError && fastifyError.validation) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Request schema validation failed',
        details: fastifyError.validation,
        timestamp,
      } satisfies IStandardErrorResponse);
      return;
    }

    // 3. Fastify Handled HTTP Errors (e.g., 404, 400, 429)
    if (fastifyError && typeof fastifyError.statusCode === 'number' && fastifyError.statusCode < 500) {
      let errorTitle =
        fastifyError.name && fastifyError.name !== 'Error'
          ? fastifyError.name
          : 'Client Error';
      if (fastifyError.statusCode === 429) {
        errorTitle = 'Too Many Requests';
      } else if (fastifyError.statusCode === 404) {
        errorTitle = 'Not Found';
      } else if (fastifyError.statusCode === 400) {
        errorTitle = 'Bad Request';
      }

      reply.status(fastifyError.statusCode).send({
        statusCode: fastifyError.statusCode,
        error: errorTitle,
        message: fastifyError.message,
        timestamp,
      } satisfies IStandardErrorResponse);
      return;
    }

    // 4. Unhandled Internal Server Errors (Do not expose raw stacks or database credentials)
    request.log.error(error);
    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected internal server error occurred',
      timestamp,
    } satisfies IStandardErrorResponse);
  }
}
