import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../infra/prisma';
import { redis } from '../infra/redis';
import { withTimeout } from '../shared/utils';

const PROBE_TIMEOUT_MS = 1_000;

/**
 * /health/live  — process is up. Orchestrator restarts the container if this fails.
 * /health/ready — dependencies reachable. Load balancer stops routing here if this fails.
 * Keeping them separate prevents a Redis blip from causing restart storms.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    const probe = async (label: string, run: () => PromiseLike<unknown>) => {
      const started = performance.now();
      try {
        await withTimeout(run(), PROBE_TIMEOUT_MS, label);
        return { status: 'up' as const, latencyMs: Math.round(performance.now() - started) };
      } catch {
        return { status: 'down' as const, latencyMs: Math.round(performance.now() - started) };
      }
    };

    const [postgres, redisCheck] = await Promise.all([
      probe('postgres', () => prisma.$queryRaw`SELECT 1`),
      probe('redis', () => redis.ping()),
    ]);

    const ready = postgres.status === 'up' && redisCheck.status === 'up';
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'degraded',
      checks: { postgres, redis: redisCheck },
    });
  });
};
