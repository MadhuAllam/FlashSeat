import type { PrismaClient } from '@prisma/client';

/**
 * Repository layer: the ONLY place that talks to Prisma for this module.
 * Services depend on this class, so they can be unit-tested with a fake.
 */
export class EventsRepository {
  constructor(private readonly db: PrismaClient) {}

  findByIdWithVenue(id: string) {
    return this.db.event.findUnique({
      where: { id },
      include: { venue: true },
    });
  }
}

export type EventWithVenue = NonNullable<Awaited<ReturnType<EventsRepository['findByIdWithVenue']>>>;
