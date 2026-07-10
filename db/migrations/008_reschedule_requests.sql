-- Reschedule flow (api/schedule.js op:'respond' action:'reschedule').
-- Records which invitees asked to move the event; the event itself gets
-- status 'rescheduled' and the creator's Scheduling Assistant conversation is
-- reopened so the AI can propose new times.
-- Safe to re-run — all statements use IF NOT EXISTS.

ALTER TABLE pending_events
  ADD COLUMN IF NOT EXISTS reschedule_requests UUID[] NOT NULL DEFAULT '{}';
