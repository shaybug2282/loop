# Changes

## 2026-06-23 — Unauthenticated home screen + sign-in prompt

`/dashboard` (and `/`) is now publicly accessible without signing in. Unauthenticated visitors see the full dashboard layout with three greyed placeholder cards. A "Sign in" button is shown in the header. After 30 seconds, a modal with the Google OAuth button auto-appears. Signing in via the modal calls `login()` in AuthContext and the dashboard re-renders immediately with full content — no page reload or redirect needed. All other protected routes (`/calendar`, `/schedule`, etc.) still redirect to `/login` as before.

## 2026-06-23 — Notification dismiss fix (module-level singleton)

Replaced per-instance React state for dismissed notifications with a module-level `_dismissed` Set initialized from `sessionStorage` once at module load. All `ScheduleWidget` instances share the same Set — dismissals on the dashboard are immediately reflected on the Schedule page and vice versa, and they survive component re-mounts (navigation) without any synchronization logic. A version counter (`setDismissVersion`) forces re-renders when the Set changes.

## 2026-06-23 — Auto-clearing dismissible widget notifications (updated)

All notification types (invite, decline, confirmed-green) auto-clear after 60 s and can be manually dismissed via a hover-reveal ✕ button. Dismissed IDs are now written to `sessionStorage` under the key `sw-dismissed` so they survive navigation and component re-mounts — both the dashboard widget and the Schedule page widget read from and write to the same key, keeping them in sync. Notifications dismissed in either place stay gone for the rest of the browser session.

## 2026-06-23 — Schedule page, widget improvements, footer

**Schedule page (`/schedule`):** New page with 3 panels — the full Schedule! widget, an Upcoming Events list (future events sorted by time, showing duration and confirmed/pending status), and a Notification Log (activity feed: declines, acceptances, confirmations, invites received). Accessible via sidebar "Schedule" nav item (CalendarCheck icon) and by clicking the "Schedule!" title on the dashboard widget.

**Widget title navigation:** Clicking "Schedule!" in the widget header navigates to `/schedule` when on the dashboard. Title is not clickable when already on the schedule page.

**Future-only events:** `PickTimeScreen` now validates that the selected datetime is in the future. Selecting today restricts the time input minimum to the current hour:minute. Submitting a past time shows an inline error rather than silently sending to the API.

**Duration in all notifications:** `formatDuration` added. Duration is shown in `NotifCard` (invite cards), decline notifications, and all-confirmed banners, and throughout the Schedule page panels.

**Footer:** Global `<Footer>` rendered at the app level on every page. Shows "Copyright 2026 Danish Pastry House is a Front." and a "Privacy Policy" link to `/privacy`, which is currently a blank page.

## 2026-06-23 — Enter key, shared GCal events, decline notifications

**Enter key on all text inputs:** `FindTimeScreen` (hours), `PickTimeScreen` (date + time), and `ProfilePage` (display name, phone) now submit on Enter. `FriendsPage` friend-code input already had this.

**Shared Google Calendar event:** `createGCalEvent` now accepts an `attendeeEmails` array and creates a single event with all participants as attendees. The event is created on the organizer's calendar when **all** invited users accept; Google delivers invitations to each attendee automatically. Previously, separate events were created on each user's calendar individually.

**Decline notifications:** Declining an event no longer sets `status: 'declined'` on the whole row. Instead a `declines UUID[]` column tracks which users declined. The organizer sees an amber notification card in the widget: "[Name] declined · [time]". The invited user who declined no longer sees the event in their invite list. The event stays open for other invitees.

**Required Supabase migration:**
```sql
ALTER TABLE pending_events ADD COLUMN IF NOT EXISTS declines UUID[] NOT NULL DEFAULT '{}';
```

## 2026-06-23 — Messages popup fixed-height + ScheduleWidget error handling + notif polling

**Messages popup:** `.mp-panel` now uses `height: min(520px, calc(100vh - 32px))` instead of only `max-height`, so the panel renders at full size immediately on open rather than starting small and expanding as content loads.

**ScheduleWidget — error surfacing:** `choose()` no longer silently resets to `start` on API failure. It now captures the server error message and displays it as an inline error banner above the widget body. The user stays on the current screen and can retry or dismiss the banner. `reset()` and the back button both clear the error.

**ScheduleWidget — invite polling:** Added a 15-second `setInterval` on `loadNotifs` so invited users see incoming event invites in their widget without needing to reload the page. Previously, the invited user's notif list was only fetched once on mount.

## 2026-06-23 — Schedule! widget

Replaced the To-do list widget on the Dashboard with a new **Schedule!** widget (`ScheduleWidget.js/css`). The widget has a multi-screen flow:

