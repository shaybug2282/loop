-- Contact-privacy toggle for phone numbers (mirrors show_email) and Quiet
-- Time: while quiet_time_since is non-null, nobody can schedule events with
-- this user (api/schedule.js create-event rejects with feedback); the client
-- prompts the user to turn it off after 24 hours.
-- Safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS show_phone BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quiet_time_since TIMESTAMPTZ;
