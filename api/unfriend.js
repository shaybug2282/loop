// Removes the friendship between two users (both directions).
// POST body: { googleId, friendUserId }
// Returns: { ok: true }

import { createClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { googleId, friendUserId } = req.body ?? {};
  if (!googleId || !friendUserId) {
    return res.status(400).json({ error: 'googleId and friendUserId are required' });
  }

  const db = supabaseAdmin();

  const { data: me, error: meErr } = await db
    .from('users')
    .select('id')
    .eq('google_id', googleId)
    .single();

  if (meErr || !me) return res.status(404).json({ error: 'User not found' });

  // Delete both directions of the friendship
  const { error } = await db
    .from('friendships')
    .delete()
    .or(
      `and(user_id.eq.${me.id},friend_id.eq.${friendUserId}),` +
      `and(user_id.eq.${friendUserId},friend_id.eq.${me.id})`
    );

  if (error) {
    console.error('unfriend error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
