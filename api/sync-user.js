// Receives user identity + access token from the client after Google sign-in or silent refresh.
// Encrypts the token server-side with AES-256-GCM before writing to Supabase,
// so the plaintext token never touches the database and the encryption key stays server-only.
//
// Expected POST body: { googleId, accessToken, expiresIn, email?, name?, pictureUrl?, timezone? }
// Returns: { ok: true } on success.

import { encrypt } from './_crypto.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { googleId, accessToken, expiresIn, email, name, pictureUrl, timezone } = req.body ?? {};

  if (!googleId || !accessToken) {
    return res.status(400).json({ error: 'googleId and accessToken are required' });
  }

  let encryptedToken;
  try {
    encryptedToken = encrypt(accessToken);
  } catch (err) {
    console.error('Encryption error:', err.message);
    return res.status(500).json({ error: 'Token encryption failed — check TOKEN_ENCRYPTION_KEY' });
  }

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
  );

  const expiryTs = new Date(Date.now() + (expiresIn || 3600) * 1000).toISOString();

  // Build the upsert payload — only include identity fields when provided (login vs. refresh)
  const payload = {
    google_id: googleId,
    access_token: encryptedToken,
    token_expiry: expiryTs,
    ...(email      && { email }),
    ...(name       && { name }),
    ...(pictureUrl && { picture_url: pictureUrl }),
    ...(timezone   && { timezone }),
  };

  const { error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'google_id' });

  if (error) {
    console.error('Supabase upsert error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
