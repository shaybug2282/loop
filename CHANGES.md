# Changes

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
