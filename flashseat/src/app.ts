import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env } from './config/env';
import { logger } from './infra/logger';
import { eventsModule } from './modules/events';
import { registerAuth } from './plugins/auth';
import { registerErrorHandling } from './plugins/errorHandler';
import { healthRoutes } from './plugins/health';

export async function buildApp() {
  const app = Fastify({
    // pino's concrete Logger type is not assignable to the FastifyBaseLogger that plugins
    // are typed against; the cast keeps `FastifyInstance` usable across all modules.
    loggerInstance: logger as FastifyBaseLogger,
    // We emit our own compact access log (below) instead of Fastify's two lines per request.
    disableRequestLogging: true,
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    trustProxy: true, // correct client IP behind the LB (needed for per-IP rate limiting)
    bodyLimit: 64 * 1024,
    // Timeouts: keepAlive must exceed the load balancer's idle timeout to avoid 502s.
    keepAliveTimeout: 65_000,
    requestTimeout: 15_000,
    connectionTimeout: 10_000,
  });

  // ── Observability hooks ──
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    const level = reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'info' : 'debug';
    request.log[level](
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs: Math.round(reply.elapsedTime * 100) / 100,
      },
      'request completed',
    );
  });

  // ── Security & cross-cutting plugins ──
  await app.register(helmet);
  await app.register(cors, { origin: env.NODE_ENV === 'production' ? false : true });
  await registerAuth(app);
  registerErrorHandling(app);

  // Request pipeline order (filled in Phase 3):
  //   onRequest : rate limiter  → cheapest rejection first, before any auth/DB work
  //   preHandler: authenticate → idempotency → controller
  //   (see src/middleware/)

  // ── Routes ──
  await app.register(healthRoutes);
  await app.register(eventsModule, { prefix: '/api/v1' });

  return app;
}
