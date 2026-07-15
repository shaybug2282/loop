-- 016: Google OAuth refresh tokens (authorization-code flow).
-- The refresh token is obtained once at sign-in via the server-side code
-- exchange (api/user.js op:'google-auth'), stored AES-256-GCM encrypted (same
-- scheme as access_token / email), and used by api/_lib.js
-- getGoogleAccessToken to mint fresh access tokens server-side — so calendar
-- reads for offline participants no longer silently fail after the old
-- 1-hour access token expired.

ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT;
