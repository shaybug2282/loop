# Workflow
- Be sure to typecheck when you're done making a series of code changes
- once a change has been made, write to a file in the working directory where the change was made. If one does not already exist, create it. write a brief (maximum 3 sentences) explanation of what changed and what potential bugs need to be resolved.
- emphasize usage efficiency.
- when a function is created, comment a short description of the intention and expected output.

# Project Overview
- This project will ultimately be an AI tool that can read, edit, and sync calendar events across multiple users based on user input. User can prompt AI to suggest times to schedule shared events between multiple users' calendars.
- Project will also offer interface to manage contacts within the app and daily tasks.
- Project will prioritize intuitive user interface.

# Project Interfacing
- This website will eventually interface with many other applications, including GSuite apps, Outlook, and Apple apps. When creating these interfaces, must include specific framework to allow for smooth interfacing with each different client.
- ensure interfacing is seamless as possible on user end. implement automatic token refresh. limit permission requests to the most narrow necessary scope.

# Architecture
- Project is being deployed through Vercel.
- Backend database will be handled by Supabase.
- When implementing commands, keep the number of serverless functions as consolidated as possible without causing future issues.

# Commands
- `npm start` — CRA dev server (frontend only; `api/` runs on Vercel — use `vercel dev` for the full stack)
- `npm run build` — production build; run with `CI=true` to fail on eslint warnings (this is the "typecheck" for this JS project)
- `npm run test:ci` — single jest run (tests live in `src/__tests__/`)
- `for f in api/*.js; do node --check "$f"; done` — fast syntax check of serverless functions

# Repo map
- `src/pages/` — route-level views; routing lives in `src/App.js`
- `src/components/` — widgets/panels, one `.css` per component, co-located
- `src/contexts/` — AuthContext (login/logout), MessagesContext (DM panel), GroupChatContext
- `src/utils/` — `googleAuth` (GIS authorization-code sign-in flow), `googleCalendar` (Calendar/Tasks REST; access tokens fetched from `/api/user?op=google-token`), `messageCrypto` (E2E DMs), `format` (shared date/duration formatters)
- `api/` — one router per domain: `user`, `friends`, `messages`, `schedule`, `groups`, `ai`. Files prefixed `_` (`_crypto.js`, `_lib.js`) are shared modules, NOT deployed as functions
- `db/migrations/` — Supabase SQL, applied manually in order; `db/README.md` documents the full schema including base tables
- `CHANGES.md` — the changelog required by the Workflow rule above; newest entry on top

# Conventions
- **API op-routing:** every router dispatches on `op` — query param for GET (`?op=list`), body field for POST (`{ op: 'create' }`). Add new operations to an existing router rather than creating a new function file (Vercel Hobby caps functions at 12; currently 6).
- **Identity:** every API op derives the caller from the httpOnly session cookie via `requireUser` in `api/_lib.js` — client-sent `googleId` params are legacy and ignored; never trust them. Sessions are issued by `api/user.js` op:`google-auth` (server-side code exchange). localStorage `googleUserId` remains only as the client's "signed in" gate. Cross-user references (invites, members, participants) always use Supabase UUIDs.
- **Google tokens:** server-side Google API calls must go through `getGoogleAccessToken` (`api/_lib.js`) — it refreshes expired access tokens from the stored refresh token; never decrypt `users.access_token` and use it directly. Browser-side calls get tokens from `/api/user?op=google-token` (via `getValidToken` in `src/utils/googleCalendar.js`).
- **Secrets:** Google tokens (access + refresh) and emails are AES-256-GCM encrypted via `api/_crypto.js` before hitting the DB; use `safeDecrypt` from `_lib.js` when reading (handles pre-encryption rows). `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` (and optional `SESSION_SECRET`) are server-only — never import them into `src/`.
- **All data access goes through `/api/`** — the frontend must not query Supabase directly (no anon-key client exists anymore).
- **Styling:** plain CSS files per component, class prefixes per component (`sw-` ScheduleWidget, `gw-` GroupsWidget, `mp-` MessagesPanel, `nc-` NotificationCenter, `ais-` AISummary). Brand palette: accent `#E8607A`, hover `#C94D65`, surfaces `#FDF5F7`/`#F9EAF0`, border `#F3D8E4`.
- **AI prompts** live inline in `api/ai.js` with the JSON contract documented alongside; model IDs are in the `MODELS` const.

# Gotchas
- **PostgREST ambiguous FK:** `group_members` has two FKs to `users` (`user_id`, `invited_by`). Any `users(...)` embed through that table silently returns null — fetch the rows first, then batch-resolve users with `.in('id', ids)`. See `api/groups.js` for the pattern.
- **AI JSON output:** Sonnet/Haiku replies are parsed with `extractJson` (`api/ai.js`) — prompts must demand raw JSON; assistant-message prefill is NOT supported by these models.
- **E2E messaging:** DM ciphertext is only decryptable client-side; a cleared localStorage regenerates the ECDH keypair and orphans old messages. `sendDm` must upload the sender's public key before sending (it does — keep it that way).
- **New DB tables** require a numbered migration file in `db/migrations/` plus a note in `db/README.md`; there is no migration runner — users paste SQL into the Supabase editor.
- **`git` may be unavailable** on this machine (missing Xcode CLT); verify with filesystem tools if commands fail.
