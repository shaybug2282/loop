// Returns the current user's friend code, incoming pending requests, and confirmed friends.
// GET ?googleId=<google_id>
// Returns: { friendCode, requests: [...], friends: [...] }

import { createClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { googleId } = req.query;
  if (!googleId) return res.status(400).json({ error: 'googleId is required' });

  const db = supabaseAdmin();

  // Resolve current user
  const { data: me, error: meErr } = await db
    .from('users')
    .select('id, friend_code')
    .eq('google_id', googleId)
    .single();

  if (meErr || !me) return res.status(404).json({ error: 'User not found' });

  // Incoming pending requests with sender info
  const { data: requests, error: reqErr } = await db
    .from('friend_requests')
    .select('id, created_at, sender:sender_id(id, name, email, picture_url)')
    .eq('receiver_id', me.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (reqErr) {
    console.error('get requests error:', reqErr.message);
    return res.status(500).json({ error: reqErr.message });
  }

  // Confirmed friends
  const { data: friendships, error: friendErr } = await db
    .from('friendships')
    .select('friend:friend_id(id, name, email, picture_url, friend_code)')
    .eq('user_id', me.id)
    .order('created_at', { ascending: true });

  if (friendErr) {
    console.error('get friendships error:', friendErr.message);
    return res.status(500).json({ error: friendErr.message });
  }

  return res.status(200).json({
    friendCode: me.friend_code,
    requests: requests ?? [],
    friends: (friendships ?? []).map(f => f.friend),
  });
}
