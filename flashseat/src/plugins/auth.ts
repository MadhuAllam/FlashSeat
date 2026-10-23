import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env';
import { UnauthorizedError } from '../shared/errors';

/**
 * Registered on the ROOT instance (not as an encapsulated plugin) so that
 * `app.authenticate` is visible to every route module.
 *
 * Usage:   app.post('/holds', { preHandler: app.authenticate }, handler)
 * Identity: request.user.sub is the userId.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate('authenticate', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      // Never leak why verification failed (expired vs malformed vs bad signature).
      throw new UnauthorizedError('Invalid or expired token');
    }
  });
}
