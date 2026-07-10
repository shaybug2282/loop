-- Scheduling-assistant conversation memory (api/ai.js op:'chat' and friends).
-- One row per pending-event conversation; deleted by api/schedule.js when the
-- linked event is confirmed (all accepted) or declined.
-- Safe to re-run — all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL DEFAULT 'New chat',
  -- [{ role: 'user'|'assistant', content: string }] — assistant content is the
  -- raw JSON contract string ({ reply, plans, booked? }) so plan cards can be
  -- re-rendered when the chat is reopened.
  messages         JSONB       NOT NULL DEFAULT '[]',
  -- Set when the user books a plan from this chat; the conversation is removed
  -- once that event is confirmed or declined.
  pending_event_id UUID        REFERENCES pending_events(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user
  ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_event
  ON ai_conversations(pending_event_id);

-- AI plans carry a title and an optional suggested location; persist both on
-- the invite so they reach the confirmed Google Calendar event.
ALTER TABLE pending_events ADD COLUMN IF NOT EXISTS title    TEXT;
ALTER TABLE pending_events ADD COLUMN IF NOT EXISTS location TEXT;
