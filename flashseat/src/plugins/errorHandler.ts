import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId: string };
}

const body = (code: string, message: string, requestId: string, details?: unknown): ErrorBody => ({
  error: { code, message, requestId, ...(details === undefined ? {} : { details }) },
});

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(body('NOT_FOUND', `Route ${request.method} ${request.url} not found`, request.id)),
  );

  app.setErrorHandler((error: unknown, request, reply) => {
    // 1. Domain errors thrown deliberately by services/middleware.
    if (error instanceof AppError) {
      const level = error.statusCode >= 500 ? 'error' : 'info';
      request.log[level]({ err: error, code: error.code }, error.message);
      if (error.headers) reply.headers(error.headers);
      return reply
        .status(error.statusCode)
        .send(body(error.code, error.message, request.id, error.details));
    }

    // 2. Input validation (zod .parse() inside controllers).
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send(body('VALIDATION_ERROR', 'Invalid request', request.id, error.flatten().fieldErrors));
    }

    // 3. Fastify's own 4xx (malformed JSON, payload too large, unsupported media type...).
    const fe = error as { statusCode?: number; code?: string; message?: string };
    if (typeof fe.statusCode === 'number' && fe.statusCode >= 400 && fe.statusCode < 500) {
      // Normalise framework-internal codes (FST_ERR_*) so clients never couple to Fastify.
      const code = fe.statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
      return reply.status(fe.statusCode).send(body(code, fe.message ?? 'Bad request', request.id));
    }

    // 4. Anything else is a bug: log everything, reveal nothing.
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send(body('INTERNAL_ERROR', 'Internal server error', request.id));
  });
}
