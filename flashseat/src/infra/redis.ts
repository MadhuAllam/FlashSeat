import Redis, { type RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

const base: RedisOptions = {
  enableReadyCheck: true,
  connectTimeout: 5_000,
  // Exponential-ish backoff capped at 2s: reconnect fast, but never hammer a failing node.
  retryStrategy: (attempt) => Math.min(attempt * 100, 2_000),
};

function attachLogging<T extends Redis>(client: T, name: string): T {
  // Without an 'error' listener ioredis emits an unhandled 'error' event and crashes the process.
  client.on('error', (err) => logger.error({ err, redis: name }, 'redis error'));
  client.on('reconnecting', (ms: number) => logger.warn({ redis: name, ms }, 'redis reconnecting'));
  client.on('ready', () => logger.info({ redis: name }, 'redis ready'));
  return client;
}

/** General-purpose command connection (locks, idempotency, rate limiting, cache). */
export const redis = attachLogging(
  new Redis(env.REDIS_URL, {
    ...base,
    // Fail a command after 2 reconnect attempts instead of queueing forever:
    // under a Redis outage we want fast 503s, not a pile-up of hung requests.
    maxRetriesPerRequest: 2,
  }),
  'main',
);

/**
 * BullMQ requires `maxRetriesPerRequest: null` (blocking commands must wait for reconnects)
 * and each Queue/Worker should own its connection. Hence a factory, not a singleton.
 */
export function createBullConnection(name = 'bullmq'): Redis {
  return attachLogging(new Redis(env.REDIS_URL, { ...base, maxRetriesPerRequest: null }), name);
}

/** A connection in subscriber mode cannot run normal commands, so pub/sub gets its own. */
export function createSubscriber(name = 'subscriber'): Redis {
  return attachLogging(new Redis(env.REDIS_URL, { ...base, maxRetriesPerRequest: null }), name);
}
