import { describe, expect, it } from 'vitest';
import { keys } from '../../src/shared/redisKeys';

const hashTag = (key: string) => /\{([^}]+)\}/.exec(key)?.[1];

describe('redis key design', () => {
  const eventId = 'evt-123';

  it('puts every event-scoped key in the same cluster hash slot', () => {
    const eventScoped = [
      keys.seatLock(eventId, 's1'),
      keys.seatLock(eventId, 's2'),
      keys.hold(eventId, 'h1'),
      keys.userHold(eventId, 'u1'),
      keys.soldSet(eventId),
      keys.heldZset(eventId),
    ];
    const tags = new Set(eventScoped.map(hashTag));
    expect(tags.size).toBe(1);
    expect([...tags][0]).toBe(`ev:${eventId}`);
  });

  it('isolates different events into different hash tags', () => {
    expect(hashTag(keys.seatLock('A', 's'))).not.toBe(hashTag(keys.seatLock('B', 's')));
  });

  it('keeps high-cardinality cross-cutting keys untagged so they spread across the cluster', () => {
    expect(hashTag(keys.idempotency('u1', 'k1'))).toBeUndefined();
    expect(hashTag(keys.rateLimit('ip', '1.2.3.4'))).toBeUndefined();
  });

  it('scopes idempotency keys per user (no cross-user replay)', () => {
    expect(keys.idempotency('u1', 'k')).not.toBe(keys.idempotency('u2', 'k'));
  });
});
