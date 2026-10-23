import type { Redis } from 'ioredis';
import { logger } from '../../infra/logger';
import { NotFoundError } from '../../shared/errors';
import { keys } from '../../shared/redisKeys';
import type { EventDto } from './events.schemas';
import type { EventsRepository, EventWithVenue } from './events.repository';

const META_CACHE_TTL_SECONDS = 60;

const toDto = (e: EventWithVenue): EventDto => ({
  id: e.id,
  title: e.title,
  status: e.status,
  startsAt: e.startsAt.toISOString(),
  saleStartsAt: e.saleStartsAt.toISOString(),
  saleEndsAt: e.saleEndsAt.toISOString(),
  venue: { id: e.venue.id, name: e.venue.name, city: e.venue.city, address: e.venue.address },
});

export class EventsService {
  constructor(
    private readonly repo: EventsRepository,
    private readonly redis: Redis,
  ) {}

  /**
   * Cache-aside read of static event metadata.
   * The cache is strictly best-effort: a Redis failure degrades to a DB read
   * rather than failing the request (metadata is not on the correctness path).
   */
  async getEvent(eventId: string): Promise<EventDto> {
    const cacheKey = keys.eventMetaCache(eventId);

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as EventDto;
    } catch (err) {
      logger.warn({ err, eventId }, 'event meta cache read failed; falling back to db');
    }

    const event = await this.repo.findByIdWithVenue(eventId);
    if (!event) throw new NotFoundError('Event');

    const dto = toDto(event);
    this.redis
      .set(cacheKey, JSON.stringify(dto), 'EX', META_CACHE_TTL_SECONDS)
      .catch((err: unknown) => logger.warn({ err, eventId }, 'event meta cache write failed'));

    return dto;
  }
}
