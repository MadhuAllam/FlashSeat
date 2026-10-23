import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../infra/prisma';
import { redis } from '../../infra/redis';
import { buildEventsRoutes } from './events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

/** Module composition root: wires repository → service → controller. */
export const eventsModule: FastifyPluginAsync = async (app) => {
  const service = new EventsService(new EventsRepository(prisma), redis);
  await app.register(buildEventsRoutes(service));
};
