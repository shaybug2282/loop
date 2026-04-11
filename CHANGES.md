# Changes

## 2026-04-11 — Automatic Google token refresh

Added proactive silent token refresh to `googleCalendar.js`: tokens are now stored with an expiry timestamp, a background timer fires 5 minutes before expiry to silently re-request a new token via GIS (`requestAccessToken({ prompt: '' })`), and all API calls go through `getValidToken()` which triggers an on-demand refresh if the token is near expiry.
`AuthContext.js` re-initializes the GIS token client on page reload so the refresh mechanism survives navigation, and `clearTokenRefresh()` is called on logout to cancel any pending timer.

Potential bugs: If the user's Google session has itself expired (signed out of Google), the silent refresh will fail silently and fall back to the stale token, causing 401 errors on the next API call — a re-login prompt should be surfaced in that case.
