/**
 * Idempotent seed.
 *
 *   npm run db:seed                       # 100 users
 *   SEED_USERS=5000 npm run db:seed       # load-test scale
 *   npm run db:seed -- --reset            # also wipe bookings + free every seat
 *
 * Fixed UUIDs let the k6 script (Phase 5) hard-code the target event.
 *   FLASH_EVENT_ID : 50 seats  — the contention target ("same 50 seats, 5,000 users")
 *   FULL_EVENT_ID  : 100 seats — general demo event
 *
 * Standalone on purpose (own PrismaClient, plain process.env) so it runs
 * without the API's full environment validation.
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();

const VENUE_ID = '00000000-0000-4000-8000-00000000a001';
const FLASH_EVENT_ID = '00000000-0000-4000-8000-00000000e001';
const FULL_EVENT_ID = '00000000-0000-4000-8000-00000000e002';

const SECTIONS = ['A', 'B'] as const;
const ROWS = ['1', '2', '3', '4', '5'] as const;
const SEATS_PER_ROW = 10;

const USER_COUNT = Number(process.env.SEED_USERS ?? 100);
const DEMO_PASSWORD = 'Passw0rd!';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** One hash reused for every seeded user: hashing 5,000 passwords would take minutes. */
function demoPasswordHash(): string {
  const salt = randomBytes(16);
  const hash = scryptSync(DEMO_PASSWORD, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function seedVenueAndSeats(): Promise<void> {
  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: {},
    create: { id: VENUE_ID, name: 'FlashSeat Arena', city: 'Hyderabad', address: 'HITEC City' },
  });

  const seats = SECTIONS.flatMap((section) =>
    ROWS.flatMap((rowLabel) =>
      Array.from({ length: SEATS_PER_ROW }, (_, i) => ({
        venueId: VENUE_ID,
        section,
        rowLabel,
        seatNumber: i + 1,
      })),
    ),
  );
  await prisma.seat.createMany({ data: seats, skipDuplicates: true });
}

async function seedEvent(opts: {
  id: string;
  title: string;
  sections: readonly string[];
  priceCents: number;
}): Promise<void> {
  const now = Date.now();
  const window = {
    startsAt: new Date(now + 30 * DAY),
    saleStartsAt: new Date(now - HOUR), // already on sale, so load tests can start immediately
    saleEndsAt: new Date(now + 7 * DAY),
    status: 'ON_SALE' as const,
  };

  await prisma.event.upsert({
    where: { id: opts.id },
    update: window, // re-running the seed re-opens the sale window
    create: { id: opts.id, venueId: VENUE_ID, title: opts.title, ...window },
  });

  const seats = await prisma.seat.findMany({
    where: { venueId: VENUE_ID, section: { in: [...opts.sections] } },
    select: { id: true },
  });

  await prisma.eventSeat.createMany({
    data: seats.map((s) => ({
      eventId: opts.id,
      seatId: s.id,
      priceCents: opts.priceCents, // flat per-seat price, in paise
      currency: 'INR',
    })),
    skipDuplicates: true,
  });
}

async function seedUsers(): Promise<void> {
  const passwordHash = demoPasswordHash();
  const rows = Array.from({ length: USER_COUNT }, (_, i) => ({
    email: `user${i + 1}@flashseat.test`,
    name: `Test User ${i + 1}`,
    passwordHash,
  }));
  for (const batch of chunk(rows, 1_000)) {
    await prisma.user.createMany({ data: batch, skipDuplicates: true });
  }
}

/** Wipe all booking state and free every seat. Pair with a Redis flush (Phase 5 reset script). */
async function resetInventory(): Promise<void> {
  await prisma.$transaction([
    prisma.payment.deleteMany(),
    prisma.booking.deleteMany(), // booking_items cascade
    prisma.outboxEvent.deleteMany(),
    prisma.eventSeat.updateMany({ data: { status: 'AVAILABLE', version: 0 } }),
    prisma.event.updateMany({ data: { status: 'ON_SALE' } }),
  ]);
  console.log('reset: bookings, payments, outbox cleared; all seats AVAILABLE');
}

async function main(): Promise<void> {
  if (process.argv.includes('--reset')) await resetInventory();

  await seedVenueAndSeats();
  await seedEvent({
    id: FLASH_EVENT_ID,
    title: 'FlashSeat Live — Flash Sale (50 seats)',
    sections: ['A'],
    priceCents: 150_000, // ₹1,500
  });
  await seedEvent({
    id: FULL_EVENT_ID,
    title: 'FlashSeat Live — Full House (100 seats)',
    sections: SECTIONS,
    priceCents: 250_000, // ₹2,500
  });
  await seedUsers();

  const [events, eventSeats, users] = await Promise.all([
    prisma.event.count(),
    prisma.eventSeat.count(),
    prisma.user.count(),
  ]);
  console.log(`seeded: ${events} events, ${eventSeats} event seats, ${users} users`);
  console.log(`flash event : ${FLASH_EVENT_ID}`);
  console.log(`login       : user1@flashseat.test / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
