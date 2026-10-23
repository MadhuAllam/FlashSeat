import type { FastifyPluginAsync } from 'fastify';
import { eventParamsSchema } from './events.schemas';
import type { EventsService } from './events.service';

/** Controllers: parse + validate input, call ONE service method, return the DTO. No business logic. */
export const buildEventsRoutes =
  (service: EventsService): FastifyPluginAsync =>
  async (app) => {
    app.get('/events/:eventId', async (request) => {
      const { eventId } = eventParamsSchema.parse(request.params);
      return service.getEvent(eventId);
    });
  };