- **Start:** three options — Event / With a friend / Other. Event and Other show a "not yet" stub.
- **With a friend:** multi-select friend list; arrow button (bottom-right) appears once ≥1 friend is selected.
- **Timing:** "Pick a time" (date + time inputs → creates event immediately) or "Find a time" (enter hours → calls `/api/schedule` to compare calendars).
- **Find a time:** queries Google Calendar FreeBusy API for all selected users via server-side token decryption; proposes 3 daytime slots (9 AM–6 PM preferred, any hour if needed), spaced ≥6 hours apart. If none found, offers to extend to the following week.
- **Proposed times:** user selects one → event is written to `pending_events` table.
- **Pending:** confirmation screen; invited users see the event as a notification in their own Schedule! widget with Accept / Decline.
- **All accepted:** Google Calendar events are created on every participant's primary calendar; event name is `{creatorName} Hangout!`

New `api/schedule.js` router (counts as 1 Vercel function):
- `GET ?op=pending-events` — events where user is creator or invitee, status pending/accepted
- `POST op:create-event` — write pending_event row
- `POST op:respond` — accept/decline; triggers GCal creation when all have accepted
- `POST op:find-times` — server-side FreeBusy query across all participants

**Required Supabase migration:**
```sql
CREATE TABLE pending_events (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id       UUID REFERENCES users(id),
  invited_user_ids UUID[]     NOT NULL DEFAULT '{}',
  event_time       TIMESTAMPTZ NOT NULL,
  duration_hours   FLOAT      NOT NULL DEFAULT 1,
  status           TEXT       NOT NULL DEFAULT 'pending',
  acceptances      UUID[]     NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  google_event_created BOOLEAN DEFAULT false
);
```

