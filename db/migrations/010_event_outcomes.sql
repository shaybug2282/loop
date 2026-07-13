-- Durable per-user log of how invites were answered (accepted / declined /
-- asked_to_reschedule / created). Written at response time by api/schedule.js,
-- read by the Haiku profiler (api/_profiles.js fetchAppOutcomes) so outcome
-- history survives the 2-week purge of dead pending_events rows.
-- event_id has NO foreign key on purpose: outcomes must outlive the event row.
-- Safe to re-run — all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS event_outcomes (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id       UUID,
  response       TEXT        NOT NULL, -- accepted | declined | asked_to_reschedule | created
  title          TEXT,
  event_time     TIMESTAMPTZ,
  duration_hours FLOAT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_outcomes_user
  ON event_outcomes(user_id, created_at DESC);
