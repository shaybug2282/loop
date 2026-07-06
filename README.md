# Loop

AI social calendar. Loop connects friends' Google Calendars so groups can find
times, send invites, and book shared events — with a two-model AI assistant
that learns each user's scheduling habits and proposes times that fit everyone.

## Features

- **Google Calendar sync** — today view, week view, and free/busy-aware
  scheduling via Google OAuth (silent token refresh, encrypted at rest)
- **Schedule! widget** — pick a time manually, let the server search everyone's
  calendars for open slots, or ask the AI; invitees accept/decline and the
  confirmed event lands on Google Calendar with all attendees
- **AI scheduling assistant** — chat box that turns "dinner with Sam next week"
  into bookable time suggestions; a background Haiku pass profiles each user's
  rhythm and constraints, and Sonnet plans around every participant
- **Friends** — friend codes, requests, profiles with privacy controls
- **Messaging** — end-to-end encrypted DMs (ECDH + AES-GCM), plus group chat
  (server-side encrypted)
- **Groups** — create groups with colors/icons, invite members, group scheduling
  and chat
- **Tasks** — to-do list synced with Google Tasks plus local tasks

## Architecture

```
src/                     React 18 SPA (Create React App)
├── pages/               Route-level views (Dashboard, Schedule, Friends, …)
├── components/          Widgets and panels
├── contexts/            Auth, Messages, GroupChat providers
└── utils/               googleAuth, googleCalendar, messageCrypto, format

api/                     Vercel serverless functions (one router per domain)
├── user.js  friends.js  messages.js  schedule.js  groups.js  ai.js
└── _crypto.js  _lib.js  ← shared modules ("_" prefix = not a route)

db/migrations/           Supabase SQL, applied manually in order (see db/README.md)
```

Each API router dispatches on an `op` parameter (`?op=` for GET,
`{ op: ... }` in the body for POST) — this keeps the Vercel function count low
(6 functions, Hobby-plan cap is 12). Google access tokens and emails are
AES-256-GCM encrypted before they touch the database; DM content is encrypted
client-side and the server only ever stores ciphertext.

The AI apparatus is two-stage: `op:build-profile` (Haiku) distills calendar
history into a stored scheduling profile per user; `op:schedule` / `op:chat`
(Sonnet) combine every participant's profile with live free/busy data to
propose event plans. See `api/ai.js`.

## Setup

### 1. Google Cloud

Create a project at [console.cloud.google.com](https://console.cloud.google.com), enable
**Google Calendar API** and **Google Tasks API**, configure the OAuth consent
screen (External) with scopes `calendar`, `calendar.events`, `tasks`, and add
yourself as a test user. Create an OAuth 2.0 Client ID (Web application) with
`http://localhost:3000` and your production URL in both authorized origins and
redirect URIs.

### 2. Supabase

Create a project at [supabase.com](https://supabase.com). Apply the SQL in
`db/migrations/` in order via the SQL editor — see `db/README.md` for the
full schema including the base tables.

### 3. Environment

```bash
npm install
cp .env.example .env   # then fill in every value
```

| Variable | Where used | Notes |
|----------|-----------|-------|
| `REACT_APP_GOOGLE_CLIENT_ID` | client | OAuth client ID from step 1 |
| `REACT_APP_SUPABASE_URL` | client + server | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | bypasses RLS — never expose |
| `ANTHROPIC_API_KEY` | server only | powers `api/ai.js` |
| `TOKEN_ENCRYPTION_KEY` | server only | 64 hex chars; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### 4. Run

```bash
npm start        # CRA dev server at localhost:3000
npm test         # jest in watch mode
npm run test:ci  # single test run (CI)
npm run build    # production build
```

Note: `npm start` alone serves only the React app. The `api/` functions run on
Vercel — for a full local stack use `vercel dev`, which serves both.

## Deployment (Vercel)

Import the repo on [vercel.com](https://vercel.com) and add **all** environment
variables from the table above in project settings. After the first deploy, add
the Vercel URL to your Google OAuth client's authorized origins/redirect URIs.

## Testing

Unit tests live in `src/__tests__/` and cover the pure logic: token encryption
round-trips (`api/_crypto.js`), AI-reply JSON extraction (`api/ai.js`),
free-slot search (`api/schedule.js`), and shared formatters (`src/utils/format.js`).
Run `npm run test:ci`.

## Troubleshooting

- **`redirect_uri_mismatch`** — app URL missing from the OAuth client's
  authorized URIs; add it and wait a few minutes.
- **`403 Access Denied`** — Calendar or Tasks API not enabled in Google Cloud.
- **`Access blocked: request is invalid`** — consent screen incomplete, or your
  account isn't a test user.
- **Groups/AI/events not working** — a `db/migrations/` file hasn't been applied.
- **"[encrypted]" messages** — a participant's ECDH keypair was regenerated
  (cleared browser data); prior messages are unrecoverable by design.

## Changelog

See `CHANGES.md` — every change lands there with its date, affected files, and
known caveats.
