-- Constraint notes sent with "Reschedule?" requests, stored on the event so
-- the creator can review them in the event popup (previously they only went
-- to the creator's assistant chat). [{ user_id, note, at }] — appended by
-- api/schedule.js respond/reschedule, cleared when the creator confirms a
-- material edit (which sends fresh invites and lifts the response lock).
-- Safe to re-run.

ALTER TABLE pending_events ADD COLUMN IF NOT EXISTS reschedule_notes JSONB NOT NULL DEFAULT '[]';
