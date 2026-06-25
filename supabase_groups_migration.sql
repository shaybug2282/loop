-- Run this in the Supabase SQL editor to enable the Groups feature.

CREATE TABLE IF NOT EXISTS groups (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT        NOT NULL,
  description   TEXT,
  color         TEXT        DEFAULT '#E8607A',
  icon_url      TEXT,
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id    UUID        NOT NULL REFERENCES groups(id)  ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  invited_by  UUID        REFERENCES users(id)            ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'declined')),
  joined_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

-- Group chat messages (server-side AES-256-GCM encrypted)
CREATE TABLE IF NOT EXISTS group_messages (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id  UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup of groups a user belongs to
CREATE INDEX IF NOT EXISTS idx_group_members_user     ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group    ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group   ON group_messages(group_id, created_at DESC);
