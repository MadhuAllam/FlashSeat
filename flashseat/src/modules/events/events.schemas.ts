import { z } from 'zod';

export const eventParamsSchema = z.object({
  eventId: z.string().uuid(),
});

export interface EventDto {
  id: string;
  title: string;
  status: 'DRAFT' | 'ON_SALE' | 'SOLD_OUT' | 'CANCELLED' | 'COMPLETED';
  startsAt: string;
  saleStartsAt: string;
  saleEndsAt: string;
  venue: { id: string; name: string; city: string; address: string | null };
}
