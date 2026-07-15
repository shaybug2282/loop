// User router — identity sync, profile updates, and ID lookup in one function.
//
// GET  ?op=my-id&googleId=                → internal Supabase UUID for the user
// GET  ?op=profile&googleId=              → display_name, show_email, show_phone, phone_number, friend_code,
//                                           quiet_time_since/until, preferences, custom_avatar_url
// GET  ?op=notification-state&googleId=   → { seen[], dismissed[] } notification ids
// POST { op:'sync',               ... }   → encrypt token + upsert user row (called on login / token refresh)
// POST { op:'update-profile',     ... }   → update display_name, show_email, show_phone, phone_number, custom avatar
// POST { op:'preferences', googleId, patch } → shallow-merge patch into users.preferences (theme, accent,
//                                           notification toggles, availabilitySharing, quietHours)
// POST { op:'quiet-time', googleId, enabled, until? } → toggle Quiet Time (while on, nobody can schedule
//                                           this user; optional auto-off timestamp)
// POST { op:'regenerate-code', googleId } → mint a fresh friend code (old one stops working)
// POST { op:'notification-state', ... }   → replace stored seen/dismissed arrays
//
// notification-state requires: db/migrations/005_notification_state.sql
// preferences / custom avatar / quiet_time_until require: db/migrations/015_preferences_friend_settings.sql

