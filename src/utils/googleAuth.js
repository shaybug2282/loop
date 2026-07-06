// Google Identity Services (GIS) sign-in flow shared by Login and SignInModal.
//
// Responsibilities:
//   • one canonical OAuth scope list
//   • GIS script loading + token client creation
//   • the post-token bootstrap: fetch userinfo, persist googleUserId, start
//     the calendar token-refresh cycle, and sync the user row to Supabase.

import { initGoogleCalendar, setTokenClient } from './googleCalendar';

export const GOOGLE_OAUTH_SCOPE =
  'openid email profile ' +
  'https://www.googleapis.com/auth/calendar ' +
  'https://www.googleapis.com/auth/calendar.events ' +
  'https://www.googleapis.com/auth/tasks';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Load the GIS script (once) and create a token client wired to `callback`.
// Registers the client for silent refresh. onReady receives the client.
// Returns a cleanup function that removes a script tag this call added.
export function initGisClient(callback, onReady) {
  let addedScript = null;

  const create = () => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      scope: GOOGLE_OAUTH_SCOPE,
      callback,
    });
    setTokenClient(client);
    onReady?.(client);
  };

  if (window.google?.accounts?.oauth2) {
    create();
  } else {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = create;
    document.body.appendChild(script);
    addedScript = script;
  }

  return () => {
    if (addedScript && document.body.contains(addedScript)) {
      document.body.removeChild(addedScript);
    }
  };
}

// Given a GIS token response, complete the sign-in: fetch the Google profile,
// persist identifiers, start token refresh, and upsert the user in Supabase.
// Returns the userData object to pass to AuthContext's login(). Throws on failure.
export async function completeGoogleSignIn(response) {
  if (!response.access_token) throw new Error('No access token received');

  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${response.access_token}` },
  });
  const userInfo = await userInfoResponse.json();

  // googleCalendar.js reads this to sync refreshed tokens to Supabase.
  localStorage.setItem('googleUserId', userInfo.id);

  initGoogleCalendar(response.access_token, response.expires_in || 3600);

  // Upsert user row — the token is encrypted server-side by /api/user.
  await fetch('/api/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      op: 'sync',
      googleId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      pictureUrl: userInfo.picture,
      accessToken: response.access_token,
      expiresIn: response.expires_in || 3600,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });

  return {
    name: userInfo.name,
    email: userInfo.email,
    picture: userInfo.picture,
    accessToken: response.access_token,
  };
}
