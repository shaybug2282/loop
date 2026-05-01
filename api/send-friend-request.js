// Looks up a user by friend_code and creates a pending friend request.
// POST body: { senderGoogleId, friendCode }
// Returns: { ok: true } or { error: string }

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

  const { senderGoogleId, friendCode } = req.body ?? {};
  if (!senderGoogleId || !friendCode) {
    return res.status(400).json({ error: 'senderGoogleId and friendCode are required' });
  }

  const db = supabaseAdmin();

  // Resolve sender's internal UUID
  const { data: sender, error: senderErr } = await db
    .from('users')
    .select('id')
    .eq('google_id', senderGoogleId)
    .single();

  if (senderErr || !sender) {
    return res.status(404).json({ error: 'Sender account not found' });
  }

  // Resolve receiver by friend code
  const { data: receiver, error: receiverErr } = await db
    .from('users')
    .select('id')
    .eq('friend_code', friendCode.trim().toUpperCase())
    .single();

  if (receiverErr || !receiver) {
    return res.status(404).json({ error: 'No user found with that friend code' });
  }

  if (sender.id === receiver.id) {
    return res.status(400).json({ error: 'You cannot add yourself as a friend' });
  }

  // Check not already friends
  const { data: existing } = await db
    .from('friendships')
    .select('user_id')
    .eq('user_id', sender.id)
    .eq('friend_id', receiver.id)
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: 'You are already friends with this user' });
  }

  // Insert request — ignore conflict if one already exists
  const { error: insertErr } = await db
    .from('friend_requests')
    .upsert({ sender_id: sender.id, receiver_id: receiver.id, status: 'pending' }, {
      onConflict: 'sender_id,receiver_id',
      ignoreDuplicates: false,
    });

  if (insertErr) {
    console.error('friend_requests insert error:', insertErr.message);
    return res.status(500).json({ error: insertErr.message });
  }

  return res.status(200).json({ ok: true });
}
