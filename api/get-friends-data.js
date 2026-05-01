// Returns the current user's friend code, incoming pending requests, outgoing pending requests,
// and confirmed friends (with profile fields needed for the contact card).
// GET ?googleId=<google_id>
// Returns: { friendCode, requests, sentRequests, friends }

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

  // Run all three queries in parallel
  const [
    { data: requests,     error: reqErr },
    { data: sentReqs,     error: sentErr },
    { data: friendships,  error: friendErr },
  ] = await Promise.all([
    // Incoming pending requests
    db.from('friend_requests')
      .select('id, created_at, sender:sender_id(id, name, display_name, email, picture_url)')
      .eq('receiver_id', me.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),

    // Outgoing pending requests
    db.from('friend_requests')
      .select('id, created_at, receiver:receiver_id(id, name, display_name, email, picture_url)')
      .eq('sender_id', me.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),

    // Confirmed friends — include all profile fields for the contact card
    db.from('friendships')
      .select('friend:friend_id(id, name, display_name, email, show_email, phone_number, picture_url, friend_code)')
      .eq('user_id', me.id)
      .order('created_at', { ascending: true }),
  ]);

  if (reqErr)    { console.error('requests error:',    reqErr.message); return res.status(500).json({ error: reqErr.message }); }
  if (sentErr)   { console.error('sentReqs error:',   sentErr.message); return res.status(500).json({ error: sentErr.message }); }
  if (friendErr) { console.error('friendships error:', friendErr.message); return res.status(500).json({ error: friendErr.message }); }

  return res.status(200).json({
    friendCode:   me.friend_code,
    requests:     requests   ?? [],
    sentRequests: sentReqs   ?? [],
    friends:      (friendships ?? []).map(f => f.friend),
  });
}
