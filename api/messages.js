// Messages router — all messaging and E2E key operations in one function.
//
// GET  ?op=conversation&googleId=&friendId=&since=  → messages between two users
// GET  ?op=conversations&googleId=                  → all conversation partners
// GET  ?op=public-key&userId=                       → ECDH public key for a user
// POST { op:'send',      senderGoogleId, receiverId, payload }
// POST { op:'store-key', googleId, publicKeyJwk }
// POST { op:'delete',    googleId, messageId }       → undo send (within 30s)
// POST { op:'edit',      googleId, messageId, payload } → edit (within 60s)
//
// DB note: messages table requires these columns —
//   payload TEXT,        -- combined "ivB64.ctB64" replaces separate ciphertext/iv
//   edited_at TIMESTAMPTZ
// Migration: ALTER TABLE messages ADD COLUMN IF NOT EXISTS payload TEXT;
//            ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
//            UPDATE messages SET payload = iv || '.' || ciphertext WHERE payload IS NULL;

import { createClient } from '@supabase/supabase-js';

const db = () => createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // ── GET operations ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { op } = req.query;
    const client = db();

    if (op === 'conversation') {
      const { googleId, friendId, since } = req.query;
      if (!googleId || !friendId) return res.status(400).json({ error: 'googleId and friendId required' });

      const { data: me, error: meErr } = await client
        .from('users').select('id').eq('google_id', googleId).single();
      if (meErr || !me) return res.status(404).json({ error: 'User not found' });

      let query = client
        .from('messages')
        // Select both new payload and legacy ciphertext/iv for backwards compat
        .select('id, sender_id, payload, ciphertext, iv, edited_at, created_at')
        .or(
          `and(sender_id.eq.${me.id},receiver_id.eq.${friendId}),` +
          `and(sender_id.eq.${friendId},receiver_id.eq.${me.id})`
        )
        .order('created_at', { ascending: true });

      if (since) query = query.gt('created_at', since);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ messages: data ?? [] });
    }

    if (op === 'conversations') {
      const { googleId } = req.query;
      if (!googleId) return res.status(400).json({ error: 'googleId required' });

      const { data: me, error: meErr } = await client
        .from('users').select('id').eq('google_id', googleId).single();
      if (meErr || !me) return res.status(404).json({ error: 'User not found' });

      const [
        { data: sent,     error: e1 },
        { data: received, error: e2 },
      ] = await Promise.all([
        client.from('messages')
          .select('receiver_id, created_at, other:receiver_id(id, name, display_name, picture_url)')
          .eq('sender_id', me.id).order('created_at', { ascending: false }),
        client.from('messages')
          .select('sender_id, created_at, other:sender_id(id, name, display_name, picture_url)')
          .eq('receiver_id', me.id).order('created_at', { ascending: false }),
      ]);

      if (e1 || e2) return res.status(500).json({ error: (e1 || e2).message });

      const map = new Map();
      for (const row of [...(sent ?? []), ...(received ?? [])]) {
        const partner = row.other;
        if (!partner) continue;
        const existing = map.get(partner.id);
        if (!existing || new Date(row.created_at) > new Date(existing.lastMessageAt)) {
          map.set(partner.id, {
            userId:        partner.id,
            name:          partner.name,
            display_name:  partner.display_name,
            picture_url:   partner.picture_url,
            lastMessageAt: row.created_at,
          });
        }
      }

      const conversations = Array.from(map.values())
        .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

      return res.status(200).json({ conversations });
    }

    if (op === 'public-key') {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: 'userId required' });

      const { data, error } = await client
        .from('users').select('public_key').eq('id', userId).single();
      if (error || !data?.public_key) return res.status(404).json({ error: 'Public key not found' });
      return res.status(200).json({ publicKeyJwk: JSON.parse(data.public_key) });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  // ── POST operations ───────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { op } = req.body ?? {};
    const client = db();

    if (op === 'send') {
      const { senderGoogleId, receiverId, payload } = req.body;
      if (!senderGoogleId || !receiverId || !payload)
        return res.status(400).json({ error: 'senderGoogleId, receiverId, payload required' });

      const { data: sender, error: senderErr } = await client
        .from('users').select('id').eq('google_id', senderGoogleId).single();
      if (senderErr || !sender) return res.status(404).json({ error: 'Sender not found' });

      const { data, error } = await client
        .from('messages')
        .insert({ sender_id: sender.id, receiver_id: receiverId, payload })
        .select('id, created_at')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (op === 'store-key') {
      const { googleId, publicKeyJwk } = req.body;
      if (!googleId || !publicKeyJwk) return res.status(400).json({ error: 'googleId and publicKeyJwk required' });

      const { error } = await client
        .from('users')
        .update({ public_key: JSON.stringify(publicKeyJwk) })
        .eq('google_id', googleId);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // Undo send — hard delete within 30 seconds of sending
    if (op === 'delete') {
      const { googleId, messageId } = req.body;
      if (!googleId || !messageId) return res.status(400).json({ error: 'googleId and messageId required' });

      const { data: me } = await client.from('users').select('id').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const { data: msg } = await client.from('messages')
        .select('id, created_at').eq('id', messageId).eq('sender_id', me.id).single();
      if (!msg) return res.status(404).json({ error: 'Message not found or not yours' });

      if (Date.now() - new Date(msg.created_at).getTime() > 30_000)
        return res.status(403).json({ error: 'Undo window expired (30 seconds)' });

      const { error } = await client.from('messages').delete().eq('id', messageId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // Edit message — re-encrypt and store within 60 seconds of sending
    if (op === 'edit') {
      const { googleId, messageId, payload } = req.body;
      if (!googleId || !messageId || !payload) return res.status(400).json({ error: 'googleId, messageId, payload required' });

      const { data: me } = await client.from('users').select('id').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const { data: msg } = await client.from('messages')
        .select('id, created_at').eq('id', messageId).eq('sender_id', me.id).single();
      if (!msg) return res.status(404).json({ error: 'Message not found or not yours' });

      if (Date.now() - new Date(msg.created_at).getTime() > 60_000)
        return res.status(403).json({ error: 'Edit window expired (60 seconds)' });

      const { error } = await client.from('messages')
        .update({ payload, edited_at: new Date().toISOString() })
        .eq('id', messageId);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
