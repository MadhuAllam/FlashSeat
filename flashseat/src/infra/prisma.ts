import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Connection pooling is configured through DATABASE_URL query params:
 *   ?connection_limit=20&pool_timeout=10
 *
 * Sizing rule:  (API replicas + worker replicas) * connection_limit  <  postgres max_connections.
 * Beyond a handful of replicas, put PgBouncer (transaction mode) in front and
 * add `pgbouncer=true` to the URL.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
