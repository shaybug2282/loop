// Messages router — all messaging and E2E key operations in one function.
// Every op is session-gated (identity from the cookie via requireUser).
//
// GET  ?op=conversation&friendId=  → messages between the caller and a friend
// GET  ?op=conversations           → all conversation partners
// GET  ?op=public-key&userId=      → ECDH public key for a user
// POST { op:'send',      receiverId, ciphertext, iv }
// POST { op:'store-key', publicKeyJwk }
// POST { op:'delete',    messageId }                → undo send (within 30s)
// POST { op:'edit',      messageId, ciphertext, iv } → edit (within 60s)
//
// DB: uses the existing ciphertext TEXT and iv TEXT columns.
// Edit feature requires one additional column (run once in Supabase SQL editor):
//   ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

import { db, requireUser } from './_lib.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Identity comes from the session cookie only — googleId params are ignored.
  const auth = requireUser(req);
  if (!auth) return res.status(401).json({ error: 'Not signed in' });

  // ── GET operations ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { op } = req.query;
    const client = db();

    if (op === 'conversation') {
      const { friendId } = req.query;
      if (!friendId) return res.status(400).json({ error: 'friendId required' });

      const me = { id: auth.userId };

      const { data, error } = await client
        .from('messages')
        .select('id, sender_id, ciphertext, iv, created_at')
        .or(
          `and(sender_id.eq.${me.id},receiver_id.eq.${friendId}),` +
          `and(sender_id.eq.${friendId},receiver_id.eq.${me.id})`
        )
        .order('created_at', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ messages: data ?? [] });
    }

    if (op === 'conversations') {
      const me = { id: auth.userId };

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
      const { receiverId, ciphertext, iv } = req.body;
      if (!receiverId || !ciphertext || !iv)
        return res.status(400).json({ error: 'receiverId, ciphertext, iv required' });

      const sender = { id: auth.userId };

      // Blocks (migration 015) stop DMs in both directions. Missing table
      // reads as "not blocked" so pre-015 deployments keep working.
      try {
        const { data: blockRows } = await client.from('blocks')
          .select('blocker_id')
          .or(`and(blocker_id.eq.${sender.id},blocked_id.eq.${receiverId}),` +
              `and(blocker_id.eq.${receiverId},blocked_id.eq.${sender.id})`);
        if ((blockRows ?? []).length)
          return res.status(403).json({ error: 'You can no longer message this user' });
      } catch {}

      const { data, error } = await client
        .from('messages')
        .insert({ sender_id: sender.id, receiver_id: receiverId, ciphertext, iv })
        .select('id, created_at')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (op === 'store-key') {
      const { publicKeyJwk } = req.body;
      if (!publicKeyJwk) return res.status(400).json({ error: 'publicKeyJwk required' });

      const { error } = await client
        .from('users')
        .update({ public_key: JSON.stringify(publicKeyJwk) })
        .eq('id', auth.userId);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // Undo send — hard delete within 30 seconds
    if (op === 'delete') {
      const { messageId } = req.body;
      if (!messageId) return res.status(400).json({ error: 'messageId required' });

      const me = { id: auth.userId };

      const { data: msg } = await client.from('messages')
        .select('id, created_at').eq('id', messageId).eq('sender_id', me.id).single();
      if (!msg) return res.status(404).json({ error: 'Message not found or not yours' });

      if (Date.now() - new Date(msg.created_at).getTime() > 30_000)
        return res.status(403).json({ error: 'Undo window expired (30 seconds)' });

      const { error } = await client.from('messages').delete().eq('id', messageId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // Edit message — re-encrypt within 60 seconds
    // Requires: ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
    if (op === 'edit') {
      const { messageId, ciphertext, iv } = req.body;
      if (!messageId || !ciphertext || !iv)
        return res.status(400).json({ error: 'messageId, ciphertext, iv required' });

      const me = { id: auth.userId };

      const { data: msg } = await client.from('messages')
        .select('id, created_at').eq('id', messageId).eq('sender_id', me.id).single();
      if (!msg) return res.status(404).json({ error: 'Message not found or not yours' });

      if (Date.now() - new Date(msg.created_at).getTime() > 60_000)
        return res.status(403).json({ error: 'Edit window expired (60 seconds)' });

      // Try to set edited_at; if the column doesn't exist yet, update content only.
      let { error } = await client.from('messages')
        .update({ ciphertext, iv, edited_at: new Date().toISOString() })
        .eq('id', messageId);

      if (error?.message?.includes('edited_at')) {
        // Column not yet added — update content without the timestamp
        ({ error } = await client.from('messages')
          .update({ ciphertext, iv })
          .eq('id', messageId));
      }

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
