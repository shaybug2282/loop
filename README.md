# Loop


## What it does

- Google OAuth login
- Today's schedule and a full week view pulled from Google Calendar
- To-do list that imports from Google Tasks, plus local tasks you add yourself
- Contact management (stored locally in the browser)

---

## Setup

### 1. Google Cloud project

Go to [console.cloud.google.com](https://console.cloud.google.com), create a new project, then enable two APIs under **APIs & Services → Library**:

- Google Calendar API
- Google Tasks API

### 2. OAuth consent screen

Under **APIs & Services → OAuth consent screen**, choose External and fill in your app name and email. On the scopes step, add:

- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/tasks`

Add your Google account as a test user. The app will only be usable by test users until you publish it.

### 3. OAuth credentials

Under **APIs & Services → Credentials**, create an OAuth 2.0 Client ID (Web application). Add the following to both Authorized JavaScript origins and Authorized redirect URIs:

- `http://localhost:3000` for local dev
- Your production URL once deployed (e.g. `https://your-app.vercel.app`)

Copy the client ID — it looks like `123456789-abcdefg.apps.googleusercontent.com`.

### 4. Local install

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```
REACT_APP_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
```

```bash
npm start
```

App runs at `http://localhost:3000`.

---

## Deployment (Vercel)

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and add `REACT_APP_GOOGLE_CLIENT_ID` as an environment variable in project settings. After deploy, go back to Google Cloud Console and add your Vercel URL to the OAuth client's authorized origins and redirect URIs. Changes can take a few minutes to propagate.

---

## Troubleshooting

**`redirect_uri_mismatch`** — Your app URL isn't in the OAuth client's authorized URIs. Add it and wait a few minutes.

**`403 Access Denied`** — One or both APIs (Calendar, Tasks) aren't enabled in Google Cloud Console.

**Tasks not showing** — Verify the Tasks API is enabled, check that you actually have tasks at [tasks.google.com](https://tasks.google.com), and try the refresh button.

**`Access blocked: request is invalid`** — OAuth consent screen isn't fully configured, or your account isn't added as a test user.

---

## Known limitations

- Access tokens expire after one hour and will require re-login. A backend with refresh token handling would fix this properly.
- Creating new Google Tasks or Calendar events from the app isn't implemented yet.
- While the OAuth consent screen is in Testing mode, only explicitly added test users can sign in.

---

## Stack

React 18, React Router, `@react-oauth/google`, Google Calendar API, Google Tasks API, Lucide React, localStorage for contacts and local tasks.
