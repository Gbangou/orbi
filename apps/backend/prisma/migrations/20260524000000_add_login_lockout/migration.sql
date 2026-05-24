-- Migration: add login lockout fields to users
-- Tracks consecutive failed login attempts and temporary account lockout.
-- After MAX_FAILED_ATTEMPTS (5) failures the account is locked for an
-- exponentially-growing window (15 min, 1 h, 24 h) to prevent brute-force
-- attacks even when requests come from multiple IP addresses.

ALTER TABLE "users"
  ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "locked_until"       TIMESTAMPTZ;
