-- 015: user preferences + friend settings + blocks.
--
-- users.preferences        JSONB — client-managed settings object:
--   { theme: 'light'|'dark'|'system', accent: '#RRGGBB',
--     availabilitySharing: 'off'|'ai'|'friends',   -- default 'ai' (current behavior)
--     notifications: { events, groupInvites, friendRequests, dmToasts },  -- all default true
--     quietHours: { enabled, start:'HH:MM', end:'HH:MM' } }               -- events can't be
--                                                                            scheduled inside the window
-- users.custom_avatar_url  TEXT  — user-uploaded avatar (also copied into picture_url so every
--                                  existing read path picks it up; login sync skips the Google
--                                  picture while this is set)
-- users.quiet_time_until   TIMESTAMPTZ — optional end for Quiet Time; past it, Quiet Time is
--                                  treated as off (enforced in api/schedule.js + api/ai.js)
-- friendships: per-friend settings owned by user_id ABOUT friend_id:
--   favorite  — pins the friend to the top of lists
--   muted     — suppress DM toasts/badges from this friend
--   availability_override — NULL (use my default) | 'visible' | 'hidden'
-- blocks — blocker_id refuses all friend requests / DMs from blocked_id (and vice versa).
--
-- Safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quiet_time_until TIMESTAMPTZ;

ALTER TABLE friendships ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false;
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS muted BOOLEAN DEFAULT false;
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS availability_override TEXT;

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
