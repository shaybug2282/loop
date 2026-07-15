// User router — authentication, identity, profile updates, and preferences.
//
// Auth (public — these two are the only unauthenticated ops in the API):
// POST { op:'google-auth', code, timezone? } → server-side Google authorization-code
//        exchange: verifies identity, stores encrypted access/refresh tokens,
//        upserts the user row, and sets the httpOnly session cookie
// POST { op:'logout' }                       → clears the session cookie
//
// Session-gated (identity always comes from the session cookie — see
// requireUser in api/_lib.js; client-sent googleId params are ignored):
// GET  ?op=session             → { userId, googleId } for the current session
// GET  ?op=google-token        → { accessToken, expiresAt } fresh Google access
//                                token for browser-side Calendar/Tasks calls
//                                (refreshed server-side; refresh token never leaves the server)
// GET  ?op=my-id               → internal Supabase UUID for the user
// GET  ?op=profile             → display_name, show_email, show_phone, phone_number, friend_code,
//                                quiet_time_since/until, preferences, custom_avatar_url
// GET  ?op=notification-state  → { seen[], dismissed[] } notification ids
// POST { op:'update-profile',     ... } → update display_name, show_email, show_phone, phone_number, custom avatar
// POST { op:'preferences', patch }      → shallow-merge patch into users.preferences (theme, accent,
//                                notification toggles, availabilitySharing, quietHours)
// POST { op:'quiet-time', enabled, until? } → toggle Quiet Time (while on, nobody can schedule
//                                this user; optional auto-off timestamp)
// POST { op:'regenerate-code' }         → mint a fresh friend code (old one stops working)
// POST { op:'notification-state', ... } → replace stored seen/dismissed arrays
//
// google-auth requires env: GOOGLE_CLIENT_SECRET (+ the existing client id) and
// stores the refresh token via db/migrations/016_users_refresh_token.sql.
// notification-state requires: db/migrations/005_notification_state.sql
// preferences / custom avatar / quiet_time_until require: db/migrations/015_preferences_friend_settings.sql

import { encrypt } from './_crypto.js';
import {
  db, requireUser, signSession, sessionCookie, clearSessionCookie,
  getGoogleAccessToken, googleClientId, googleClientSecret,
} from './_lib.js';

