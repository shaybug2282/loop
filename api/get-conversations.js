// Returns the list of distinct conversation partners for the current user,
// with the latest message timestamp for sorting.
// GET ?googleId=<google_id>
// Returns: { conversations: [{ userId, name, display_name, picture_url, lastMessageAt }] }

import { createClient } from '@supabase/supabase-js';
const db = () => createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { googleId } = req.query;
  if (!googleId) return res.status(400).json({ error: 'googleId required' });

  const { data: me, error: meErr } = await db()
    .from('users').select('id').eq('google_id', googleId).single();

  if (meErr || !me) return res.status(404).json({ error: 'User not found' });

  // Fetch all messages involving this user, join with the other participant's profile
  const { data: sent,     error: e1 } = await db()
    .from('messages')
    .select('receiver_id, created_at, other:receiver_id(id, name, display_name, picture_url)')
    .eq('sender_id', me.id)
    .order('created_at', { ascending: false });

  const { data: received, error: e2 } = await db()
    .from('messages')
    .select('sender_id, created_at, other:sender_id(id, name, display_name, picture_url)')
    .eq('receiver_id', me.id)
    .order('created_at', { ascending: false });

  if (e1 || e2) return res.status(500).json({ error: (e1 || e2).message });

  // Merge and de-duplicate by partner id, keeping the most recent message time
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
