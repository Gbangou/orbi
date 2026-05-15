CREATE TABLE IF NOT EXISTS mobilis_rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS mobilis_rate_limit_counters_reset_at_idx
  ON mobilis_rate_limit_counters (reset_at);
