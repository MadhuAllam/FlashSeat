# FlashSeat

High-concurrency event ticketing & flash-sale engine. Zero double-booking under 5,000+ concurrent users.

> **Status: Phase 2 of 6 — foundation.** Concurrency engine (Phase 3), BullMQ pipelines (Phase 4),
> k6 load test (Phase 5) and the full write-up (Phase 6) land in later phases.

**Stack:** Node 22 · TypeScript (strict) · Fastify 5 · PostgreSQL 16 + Prisma 6 · Redis 7 (ioredis) · BullMQ · k6 · Docker

## Quick start

### A) Everything in Docker

```bash
docker compose up -d --build                       # postgres, redis, migrate (one-shot), app, worker
docker compose --profile tools run --rm seed       # venue, 2 events, 100 users
curl localhost:3000/health/ready
curl localhost:3000/api/v1/events/00000000-0000-4000-8000-00000000e001
```

### B) Local dev (hot reload) with only the datastores in Docker

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npx prisma migrate deploy && npm run db:seed
npm run dev            # API on :3000
npm run dev:worker     # worker (second terminal)
npm run token -- user1@flashseat.test      # mint a JWT for manual testing
```

Useful: `npm run typecheck` · `npm test` · `npm run build`

## Layout

```
prisma/
  schema.prisma                 # source of truth for tables & enums
  migrations/
    *_init/                     # tables, FKs, ordinary indexes
    *_constraints_and_partial_indexes/   # CHECKs + partial/unique-partial indexes (Prisma can't express these)
  seed.ts                       # idempotent; fixed UUIDs for load tests; --reset wipes bookings
src/
  config/env.ts                 # zod-validated env, fail-fast at boot
  infra/                        # prisma, redis (3 connection kinds), logger, graceful shutdown
  shared/                       # AppError hierarchy, redisKeys (single source of truth), utils
  plugins/                      # auth (JWT), error handler (one JSON envelope), health probes
  middleware/                   # (Phase 3/4) rate limiter, idempotency
  modules/
    events/                     # reference vertical slice: controller → service → repository
    holds/ bookings/ payments/  # (Phase 3) the concurrency engine
  queues/ workers/              # (Phase 4) BullMQ
  app.ts  server.ts  worker.ts  # app factory / API entrypoint / worker entrypoint
tests/unit/
scripts/dev-token.ts
```

**Layering rule:** controllers parse input and call one service method. Services hold business rules
and throw `AppError`s. Repositories are the only code that touches Prisma. Redis keys are only ever
built through `shared/redisKeys.ts`.

## Design decisions worth knowing

| Decision | Why |
|---|---|
| Redis = fast gate, Postgres = truth | Losers are rejected in ~1 ms without touching the DB; if Redis is wiped the DB still cannot double-book. |
| `{ev:<id>}` hash tag on all event keys | Multi-key Lua scripts require one hash slot on Redis Cluster. Covered by a unit test. |
| 3 Redis connection kinds | BullMQ needs `maxRetriesPerRequest: null`; subscribers can't run commands; the main client fails fast (503s, not hung requests). |
| `noeviction` on Redis | An evicted lock or job is a lost lock or job. BullMQ also requires it. |
| `/health/live` vs `/health/ready` | A Redis blip must remove the node from the LB, not restart it. |
| API and worker are separate processes | PDF work can never steal event-loop time from the booking path. |
| Own access log, `disableRequestLogging` | Fastify's default is 2 log lines/request — real overhead at thousands of RPS. |
| Cache is best-effort | Event metadata cache failure degrades to a DB read, never an error. |

## Database notes

- Pool size is set via `DATABASE_URL` (`connection_limit`, `pool_timeout`). Keep
  `(API + worker replicas) × connection_limit < max_connections`; use PgBouncer beyond a few replicas.
- `uq_booking_items_confirmed_seat` (partial unique index) is the last line of defence against
  double-booking — a second confirmation of the same seat fails with `23505` even if every other layer is bypassed.
- Emails are lower-cased by the application (plain `TEXT UNIQUE`, not `CITEXT`) to avoid a Prisma preview feature.

## Verify the hand-written migrations match `schema.prisma`

The migrations were written by hand. To prove there is no drift on your machine (exit code 0 = in sync):

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://flashseat:flashseat@localhost:5432/shadow" \
  --exit-code
```

If it reports drift, regenerate the init migration with
`npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` and keep the
second (constraints) migration as-is.

## Known caveats

- Prisma is pinned to 6.x. `package.json#prisma` (seed config) prints a deprecation warning; migrate it to
  `prisma.config.ts` when upgrading to Prisma 7. `npm audit` reports 3 *high* findings in Prisma's CLI config
  loader (build-time only, never on the request path); the fix is the Prisma 7 major.
- The seed credentials and compose defaults for `JWT_SECRET` / `PAYMENT_WEBHOOK_SECRET` are for local use only.
