import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),

  // Shared secret for HMAC verification of payment-gateway webhooks.
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),

  // ── Booking domain ──
  HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(480), // 8 minutes
  MAX_SEATS_PER_HOLD: z.coerce.number().int().min(1).max(10).default(6),

  // ── Idempotency ──
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86_400), // 24h
  IDEMPOTENCY_LOCK_SECONDS: z.coerce.number().int().positive().default(30), // IN_PROGRESS guard

  // ── Rate limiting (sliding window) ──
  RATE_LIMIT_ENABLED: bool,
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(10_000),
  RATE_LIMIT_MAX_PER_USER: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_MAX_PER_IP: z.coerce.number().int().positive().default(300),

  // ── Worker / lifecycle ──
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast at boot: a misconfigured instance must never start serving traffic.
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}

export const env: Env = load();
