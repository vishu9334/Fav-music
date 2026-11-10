import mercurius, { MercuriusOptions } from 'mercurius';
import { DomainError } from '../errors/domain.error.js';

/** Preserve established HTTP statuses without serializing internal errors/tokens. */
export class GraphQLErrorFormatter {
  public static readonly format: NonNullable<MercuriusOptions['errorFormatter']> = (execution, context) => {
    const formatted = mercurius.defaultErrorFormatter(execution, context);
    return {
      statusCode: formatted.statusCode,
      response: {
        data: execution.data ?? null,
        errors: execution.errors.map((error) => {
          const original = error.originalError;
          return {
            message: original instanceof DomainError ? original.message : 'Invalid or unavailable GraphQL request',
            extensions: { code: original instanceof DomainError ? original.code : 'GRAPHQL_ERROR' },
          };
        }),
      },
    };
  };
}
