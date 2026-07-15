-- Optional short invite note (assistant- or creator-authored). Shown on the
-- invite and event cards ONLY — deliberately never copied onto the confirmed
-- Google Calendar event (api/schedule.js confirmEvent).
-- Safe to re-run.

ALTER TABLE pending_events ADD COLUMN IF NOT EXISTS description TEXT;