/**
 * Typed application errors. Services throw these; the global error handler
 * (plugins/errorHandler.ts) maps them to a stable JSON envelope:
 *   { error: { code, message, details?, requestId } }
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

/** 409 — e.g. one or more requested seats are already held or sold. */
export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(409, code, message, details);
  }
}

/** 422 — same Idempotency-Key reused with a different request body. */
export class IdempotencyMismatchError extends AppError {
  constructor() {
    super(422, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used with a different request');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(429, 'RATE_LIMITED', 'Too many requests', { retryAfterSeconds }, {
      'retry-after': String(retryAfterSeconds),
    });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(503, 'SERVICE_UNAVAILABLE', message);
  }
}
