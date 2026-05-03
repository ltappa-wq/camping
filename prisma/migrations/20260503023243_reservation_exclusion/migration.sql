-- =============================================================================
-- Reservation overlap prevention (CRITICAL for booking integrity)
-- =============================================================================
-- Why: Application-level overlap checks have race conditions during concurrent
-- checkouts. A guest paying at the same moment as an operator creates a manual
-- booking can result in two CONFIRMED reservations on the same site for
-- overlapping dates. Postgres exclusion constraints prevent this at the DB
-- level — the second insert fails atomically.
--
-- The constraint uses a half-open daterange [checkIn, checkOut), which matches
-- standard hospitality convention: a reservation ending on a date does not
-- conflict with one starting on the same date (guest A leaves in the morning,
-- guest B arrives in the afternoon).
--
-- DRAFT and CANCELLED reservations are intentionally excluded — drafts are
-- abandoned carts and shouldn't lock inventory, cancellations are released.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"
ADD CONSTRAINT no_overlapping_active_reservations
EXCLUDE USING gist (
  "siteId" WITH =,
  daterange("checkIn", "checkOut", '[)') WITH &&
)
WHERE ("status" IN ('HELD', 'CONFIRMED', 'CHECKED_IN'));

-- Sanity check (run manually after constraint is added):
--
-- INSERT INTO "Reservation" (...) VALUES (..., 'site_x', '2026-06-01', '2026-06-05', 'CONFIRMED');
-- INSERT INTO "Reservation" (...) VALUES (..., 'site_x', '2026-06-03', '2026-06-07', 'CONFIRMED');
-- -- ↑ second insert should fail with: conflicting key value violates exclusion constraint
