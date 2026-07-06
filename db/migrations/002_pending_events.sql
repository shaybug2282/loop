-- Shared event scheduling (api/schedule.js).
-- Safe to re-run — all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS pending_events (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id           UUID        REFERENCES users(id),
  invited_user_ids     UUID[]      NOT NULL DEFAULT '{}',
  event_time           TIMESTAMPTZ NOT NULL,
  duration_hours       FLOAT       NOT NULL DEFAULT 1,
  status               TEXT        NOT NULL DEFAULT 'pending',
  acceptances          UUID[]      NOT NULL DEFAULT '{}',
  declines             UUID[]      NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT now(),
  google_event_created BOOLEAN     DEFAULT false
);

-- Older deployments created the table before the declines column existed.
ALTER TABLE pending_events ADD COLUMN IF NOT EXISTS declines UUID[] NOT NULL DEFAULT '{}';
