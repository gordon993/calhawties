-- D1 schema for optional anonymous match logging. Apply once per environment:
--   wrangler d1 execute <DB_NAME> --file=schema.sql --remote

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  winner_id TEXT NOT NULL,
  loser_id TEXT NOT NULL,
  round TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_winner ON matches(winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_loser ON matches(loser_id);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round);

-- Sliding-window rate limiting for the logging endpoint, per client IP.
CREATE TABLE IF NOT EXISTS rate_limit_events (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_ts ON rate_limit_events(ip, ts);
