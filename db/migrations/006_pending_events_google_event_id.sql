-- Stores the Google Calendar event id created when a pending event is fully
-- accepted (api/schedule.js), so clients can hide the Google copy of the event
-- instead of rendering it twice. Google shares one event id across every
-- attendee's calendar, so a single stored id dedupes for all participants.
-- Safe to re-run.

ALTER TABLE pending_events ADD COLUMN IF NOT EXISTS google_event_id TEXT;