// decodeJwtPayload — base64url payload of a JWT → object, or null. The
// id_token this decodes arrives directly from Google's token endpoint over
// TLS in the same exchange, so per OIDC its signature needn't be re-verified —
// the claims we rely on (aud, iss, sub) are still validated by the caller.
function decodeJwtPayload(jwt) {
  try {
    return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const client = db();
  const op = req.method === 'GET' ? req.query.op : req.body?.op;

  // ── Public auth ops ───────────────────────────────────────────────────────
  if (req.method === 'POST' && op === 'google-auth') {
    const { code, timezone } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    if (!googleClientId() || !googleClientSecret())
      return res.status(500).json({ error: 'Google OAuth is not configured (GOOGLE_CLIENT_SECRET missing)' });

    // Exchange the one-time authorization code (from the GIS popup code
    // client) for tokens. redirect_uri 'postmessage' is the fixed value for
    // popup-mode code flows.
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     googleClientId(),
        client_secret: googleClientSecret(),
        redirect_uri:  'postmessage',
        grant_type:    'authorization_code',
      }),
    });
    if (!tr.ok) {
      const detail = await tr.json().catch(() => ({}));
      console.error('google-auth exchange failed:', tr.status, detail.error ?? '');
      return res.status(401).json({ error: 'Google sign-in failed — please try again' });
    }
    const tokens = await tr.json(); // access_token, expires_in, id_token, refresh_token (first consent)

    const claims = decodeJwtPayload(tokens.id_token);
    const validIss = ['https://accounts.google.com', 'accounts.google.com'];
    if (!claims?.sub || claims.aud !== googleClientId() || !validIss.includes(claims.iss))
      return res.status(401).json({ error: 'Google sign-in failed — invalid identity token' });

    const googleId = String(claims.sub); // equals the legacy userinfo `id`, so existing rows match

    let encryptedToken;
    try {
      encryptedToken = encrypt(tokens.access_token);
    } catch (err) {
      console.error('Encryption error:', err.message);
      return res.status(500).json({ error: 'Token encryption failed — check TOKEN_ENCRYPTION_KEY' });
    }

    // A user-uploaded avatar (migration 015) wins over the Google picture:
    // login must not overwrite picture_url while one is set. Missing column
    // (pre-015) reads as "no custom avatar".
    let hasCustomAvatar = false;
    try {
      const { data: existing } = await client
        .from('users').select('custom_avatar_url').eq('google_id', googleId).maybeSingle();
      hasCustomAvatar = Boolean(existing?.custom_avatar_url);
    } catch {}

    const { data: row, error } = await client.from('users').upsert({
      google_id:    googleId,
      access_token: encryptedToken,
      token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      ...(claims.email   && { email: encrypt(claims.email) }),
      ...(claims.name    && { name: claims.name }),
      ...(claims.picture && !hasCustomAvatar && { picture_url: claims.picture }),
      ...(timezone       && { timezone }),
    }, { onConflict: 'google_id' }).select('id').single();
    if (error || !row) {
      console.error('google-auth upsert error:', error?.message);
      return res.status(500).json({ error: error?.message ?? 'Could not create user' });
    }

    // Google returns a refresh token only on the grant that showed the consent
    // screen — keep any previously stored one otherwise. Separate best-effort
    // update so a pre-016 DB can't fail the sign-in itself.
    if (tokens.refresh_token) {
      try {
        await client.from('users')
          .update({ refresh_token: encrypt(tokens.refresh_token) })
          .eq('id', row.id);
      } catch {}
    }

    res.setHeader('Set-Cookie', sessionCookie(signSession({ userId: row.id, googleId })));
    return res.status(200).json({
      user: {
        googleId,
        name:    claims.name    ?? null,
        email:   claims.email   ?? null,
        picture: claims.picture ?? null,
      },
    });
  }

  if (req.method === 'POST' && op === 'logout') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true });
  }

  // ── Everything below requires a valid session ─────────────────────────────
  const auth = requireUser(req);
  if (!auth) return res.status(401).json({ error: 'Not signed in' });

  // ── GET operations ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (op === 'session') {
      return res.status(200).json({ userId: auth.userId, googleId: auth.googleId });
    }

    // A fresh Google access token for browser-side Calendar/Tasks calls. The
    // refresh token itself never leaves the server; the browser only ever
    // holds short-lived access tokens, exactly as with the old implicit flow.
    if (op === 'google-token') {
      let { data: me, error } = await client
        .from('users').select('id, access_token, token_expiry, refresh_token')
        .eq('id', auth.userId).single();
      // Graceful degrade for deployments that haven't run migration 016 yet.
      if (error) {
        ({ data: me } = await client
          .from('users').select('id, access_token, token_expiry')
          .eq('id', auth.userId).single());
      }
      if (!me) return res.status(404).json({ error: 'User not found' });

      // getGoogleAccessToken updates me.token_expiry in place on refresh.
      const accessToken = await getGoogleAccessToken(client, me);
      if (!accessToken)
        return res.status(401).json({ error: 'Google authorization expired — please sign in again' });
      return res.status(200).json({ accessToken, expiresAt: me.token_expiry ?? null });
    }

    if (op === 'my-id') {
      return res.status(200).json({ id: auth.userId });
    }

    // Editable profile fields for the profile page.
    if (op === 'profile') {
      let { data, error } = await client
        .from('users')
        .select('display_name, show_email, show_phone, phone_number, friend_code, quiet_time_since, quiet_time_until, preferences, custom_avatar_url, picture_url')
        .eq('id', auth.userId)
        .single();
      // Graceful degrade for deployments that haven't run migration 015 / 013 yet.
      if (error) {
        ({ data, error } = await client
          .from('users')
          .select('display_name, show_email, show_phone, phone_number, friend_code, quiet_time_since')
          .eq('id', auth.userId)
          .single());
      }
      if (error) {
        ({ data, error } = await client
          .from('users')
          .select('display_name, show_email, phone_number, friend_code')
          .eq('id', auth.userId)
          .single());
      }
      if (error || !data) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json(data);
    }

    // Notification seen/deleted ids for cross-device sync. Returns empty arrays
    // when no row exists yet (or the table hasn't been migrated) so the client
    // degrades gracefully to localStorage-only behavior.
    if (op === 'notification-state') {
      const { data } = await client
        .from('notification_state')
        .select('seen, dismissed')
        .eq('user_id', auth.userId)
        .single();
      return res.status(200).json({ seen: data?.seen ?? [], dismissed: data?.dismissed ?? [] });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  // ── POST operations ───────────────────────────────────────────────────────
  if (req.method === 'POST') {
    // Replace the stored notification seen/dismissed arrays (last write wins —
    // the client always sends its full merged state, so this is safe).
    if (op === 'notification-state') {
      const { seen, dismissed } = req.body;
      if (!Array.isArray(seen) || !Array.isArray(dismissed))
        return res.status(400).json({ error: 'seen[] and dismissed[] required' });

      const { error } = await client
        .from('notification_state')
        .upsert(
          { user_id: auth.userId, seen, dismissed, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (op === 'update-profile') {
      const { displayName, showEmail, showPhone, phoneNumber, customAvatarUrl, googlePictureUrl } = req.body;

      const { error } = await client
        .from('users')
        .update({
          display_name: displayName  ?? null,
          show_email:   showEmail    ?? true,
          phone_number: phoneNumber  ?? null,
          ...(showPhone !== undefined ? { show_phone: Boolean(showPhone) } : {}),
        })
        .eq('id', auth.userId);

      if (error) {
        console.error('update-profile error:', error.message);
        return res.status(500).json({ error: error.message });
      }

      // Custom avatar (migration 015): written into picture_url too, so every
      // existing read path (friends, groups, messages) shows it without extra
      // joins. Clearing it (null) restores the caller-provided Google picture.
      // Separate best-effort update — a pre-015 DB can't fail the save above.
      if (customAvatarUrl !== undefined) {
        try {
          await client.from('users').update({
            custom_avatar_url: customAvatarUrl ?? null,
            ...(customAvatarUrl
              ? { picture_url: customAvatarUrl }
              : googlePictureUrl ? { picture_url: googlePictureUrl } : {}),
          }).eq('id', auth.userId);
        } catch {}
      }
      return res.status(200).json({ ok: true });
    }

    // Shallow-merge a settings patch into users.preferences (migration 015).
    // Read-modify-write so one device changing the theme can't clobber another
    // device's notification toggles. Returns the merged object.
    if (op === 'preferences') {
      const { patch } = req.body;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch))
        return res.status(400).json({ error: 'patch (object) required' });

      const { data: me, error: meErr } = await client
        .from('users').select('id, preferences').eq('id', auth.userId).single();
      if (meErr || !me) return res.status(404).json({ error: meErr?.message ?? 'User not found' });

      const preferences = { ...(me.preferences ?? {}), ...patch };
      const { error } = await client.from('users').update({ preferences }).eq('id', auth.userId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, preferences });
    }

    // Mint a fresh friend code — for users who shared theirs too widely. The
    // old code stops matching immediately; existing friendships are untouched.
    if (op === 'regenerate-code') {
      // Unambiguous alphabet (no 0/O or 1/I); retry on the unique constraint.
      const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
        const { error } = await client.from('users').update({ friend_code: code }).eq('id', auth.userId);
        if (!error) return res.status(200).json({ ok: true, friendCode: code });
        if (!/unique|duplicate/i.test(error.message)) return res.status(500).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Could not generate a unique code — try again' });
    }

    // Quiet Time toggle — its own op (not part of update-profile) so the
    // notification center's "turn it off" action can't clobber other fields.
    // Turning it on when already on keeps the original timestamp, so the
    // 24-hour reminder can't be reset by re-toggling.
    if (op === 'quiet-time') {
      const { enabled, until } = req.body;
      if (typeof enabled !== 'boolean')
        return res.status(400).json({ error: 'enabled (boolean) required' });

      const { data: me } = await client
        .from('users').select('id, quiet_time_since').eq('id', auth.userId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const quiet_time_since = enabled ? (me.quiet_time_since ?? new Date().toISOString()) : null;
      const { error } = await client.from('users').update({ quiet_time_since }).eq('id', auth.userId);
      if (error) return res.status(500).json({ error: error.message });

      // Optional auto-off (migration 015): while set, Quiet Time expires on its
      // own — enforcement treats a passed `until` as off. Best-effort separate
      // update so a pre-015 DB keeps the plain toggle working.
      const quiet_time_until = enabled && until ? new Date(until).toISOString() : null;
      try {
        await client.from('users').update({ quiet_time_until }).eq('id', auth.userId);
      } catch {}
      return res.status(200).json({ ok: true, quiet_time_since, quiet_time_until });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
