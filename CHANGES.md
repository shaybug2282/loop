# Changes

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
