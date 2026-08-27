import { ERROR_CODES, type ErrorCode } from '@pet/shared';

/** Every error the API returns deliberately is an AppError. Anything else is a bug. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static unauthenticated(message = 'Sign in to continue.') {
    return new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);
  }
  static tokenExpired(message = 'Your session expired. Signing you back in.') {
    return new AppError(401, ERROR_CODES.TOKEN_EXPIRED, message);
  }
  static forbidden(message = 'You do not have access to this.') {
    return new AppError(403, ERROR_CODES.FORBIDDEN, message);
  }
  static notFound(message = 'Not found.') {
    return new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
  static validation(details: unknown, message = 'Some fields need fixing.') {
    return new AppError(400, ERROR_CODES.VALIDATION_FAILED, message, details);
  }
  static internal(message = 'Something went wrong on our side.') {
    return new AppError(500, ERROR_CODES.INTERNAL, message);
  }
}
