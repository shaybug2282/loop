// Returns encrypted messages between two users, ordered by created_at.
// The client decrypts each message locally — server only returns ciphertext.
// GET ?googleId=<google_id>&friendId=<uuid>&since=<ISO timestamp (optional)>
// Returns: { messages: [{ id, sender_id, ciphertext, iv, created_at }] }

import { createClient } from '@supabase/supabase-js';
const db = () => createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { googleId, friendId, since } = req.query;
  if (!googleId || !friendId) return res.status(400).json({ error: 'googleId and friendId required' });

  const { data: me, error: meErr } = await db()
    .from('users').select('id').eq('google_id', googleId).single();

  if (meErr || !me) return res.status(404).json({ error: 'User not found' });

  let query = db()
    .from('messages')
    .select('id, sender_id, ciphertext, iv, created_at')
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
