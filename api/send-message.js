// Stores an E2E encrypted message between two users.
// The server never sees plaintext — only base64 ciphertext + IV.
// POST body: { senderGoogleId, receiverId, ciphertext, iv }
// Returns: { id, created_at }

import { createClient } from '@supabase/supabase-js';
const db = () => createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { senderGoogleId, receiverId, ciphertext, iv } = req.body ?? {};
  if (!senderGoogleId || !receiverId || !ciphertext || !iv) {
    return res.status(400).json({ error: 'senderGoogleId, receiverId, ciphertext, iv required' });
  }

  const { data: sender, error: senderErr } = await db()
    .from('users').select('id').eq('google_id', senderGoogleId).single();

  if (senderErr || !sender) return res.status(404).json({ error: 'Sender not found' });

  const { data, error } = await db()
    .from('messages')
    .insert({ sender_id: sender.id, receiver_id: receiverId, ciphertext, iv })
    .select('id, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
}
