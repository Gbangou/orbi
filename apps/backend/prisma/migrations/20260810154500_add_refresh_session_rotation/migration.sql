ALTER TABLE "user_sessions"
  ADD COLUMN "refresh_token_hash" TEXT,
  ADD COLUMN "refresh_token_expires_at" TIMESTAMP(3),
  ADD COLUMN "refresh_revoked_at" TIMESTAMP(3),
  ADD COLUMN "refresh_reused_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key"
  ON "user_sessions"("refresh_token_hash");

CREATE INDEX "user_sessions_user_id_refresh_revoked_at_refresh_token_expires_at_idx"
  ON "user_sessions"("user_id", "refresh_revoked_at", "refresh_token_expires_at");
