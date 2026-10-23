-- Hand-written: things Prisma's schema language cannot express.
-- Prisma ignores partial indexes and CHECK constraints when diffing, so these
-- do not cause drift on the next `prisma migrate dev`.

-- ── CHECK constraints: domain invariants enforced by the database itself ──
ALTER TABLE "seats"
  ADD CONSTRAINT "ck_seats_seat_number_positive" CHECK ("seat_number" > 0);

ALTER TABLE "events"
  ADD CONSTRAINT "ck_events_sale_window" CHECK ("sale_ends_at" > "sale_starts_at");

ALTER TABLE "event_seats"
  ADD CONSTRAINT "ck_event_seats_price_non_negative" CHECK ("price_cents" >= 0);

ALTER TABLE "bookings"
  ADD CONSTRAINT "ck_bookings_total_non_negative" CHECK ("total_cents" >= 0);

ALTER TABLE "booking_items"
  ADD CONSTRAINT "ck_booking_items_price_non_negative" CHECK ("price_cents" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "ck_payments_amount_non_negative" CHECK ("amount_cents" >= 0);

-- ── Partial indexes ──

-- ★ THE double-booking guard. At most ONE confirmed booking item per seat, ever.
--   Even if Redis loses every lock and the application has a bug, a second
--   confirmation for the same seat fails here with a unique violation (23505).
CREATE UNIQUE INDEX "uq_booking_items_confirmed_seat"
  ON "booking_items"("event_seat_id")
  WHERE "confirmed";

-- Tiny hot index: "which seats are still sellable for this event?"
-- Shrinks as the event sells out, so it stays cache-resident.
CREATE INDEX "idx_event_seats_available"
  ON "event_seats"("event_id")
  WHERE "status" = 'AVAILABLE';

-- Reconciler scan: PENDING bookings whose hold has expired.
CREATE INDEX "idx_bookings_pending_expiry"
  ON "bookings"("hold_expires_at")
  WHERE "status" = 'PENDING_PAYMENT';

-- Outbox poller: only unpublished rows are indexed.
CREATE INDEX "idx_outbox_unpublished"
  ON "outbox_events"("id")
  WHERE "published_at" IS NULL;
