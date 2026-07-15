-- Rain Check: mutual tentative cancel for two-person events. Each user's
-- raincheck is SECRET (the API never exposes the array, only whether the
-- viewer themselves rainchecked) until both participants have rainchecked —
-- then the event flips to status 'rainchecked', the Google copy is cancelled,
-- and both users get a notification. api/schedule.js op:'raincheck'.
-- Safe to re-run.

ALTER TABLE pending_events ADD COLUMN IF NOT EXISTS rainchecks UUID[] NOT NULL DEFAULT '{}';
