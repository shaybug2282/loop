// User router — identity sync, profile updates, and ID lookup in one function.
//
// GET  ?op=my-id&googleId=                → internal Supabase UUID for the user
// GET  ?op=profile&googleId=              → display_name, show_email, phone_number
// GET  ?op=notification-state&googleId=   → { seen[], dismissed[] } notification ids
// POST { op:'sync',               ... }   → encrypt token + upsert user row (called on login / token refresh)
// POST { op:'update-profile',     ... }   → update display_name, show_email, phone_number
// POST { op:'notification-state', ... }   → replace stored seen/dismissed arrays
//
// notification-state requires: db/migrations/005_notification_state.sql

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

      const { data, error } = await db()
        .from('users')
        .select('display_name, show_email, phone_number')
        .eq('google_id', googleId)
        .single();
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

      const expiryTs = new Date(Date.now() + (expiresIn || 3600) * 1000).toISOString();
      const payload = {
        google_id:    googleId,
        access_token: encryptedToken,
        token_expiry: expiryTs,
        ...(email      && { email: encrypt(email) }),
        ...(name       && { name }),
        ...(pictureUrl && { picture_url: pictureUrl }),
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
      const { googleId, displayName, showEmail, phoneNumber } = req.body;
      if (!googleId) return res.status(400).json({ error: 'googleId is required' });

      const { error } = await client
        .from('users')
        .update({
          display_name: displayName  ?? null,
          show_email:   showEmail    ?? true,
          phone_number: phoneNumber  ?? null,
        })
        .eq('google_id', googleId);

      if (error) {
        console.error('update-profile error:', error.message);
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
