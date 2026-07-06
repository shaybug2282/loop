-- Message edit support (api/messages.js op:'edit').
-- Safe to re-run.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