Potential bugs: Google Calendar tokens may be expired at find-time; expired tokens are silently skipped (that user's busy times are ignored, so proposed slots might conflict). Server-side clock drift could affect window calculations. The `pending_events` table must exist before the widget is functional.

## 2026-06-23 — Panel height, gradient removal, FriendsPage header

**Messages panel height:** `MessagesPanel.css` updated from `max-height: 500px` to `max-height: min(1500px, calc(100vh - 32px))` — roughly 3× taller while staying within the viewport.

**Gradients removed:** All `linear-gradient` declarations replaced with flat equivalents across `App.css`, `WeekView.css`, `FriendsWidget.css`, `AISummary.css`, `Sidebar.css`, `Dashboard.css`, `PageLayout.css`, and `Login.css`. Text gradient on page `h1` headings replaced with `color: #E8607A`; background gradients replaced with `#FDF5F7`; accent button gradients replaced with `#E8607A`. Potential bug: Login page background is now a flat `#E8607A` instead of a gradient — may look different on large viewports.

**FriendsPage header restyled:** Font size increased to `2rem`, weight to `700`, color set to `#E8607A`, gap updated to `20px`, and menu button now has white background + box shadow — matching the Dashboard and PageLayout header style.

## 2026-06-23 — Messages popup panel + undo send + edit + color scheme

**Messages redesign:** Removed full-page `MessagesPage` and replaced with a fixed bottom-right floating panel (`MessagesPanel`) always rendered above all pages via `App.js`. Panel is ~340×500px (≈1/8 screen) with minimize/close controls; `/messages` route now redirects to dashboard. Added `MessagesContext` so any component can call `openMessages(friend)` — used by `FriendsWidget` and `FriendsPage` popup instead of `navigate('/messages')`.

**Timestamps:** Time labels appear only at 30-second gaps between messages. Rapid messages are visually grouped with tighter spacing and no individual timestamps. First message in a conversation always shows a label.

**Undo send (30s):** Right-click any own message within 30 seconds to delete it from both ends. Server enforces the window — returns 403 after expiry. Message is hard-deleted from DB.

**Edit message (60s):** Right-click any own message within 60 seconds to edit inline. Re-encrypted with the same ECDH shared key; server stores new `payload` and sets `edited_at`. Message shows italic "· edited" note on both ends after save.

**Condensed storage:** `messageCrypto.js` now produces a single `payload` column (`ivB64.ctB64`) instead of separate `ciphertext` and `iv` columns. `decryptMessage` handles both formats for backwards compatibility.

**Required Supabase migration:**
```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payload TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
UPDATE messages SET payload = iv || '.' || ciphertext WHERE payload IS NULL;
```

**Color scheme:** Replaced indigo/purple (`#4f46e5`) brand palette with rose/pink palette across all CSS files and the favicon. New accent: `#E8607A` → hover `#C94D65` → strong `#B5365A`. Surface colors: `#FDF5F7` / `#F9EAF0`. Border: `#F3D8E4`. Text: `#1A1A1A` / `#4A4A52` / `#6B7280`. Danger: `#C0392B`.

Potential bugs: The 30s/60s windows are enforced server-side using `created_at`; clock skew between client and server could cause premature expiry errors. Existing messages in DB with legacy `ciphertext`/`iv` columns need the migration SQL above before `payload` reads will work.

## 2026-06-23 — Merge Contacts into Friends; add message shortcut on dashboard

Removed the placeholder Contacts widget and its localStorage-backed data. The dashboard now shows a single `FriendsWidget` in that slot: each friend card displays their avatar, name, and (if shared) email and phone number, with a message icon that appears on hover and navigates directly to the DM conversation. `ContactList.js/css` and `ContactsPage.js` deleted; `/contacts` route redirects to `/friends`; "Contacts" removed from sidebar. The old small `FriendsWidget` (count-only) was replaced by this expanded card list.

Potential bugs: The message icon calls `navigate('/messages', { state: { friend } })` — MessagesPage must still handle `location.state?.friend` on mount (it does), but if the friend has not yet uploaded a public key the conversation view will show the "hasn't set up messaging" error.

## 2026-06-23 — Consolidate serverless functions (14 → 5) for Vercel Hobby plan

Merged 14 individual `/api/*.js` serverless functions into 4 router files — `api/friends.js`, `api/messages.js`, `api/user.js`, `api/ai.js` — plus the existing `api/_crypto.js` utility (not a Vercel function). Each router uses `req.query.op` for GET and `req.body.op` for POST to dispatch to the appropriate handler. Updated all client-side callers in 7 files (`Login.js`, `googleCalendar.js`, `MessagesPage.js`, `FriendsPage.js`, `AISummary.js`, `FriendsWidget.js`, `ProfilePage.js`); deleted all 14 old individual files.

Potential bugs: `generate-summary.js` was deleted as dead code — if any code path still references `/api/generate-summary` it will 404. Verify Vercel re-detects the function count after next deploy (should show 4 functions, well under the 12 Hobby cap).

## 2026-05-01 — Messaging, AI chat, favicon, friends widget

E2E encrypted DMs: `messageCrypto.js` (ECDH P-256 key agreement + AES-256-GCM) — keypair generated once per browser, public key stored in Supabase. `MessagesPage` polls every 3s for new messages, decrypts locally, groups bubbles with a visual gap when >1 min between messages. `api/{send-message,get-conversation,get-conversations,get-my-id,store-public-key,get-public-key}.js` all use service role key. Navigate from friend popup passes friend via router state so the correct conversation opens directly.

Replaced AISummary with an AI chat interface (`api/ai-chat.js`) — user types any message, calendar events are lazily fetched once as system context so schedule-aware questions work. `FriendsWidget` added to dashboard showing friends list and pending request badge. Phone number input auto-formats to (XXX)XXX-XXXX as the user types. Tab favicon updated to a curvy loopy SVG "L" on brand purple; page title changed to "Loop".

Potential bugs: ECDH private key is stored unencrypted in localStorage — if the user clears localStorage they lose decryption ability for old messages. Messages page polls unconditionally; should pause polling when the tab is hidden (`document.visibilityState`).

## 2026-05-01 — Profile page + friends page enhancements

Added `display_name`, `show_email`, `phone_number` columns to `users`. New `ProfilePage` (accessible by clicking user info in sidebar) lets users set display name, toggle email visibility, and add phone number — saved via `api/update-profile.js` (service role key). New `MessagesPage` placeholder wired to `/messages`. `FriendsPage` now shows outgoing requests with "Pending" label, friend cards open a popup with display name, conditionally shown email/phone, and Tag (no-op), Message (→ /messages), and Unfriend (two-step confirm, calls `api/unfriend.js` which deletes both friendship rows) buttons. `api/get-friends-data.js` updated to run three parallel queries and return `sentRequests` plus full profile fields on friends.

Potential bugs: Profile page reads from Supabase using the anon key (read-all RLS policy) — phone numbers are visible to anyone with the anon key who queries the table directly. Consider column-level security or a dedicated read endpoint scoped to friends-only before phone becomes sensitive data.

## 2026-05-01 — Friends system

Added `friend_code` (unique 15-char string, auto-generated on INSERT via trigger, backfilled for existing users) to the `users` table; added `friend_requests` (pending/accepted/rejected lifecycle) and `friendships` (both directions stored for symmetric lookup) tables. Three serverless endpoints: `send-friend-request` (looks up user by code, creates request), `get-friends-data` (returns friend code, pending requests, confirmed friends), `respond-friend-request` (accept writes both friendship rows, reject updates status). `FriendsPage` has two sections — Requests (with Add Friend input) and Friends (with copyable friend code) — wired into sidebar and App.js routing.

Potential bugs: friend code input is normalized to uppercase client-side but codes are stored as mixed-case in the DB — the API uses `.toUpperCase()` on lookup, so codes generated with lowercase chars in `generate_friend_code` would never match. Recommend updating the charset to uppercase-only (already done: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).

## 2026-05-01 — AES-256-GCM encryption for stored access tokens

Added `api/_crypto.js` with `encrypt`/`decrypt` helpers using Node.js built-in `crypto` (AES-256-GCM, 96-bit IV, auth tag). Created `api/sync-user.js` serverless endpoint that receives user data from the client, encrypts the token server-side using `TOKEN_ENCRYPTION_KEY`, and upserts to Supabase — so the plaintext token never touches the DB and the key is server-only. Updated `Login.js` and `googleCalendar.js` to POST to `/api/sync-user` instead of writing to Supabase directly.

Potential bugs: `TOKEN_ENCRYPTION_KEY` must be added to Vercel environment variables before deploying — missing or wrong-length key throws at encrypt time and returns 500. Existing rows in the `users` table have plaintext tokens and will need a one-time re-encryption pass once users sign in again.

## 2026-05-01 — Supabase users table + login upsert

Replaced the `test` table with a `users` table that persists one row per distinct Google account: stores `google_id`, `email`, `name`, `picture_url`, `access_token`, `token_expiry`, `timezone`, and `last_seen_at` (auto-updated via trigger). Login flow in `Login.js` upserts on `google_id` so returning users refresh their token rather than create a new row; `initGoogleCalendar` in `googleCalendar.js` syncs refreshed tokens back to Supabase so the AI agent always has a current token per user. `googleUserId` is stored in localStorage on login and cleared on logout.

Potential bugs: `access_token` is stored in plaintext — should be encrypted at rest before the AI agent feature ships. The Supabase upsert in `Login.js` fires without awaiting the result in `initGoogleCalendar` (fire-and-forget), so token sync failures are silent.

## 2026-04-11 — Automatic Google token refresh

Added proactive silent token refresh to `googleCalendar.js`: tokens are now stored with an expiry timestamp, a background timer fires 5 minutes before expiry to silently re-request a new token via GIS (`requestAccessToken({ prompt: '' })`), and all API calls go through `getValidToken()` which triggers an on-demand refresh if the token is near expiry.
`AuthContext.js` re-initializes the GIS token client on page reload so the refresh mechanism survives navigation, and `clearTokenRefresh()` is called on logout to cancel any pending timer.

Potential bugs: If the user's Google session has itself expired (signed out of Google), the silent refresh will fail silently and fall back to the stale token, causing 401 errors on the next API call — a re-login prompt should be surfaced in that case.

## 2026-04-11 — AI Day Summary serverless function

Updated `api/generate-summary.js` to use `claude-sonnet-4-6`, added a cached system prompt (prompt caching via `anthropic-beta: prompt-caching-2024-07-31`) to reduce token spend on repeated calls, and improved the user message to include the current date. Updated `AISummary.js` to pass event descriptions (truncated to 120 chars) and the formatted date string to the API for richer, time-aware summaries.

Potential bugs: `REACT_APP_ANTHROPIC_API_KEY` is bundled into the frontend by CRA — the API key should be moved to a non-`REACT_APP_` env var (e.g. `ANTHROPIC_API_KEY`) so it is only accessible server-side in the Vercel function.

## 2026-04-11 — Supabase database editor page

Added `src/utils/supabaseClient.js` (returns null when env vars are absent), `src/pages/DatabasePage.js` with inline row editing/creation/deletion via the Supabase JS client, and installed `@supabase/supabase-js`. Wired `/database` route into `App.js` and added a Database nav item to `Sidebar.js`.
Potential bugs: edit/delete operations assume an `id` column as the primary key — tables with composite or differently named PKs will need the `.eq('id', ...)` calls updated; row values are always cast to strings on input, so number/boolean columns may need type coercion before insert/update.

## 2026-04-11 — Fix re-login prompt and 401 on Generate Summary

Fixed `getValidToken()` in `googleCalendar.js`: added an `if (expiry === 0) return token` guard so sessions without a stored expiry timestamp no longer fall into the silent-refresh path (which was triggering the Google sign-in dialog on every button click). Also changed the silent-refresh failure branch to resolve with the existing token instead of rejecting, so a GIS error degrades gracefully.
Updated `.env.example` to document `ANTHROPIC_API_KEY` (no `REACT_APP_` prefix) matching what `api/generate-summary.js` actually reads; the 401 from Anthropic on the deployed project requires adding `ANTHROPIC_API_KEY` to Vercel dashboard Environment Variables.
