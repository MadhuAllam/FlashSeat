import { env } from './config/env';
import { logger } from './infra/logger';
import { registerGracefulShutdown } from './infra/lifecycle';
import { prisma } from './infra/prisma';
import { createBullConnection, redis } from './infra/redis';

/**
 * Background worker process — deliberately separate from the API so heavy jobs
 * (PDF rendering) can never steal event-loop time from the booking hot path,
 * and so each can be scaled independently.
 *
 * Phase 4 adds: ticket-pdf / notifications processors, the outbox poller,
 * and the hold reconciler (repeatable job).
 */
async function main(): Promise<void> {
  const bullConnection = createBullConnection('worker');
  await bullConnection.ping();

  registerGracefulShutdown(
    [
      // Phase 4: worker.close() goes first so in-flight jobs finish before connections drop.
      { name: 'bullmq-connection', close: () => bullConnection.quit() },
      { name: 'redis', close: () => redis.quit() },
      { name: 'postgres', close: () => prisma.$disconnect() },
    ],
    env.SHUTDOWN_TIMEOUT_MS,
  );

  logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'FlashSeat worker ready (processors arrive in Phase 4)');
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start worker');
  process.exit(1);
});
