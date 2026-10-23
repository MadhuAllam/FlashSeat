import { logger } from './logger';

export interface Closer {
  name: string;
  close: () => Promise<unknown>;
}

/**
 * Graceful shutdown. Closers run SEQUENTIALLY in the order given, so list them
 * outermost-first: HTTP server (stop accepting + drain) → queues → Redis → Postgres.
 * A hard timeout guarantees the process cannot hang a rolling deploy.
 */
export function registerGracefulShutdown(closers: Closer[], timeoutMs: number): void {
  let shuttingDown = false;

  const shutdown = async (reason: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'shutdown initiated');

    setTimeout(() => {
      logger.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs).unref();

    let failed = false;
    for (const closer of closers) {
      try {
        await closer.close();
        logger.info(`closed: ${closer.name}`);
      } catch (err) {
        failed = true;
        logger.error({ err }, `failed closing: ${closer.name}`);
      }
    }
    process.exit(failed ? 1 : exitCode);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'unhandledRejection');
    void shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    void shutdown('uncaughtException', 1);
  });
}
