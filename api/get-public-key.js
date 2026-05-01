// Fetches a user's ECDH public key by their internal UUID.
// GET ?userId=<uuid>
// Returns: { publicKeyJwk } or { error }

import { createClient } from '@supabase/supabase-js';
const db = () => createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const { data, error } = await db()
    .from('users')
    .select('public_key')
    .eq('id', userId)
    .single();

  if (error || !data?.public_key) return res.status(404).json({ error: 'Public key not found' });
  return res.status(200).json({ publicKeyJwk: JSON.parse(data.public_key) });
}
