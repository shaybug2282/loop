# Database migrations

Supabase (Postgres) schema for Loop. There is no migration runner — apply each
file **in numeric order** by pasting it into the Supabase SQL editor
(Dashboard → SQL Editor → New query → Run). Every file is idempotent
(`IF NOT EXISTS`), so re-running is safe.

| File | Creates | Required by |
|------|---------|-------------|
| `001_groups.sql` | `groups`, `group_members`, `group_messages` + indexes | `api/groups.js` (Groups widget, group chat) |
| `002_pending_events.sql` | `pending_events` | `api/schedule.js` (Schedule! widget, invites) |
| `003_user_profiles.sql` | `user_profiles` | `api/ai.js` (AI scheduling profiles) |
| `004_messages_edited_at.sql` | `messages.edited_at` column | `api/messages.js` (edit within 60 s) |
| `005_notification_state.sql` | `notification_state` | `api/user.js` (cross-device notification seen/deleted sync) |
| `006_pending_events_google_event_id.sql` | `pending_events.google_event_id` column | `api/schedule.js` (calendar dedupe of the confirmed Google copy) |

## Base tables

The `users`, `friend_requests`, `friendships`, and `messages` tables predate
this folder and were created ad hoc (see `CHANGES.md` entries from 2026-05-01).
Their working schema, as the API code expects it:

- **users** — `id UUID PK`, `google_id TEXT UNIQUE`, `email TEXT` (encrypted),
  `name`, `display_name`, `picture_url`, `phone_number`, `show_email BOOL`,
  `access_token TEXT` (encrypted), `token_expiry TIMESTAMPTZ`, `timezone`,
  `friend_code TEXT UNIQUE` (trigger-generated), `public_key TEXT` (ECDH JWK),
  `last_seen_at TIMESTAMPTZ`
- **friend_requests** — `id`, `sender_id → users`, `receiver_id → users`,
  `status pending|accepted|rejected`, `created_at`; unique `(sender_id, receiver_id)`
- **friendships** — `user_id → users`, `friend_id → users` (both directions
  stored); unique `(user_id, friend_id)`
- **messages** — `id`, `sender_id → users`, `receiver_id → users`,
  `ciphertext TEXT`, `iv TEXT` (E2E encrypted client-side), `created_at`,
  `edited_at`
