// Stores or updates a user's ECDH public key (JWK JSON) used for E2E message encryption.
// POST body: { googleId, publicKeyJwk }
// Returns: { ok: true }

import { createClient } from '@supabase/supabase-js';
const db = () => createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { googleId, publicKeyJwk } = req.body ?? {};
  if (!googleId || !publicKeyJwk) return res.status(400).json({ error: 'googleId and publicKeyJwk required' });

  const { error } = await db()
    .from('users')
    .update({ public_key: JSON.stringify(publicKeyJwk) })
    .eq('google_id', googleId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
