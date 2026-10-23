import '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: verifies the Bearer JWT, populates `request.user`. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
