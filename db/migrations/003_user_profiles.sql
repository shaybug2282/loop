-- AI scheduling profiles built by the Haiku profiler (api/ai.js op:'build-profile').
-- Safe to re-run — all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- { user, tags[], hard_constraints[], soft_constraints[], inferred_rhythm }
  profile     JSONB NOT NULL DEFAULT '{}',
  -- The raw signals last fed to the profiler (kept for re-runs / debugging)
  raw_signals JSONB,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
