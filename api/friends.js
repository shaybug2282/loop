// Friends router — all friendship operations in one function.
//
// GET  ?op=data&googleId=       → friend code, pending requests, sent requests, friends list
// POST { op:'send',    ... }    → send a friend request by friend code
// POST { op:'respond', ... }    → accept or reject an incoming request
// POST { op:'unfriend', ... }   → remove friendship (both directions)

import { db, safeDecrypt } from './_lib.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // ── GET operations ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { op, googleId } = req.query;
    if (!googleId) return res.status(400).json({ error: 'googleId is required' });

    if (op === 'data') {
      const client = db();
      const { data: me, error: meErr } = await client
        .from('users').select('id, friend_code').eq('google_id', googleId).single();
      if (meErr || !me) return res.status(404).json({ error: 'User not found' });

      const friendCols = (withPhoneToggle) =>
        `friend:friend_id(id, name, display_name, email, show_email, ${withPhoneToggle ? 'show_phone, ' : ''}phone_number, picture_url, friend_code)`;

      let [
        { data: requests,    error: reqErr },
        { data: sentReqs,    error: sentErr },
        { data: friendships, error: friendErr },
      ] = await Promise.all([
        client.from('friend_requests')
          .select('id, created_at, sender:sender_id(id, name, display_name, email, show_email, picture_url)')
          .eq('receiver_id', me.id).eq('status', 'pending').order('created_at', { ascending: false }),
        client.from('friend_requests')
          .select('id, created_at, receiver:receiver_id(id, name, display_name, email, show_email, picture_url)')
          .eq('sender_id', me.id).eq('status', 'pending').order('created_at', { ascending: false }),
        client.from('friendships')
          .select(friendCols(true))
          .eq('user_id', me.id).order('created_at', { ascending: true }),
      ]);

      // Graceful degrade for deployments without migration 013 (no show_phone).
      if (friendErr) {
        ({ data: friendships, error: friendErr } = await client.from('friendships')
          .select(friendCols(false))
          .eq('user_id', me.id).order('created_at', { ascending: true }));
      }

      if (reqErr)    return res.status(500).json({ error: reqErr.message });
      if (sentErr)   return res.status(500).json({ error: sentErr.message });
      if (friendErr) return res.status(500).json({ error: friendErr.message });

      // Privacy is enforced HERE, not in the client: email/phone leave the
      // server only when the owner's visibility toggle allows it.
      const mask = u => u ? {
        ...u,
        email:        u.show_email ? safeDecrypt(u.email) : null,
        phone_number: (u.show_phone ?? true) ? (u.phone_number ?? null) : null,
      } : u;

      return res.status(200).json({
        friendCode:   me.friend_code,
        requests:     (requests   ?? []).map(r => ({ ...r, sender:   mask(r.sender) })),
        sentRequests: (sentReqs   ?? []).map(r => ({ ...r, receiver: mask(r.receiver) })),
        friends:      (friendships ?? []).map(f => mask(f.friend)),
      });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  // ── POST operations ───────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { op } = req.body ?? {};
    const client = db();

    // send a friend request by friend code
    if (op === 'send') {
      const { senderGoogleId, friendCode } = req.body;
      if (!senderGoogleId || !friendCode)
        return res.status(400).json({ error: 'senderGoogleId and friendCode are required' });

      const { data: sender, error: sErr } = await client
        .from('users').select('id').eq('google_id', senderGoogleId).single();
      if (sErr || !sender) return res.status(404).json({ error: 'Sender account not found' });

      const { data: receiver, error: rErr } = await client
        .from('users').select('id').eq('friend_code', friendCode.trim().toUpperCase()).single();
      if (rErr || !receiver) return res.status(404).json({ error: 'No user found with that friend code' });

      if (sender.id === receiver.id)
        return res.status(400).json({ error: 'You cannot add yourself as a friend' });

      const { data: existing } = await client
        .from('friendships').select('user_id')
        .eq('user_id', sender.id).eq('friend_id', receiver.id).maybeSingle();
      if (existing) return res.status(400).json({ error: 'You are already friends with this user' });

      const { error: insertErr } = await client.from('friend_requests')
        .upsert({ sender_id: sender.id, receiver_id: receiver.id, status: 'pending' },
          { onConflict: 'sender_id,receiver_id', ignoreDuplicates: false });
      if (insertErr) return res.status(500).json({ error: insertErr.message });

      return res.status(200).json({ ok: true });
    }

    // accept or reject a friend request
    if (op === 'respond') {
      const { googleId, requestId, action } = req.body;
      if (!googleId || !requestId || !['accept', 'reject'].includes(action))
        return res.status(400).json({ error: 'googleId, requestId, and action (accept|reject) are required' });

      const { data: me, error: meErr } = await client
        .from('users').select('id').eq('google_id', googleId).single();
      if (meErr || !me) return res.status(404).json({ error: 'User not found' });

      const { data: request, error: reqErr } = await client
        .from('friend_requests').select('id, sender_id, receiver_id, status')
        .eq('id', requestId).eq('receiver_id', me.id).single();
      if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
      if (request.status !== 'pending') return res.status(400).json({ error: 'Request already resolved' });

      const { error: updateErr } = await client.from('friend_requests')
        .update({ status: action === 'accept' ? 'accepted' : 'rejected' }).eq('id', requestId);
      if (updateErr) return res.status(500).json({ error: updateErr.message });

      if (action === 'accept') {
        const { error: friendErr } = await client.from('friendships').upsert([
          { user_id: me.id,             friend_id: request.sender_id },
          { user_id: request.sender_id, friend_id: me.id },
        ], { onConflict: 'user_id,friend_id', ignoreDuplicates: true });
        if (friendErr) return res.status(500).json({ error: friendErr.message });
      }

      return res.status(200).json({ ok: true });
    }

    // remove friendship (both directions)
    if (op === 'unfriend') {
      const { googleId, friendUserId } = req.body;
      if (!googleId || !friendUserId)
        return res.status(400).json({ error: 'googleId and friendUserId are required' });

      const { data: me, error: meErr } = await client
        .from('users').select('id').eq('google_id', googleId).single();
      if (meErr || !me) return res.status(404).json({ error: 'User not found' });

      const { error } = await client.from('friendships').delete().or(
        `and(user_id.eq.${me.id},friend_id.eq.${friendUserId}),` +
        `and(user_id.eq.${friendUserId},friend_id.eq.${me.id})`
      );
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