import { encrypt } from './_crypto.js';
import { db } from './_lib.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // ── GET operations ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { op, googleId } = req.query;

    if (op === 'my-id') {
      if (!googleId) return res.status(400).json({ error: 'googleId required' });

      const { data, error } = await db()
        .from('users').select('id').eq('google_id', googleId).single();
      if (error || !data) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json({ id: data.id });
    }

    // Editable profile fields for the profile page. Replaces the old direct
    // anon-key Supabase read so all data access goes through the API layer.
    if (op === 'profile') {
      if (!googleId) return res.status(400).json({ error: 'googleId required' });

      let { data, error } = await db()
        .from('users')
        .select('display_name, show_email, show_phone, phone_number, friend_code, quiet_time_since, quiet_time_until, preferences, custom_avatar_url, picture_url')
        .eq('google_id', googleId)
        .single();
      // Graceful degrade for deployments that haven't run migration 015 / 013 yet.
      if (error) {
        ({ data, error } = await db()
          .from('users')
          .select('display_name, show_email, show_phone, phone_number, friend_code, quiet_time_since')
          .eq('google_id', googleId)
          .single());
      }
      if (error) {
        ({ data, error } = await db()
          .from('users')
          .select('display_name, show_email, phone_number, friend_code')
          .eq('google_id', googleId)
          .single());
      }
      if (error || !data) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json(data);
    }

    // Notification seen/deleted ids for cross-device sync. Returns empty arrays
    // when no row exists yet (or the table hasn't been migrated) so the client
    // degrades gracefully to localStorage-only behavior.
    if (op === 'notification-state') {
      if (!googleId) return res.status(400).json({ error: 'googleId required' });

      const client = db();
      const { data: me } = await client
        .from('users').select('id').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const { data } = await client
        .from('notification_state')
        .select('seen, dismissed')
        .eq('user_id', me.id)
        .single();
      return res.status(200).json({ seen: data?.seen ?? [], dismissed: data?.dismissed ?? [] });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  // ── POST operations ───────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { op } = req.body ?? {};
    const client = db();

    if (op === 'sync') {
      const { googleId, accessToken, expiresIn, email, name, pictureUrl, timezone } = req.body;
      if (!googleId || !accessToken)
        return res.status(400).json({ error: 'googleId and accessToken are required' });

      let encryptedToken;
      try {
        encryptedToken = encrypt(accessToken);
      } catch (err) {
        console.error('Encryption error:', err.message);
        return res.status(500).json({ error: 'Token encryption failed — check TOKEN_ENCRYPTION_KEY' });
      }

      // A user-uploaded avatar (migration 015) wins over the Google picture:
      // login sync must not overwrite picture_url while one is set. Missing
      // column (pre-015) reads as "no custom avatar".
      let hasCustomAvatar = false;
      try {
        const { data: existing } = await client
          .from('users').select('custom_avatar_url').eq('google_id', googleId).maybeSingle();
        hasCustomAvatar = Boolean(existing?.custom_avatar_url);
      } catch {}

      const expiryTs = new Date(Date.now() + (expiresIn || 3600) * 1000).toISOString();
      const payload = {
        google_id:    googleId,
        access_token: encryptedToken,
        token_expiry: expiryTs,
        ...(email      && { email: encrypt(email) }),
        ...(name       && { name }),
        ...(pictureUrl && !hasCustomAvatar && { picture_url: pictureUrl }),
        ...(timezone   && { timezone }),
      };

      const { error } = await client.from('users').upsert(payload, { onConflict: 'google_id' });
      if (error) {
        console.error('Supabase upsert error:', error.message);
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ ok: true });
    }

    // Replace the stored notification seen/dismissed arrays (last write wins —
    // the client always sends its full merged state, so this is safe).
    if (op === 'notification-state') {
      const { googleId, seen, dismissed } = req.body;
      if (!googleId || !Array.isArray(seen) || !Array.isArray(dismissed))
        return res.status(400).json({ error: 'googleId, seen[], dismissed[] required' });

      const { data: me } = await client
        .from('users').select('id').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const { error } = await client
        .from('notification_state')
        .upsert(
          { user_id: me.id, seen, dismissed, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (op === 'update-profile') {
      const { googleId, displayName, showEmail, showPhone, phoneNumber, customAvatarUrl, googlePictureUrl } = req.body;
      if (!googleId) return res.status(400).json({ error: 'googleId is required' });

      const { error } = await client
        .from('users')
        .update({
          display_name: displayName  ?? null,
          show_email:   showEmail    ?? true,
          phone_number: phoneNumber  ?? null,
          ...(showPhone !== undefined ? { show_phone: Boolean(showPhone) } : {}),
        })
        .eq('google_id', googleId);

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
          }).eq('google_id', googleId);
        } catch {}
      }
      return res.status(200).json({ ok: true });
    }

    // Shallow-merge a settings patch into users.preferences (migration 015).
    // Read-modify-write so one device changing the theme can't clobber another
    // device's notification toggles. Returns the merged object.
    if (op === 'preferences') {
      const { googleId, patch } = req.body;
      if (!googleId || !patch || typeof patch !== 'object' || Array.isArray(patch))
        return res.status(400).json({ error: 'googleId and patch (object) required' });

      const { data: me, error: meErr } = await client
        .from('users').select('id, preferences').eq('google_id', googleId).single();
      if (meErr || !me) return res.status(404).json({ error: meErr?.message ?? 'User not found' });

      const preferences = { ...(me.preferences ?? {}), ...patch };
      const { error } = await client.from('users').update({ preferences }).eq('id', me.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, preferences });
    }

    // Mint a fresh friend code — for users who shared theirs too widely. The
    // old code stops matching immediately; existing friendships are untouched.
    if (op === 'regenerate-code') {
      const { googleId } = req.body;
      if (!googleId) return res.status(400).json({ error: 'googleId required' });

      const { data: me } = await client.from('users').select('id').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      // Unambiguous alphabet (no 0/O or 1/I); retry on the unique constraint.
      const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
        const { error } = await client.from('users').update({ friend_code: code }).eq('id', me.id);
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
      const { googleId, enabled, until } = req.body;
      if (!googleId || typeof enabled !== 'boolean')
        return res.status(400).json({ error: 'googleId and enabled (boolean) required' });

      const { data: me } = await client
        .from('users').select('id, quiet_time_since').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const quiet_time_since = enabled ? (me.quiet_time_since ?? new Date().toISOString()) : null;
      const { error } = await client.from('users').update({ quiet_time_since }).eq('id', me.id);
      if (error) return res.status(500).json({ error: error.message });

      // Optional auto-off (migration 015): while set, Quiet Time expires on its
      // own — enforcement treats a passed `until` as off. Best-effort separate
      // update so a pre-015 DB keeps the plain toggle working.
      const quiet_time_until = enabled && until ? new Date(until).toISOString() : null;
      try {
        await client.from('users').update({ quiet_time_until }).eq('id', me.id);
      } catch {}
      return res.status(200).json({ ok: true, quiet_time_since, quiet_time_until });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
