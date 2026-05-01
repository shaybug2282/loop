// Returns the internal Supabase UUID for the authenticated user.
// Used by MessagesPage to know which message sender_id belongs to "me".
// GET ?googleId=<google_id>
// Returns: { id }

import { createClient } from '@supabase/supabase-js';
const db = () => createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { googleId } = req.query;
  if (!googleId) return res.status(400).json({ error: 'googleId required' });

  const { data, error } = await db()
    .from('users').select('id').eq('google_id', googleId).single();

  if (error || !data) return res.status(404).json({ error: 'User not found' });
  return res.status(200).json({ id: data.id });
}
