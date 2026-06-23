// User router — identity sync, profile updates, and ID lookup in one function.
//
// GET  ?op=my-id&googleId=           → internal Supabase UUID for the user
// POST { op:'sync',           ... }  → encrypt token + upsert user row (called on login / token refresh)
// POST { op:'update-profile', ... }  → update display_name, show_email, phone_number

import { encrypt } from './_crypto.js';
import { createClient } from '@supabase/supabase-js';

const db = () => createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
        ...(email      && { email }),
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
