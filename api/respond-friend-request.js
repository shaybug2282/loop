// Accepts or rejects a pending friend request.
// On accept: marks request as accepted and inserts both directions into friendships.
// POST body: { googleId, requestId, action: 'accept' | 'reject' }
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

  const { googleId, requestId, action } = req.body ?? {};
  if (!googleId || !requestId || !['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'googleId, requestId, and action (accept|reject) are required' });
  }

  const db = supabaseAdmin();

  // Resolve receiver's internal UUID
  const { data: me, error: meErr } = await db
    .from('users')
    .select('id')
    .eq('google_id', googleId)
    .single();

  if (meErr || !me) return res.status(404).json({ error: 'User not found' });

  // Fetch the request and verify this user is the intended receiver
  const { data: request, error: reqErr } = await db
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status')
    .eq('id', requestId)
    .eq('receiver_id', me.id)
    .single();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: 'Request already resolved' });

  // Update request status
  const { error: updateErr } = await db
    .from('friend_requests')
    .update({ status: action === 'accept' ? 'accepted' : 'rejected' })
    .eq('id', requestId);

  if (updateErr) {
    console.error('update request error:', updateErr.message);
    return res.status(500).json({ error: updateErr.message });
  }

  // On accept: write both directions into friendships for symmetric lookup
  if (action === 'accept') {
    const { error: friendErr } = await db
      .from('friendships')
      .upsert([
        { user_id: me.id,             friend_id: request.sender_id },
        { user_id: request.sender_id, friend_id: me.id },
      ], { onConflict: 'user_id,friend_id', ignoreDuplicates: true });

    if (friendErr) {
      console.error('friendships insert error:', friendErr.message);
      return res.status(500).json({ error: friendErr.message });
    }
  }

  return res.status(200).json({ ok: true });
}
