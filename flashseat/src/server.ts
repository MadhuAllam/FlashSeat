import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './infra/logger';
import { registerGracefulShutdown } from './infra/lifecycle';
import { prisma } from './infra/prisma';
import { redis } from './infra/redis';

async function main(): Promise<void> {
  const app = await buildApp();

  // Order matters: stop accepting HTTP first, then release the backing services.
  registerGracefulShutdown(
    [
      { name: 'http-server', close: () => app.close() },
      { name: 'redis', close: () => redis.quit() },
      { name: 'postgres', close: () => prisma.$disconnect() },
    ],
    env.SHUTDOWN_TIMEOUT_MS,
  );

  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'FlashSeat API listening');
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start API');
  process.exit(1);
});
