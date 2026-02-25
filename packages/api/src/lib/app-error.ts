/**
 * Standardized application error class.
 *
 * All API error responses follow the shape:
 * {
 *   error: {
 *     code: string;       // machine-readable error code (e.g. 'AUTH_TOKEN_EXPIRED')
 *     message: string;    // human-readable message
 *     statusCode: number; // HTTP status code
 *     details?: unknown;  // optional extra context
 *   }
 * }
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }

  // ── Common factory methods ──────────────────────────────

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(409, code, message);
  }

  static tooManyRequests(message = 'Too many requests', code = 'RATE_LIMITED') {
    return new AppError(429, code, message);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
    return new AppError(500, code, message);
  }

  static insufficientCredits(balance: number) {
    return new AppError(402, 'INSUFFICIENT_CREDITS', 'Insufficient credits', { balance });
  }

  static paymentRequired(message = 'Payment required', code = 'PAYMENT_REQUIRED') {
    return new AppError(402, code, message);
  }
}
