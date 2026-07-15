// Google Identity Services (GIS) sign-in flow shared by Login and SignInModal.
//
// Authorization-code flow (popup): the browser only ever sees a one-time
// authorization code, which /api/user op:'google-auth' exchanges server-side
// for tokens — the refresh token is stored encrypted in the DB and never
// reaches the browser. The server response sets the httpOnly session cookie
// that authenticates every subsequent /api call.
//
// Responsibilities:
//   • one canonical OAuth scope list (narrowest set that covers the app:
//     events read/write + free-busy via calendar.readonly + tasks)
//   • GIS script loading + code client creation
//   • the post-code bootstrap: exchange via the API, persist googleUserId.

export const GOOGLE_OAUTH_SCOPE =
  'openid email profile ' +
  'https://www.googleapis.com/auth/calendar.readonly ' +
  'https://www.googleapis.com/auth/calendar.events ' +
  'https://www.googleapis.com/auth/tasks';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Load the GIS script (once) and create a popup-mode authorization-code
// client wired to `callback`. onReady receives the client (call
// client.requestCode() from the sign-in button). Returns a cleanup function
// that removes a script tag this call added.
export function initGisClient(callback, onReady) {
  let addedScript = null;

  const create = () => {
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      scope:     GOOGLE_OAUTH_SCOPE,
      ux_mode:   'popup',
      callback,
    });
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

// Given a GIS code response, complete the sign-in: the server exchanges the
// code, verifies identity, stores encrypted tokens, and sets the session
// cookie. Persists googleUserId (widgets use it as the "signed in" gate) and
// returns the userData object to pass to AuthContext's login(). Throws on failure.
export async function completeGoogleSignIn(response) {
  if (response.error || !response.code) throw new Error(response.error || 'No authorization code received');

  const r = await fetch('/api/user', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      op:       'google-auth',
      code:     response.code,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Sign-in failed');

  localStorage.setItem('googleUserId', data.user.googleId);

  return {
    name:    data.user.name,
    email:   data.user.email,
    picture: data.user.picture,
  };
}
