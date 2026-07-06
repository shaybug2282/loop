-- Cross-device notification read/delete state (api/user.js op:'notification-state').
-- Stores the ids of notifications the user has seen or deleted, so the bell
-- badge and deletions stay consistent across browsers/devices.
-- Safe to re-run — uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS notification_state (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seen       TEXT[] NOT NULL DEFAULT '{}',
  dismissed  TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
