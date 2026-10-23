/**
 * Single source of truth for every Redis key. Never build a key string inline.
 *
 * Hash tags: Redis Cluster hashes ONLY the substring inside {...}. Every key that
 * belongs to one event shares the tag `{ev:<eventId>}`, so they all land in the same
 * hash slot — a hard requirement for multi-key Lua scripts (hold/release) on a cluster.
 * Keys that never participate in a multi-key script (idempotency, rate limits) are
 * deliberately NOT tagged so they spread across the whole cluster.
 */
const ev = (eventId: string) => `{ev:${eventId}}`;

export const keys = {
  // ── Event-scoped (same slot, usable together in one Lua script) ──
  /** STRING = holdId, TTL = hold TTL. THE authoritative seat lock. */
  seatLock: (eventId: string, seatId: string) => `${ev(eventId)}:seat:${seatId}`,
  /** HASH {userId, seatIds, expiresAt, status}. */
  hold: (eventId: string, holdId: string) => `${ev(eventId)}:hold:${holdId}`,
  /** STRING = holdId. Enforces one active hold per user per event. */
  userHold: (eventId: string, userId: string) => `${ev(eventId)}:uhold:${userId}`,
  /** SET of seatIds already BOOKED in Postgres (warmed on boot, SADD on confirm). */
  soldSet: (eventId: string) => `${ev(eventId)}:sold`,
  /** ZSET member=seatId score=expiresAtMs. Read model for seat map + sweeper. */
  heldZset: (eventId: string) => `${ev(eventId)}:held_zset`,

  // ── Cache / pub-sub ──
  eventMetaCache: (eventId: string) => `cache:event:${eventId}:meta`,
  seatUpdatesChannel: (eventId: string) => `ch:ev:${eventId}:seats`,

  // ── Cross-cutting (intentionally untagged) ──
  idempotency: (userId: string, key: string) => `idem:${userId}:${key}`,
  rateLimit: (scope: 'ip' | 'user' | 'route', id: string) => `rl:${scope}:${id}`,
  webhookSeen: (webhookEventId: string) => `wh:${webhookEventId}`,
} as const;
