// Updates editable profile fields for the authenticated user.
// POST body: { googleId, displayName, showEmail, phoneNumber }
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

  const { googleId, displayName, showEmail, phoneNumber } = req.body ?? {};
  if (!googleId) return res.status(400).json({ error: 'googleId is required' });

  const db = supabaseAdmin();

  const { error } = await db
    .from('users')
    .update({
      display_name:  displayName  ?? null,
      show_email:    showEmail    ?? true,
      phone_number:  phoneNumber  ?? null,
    })
    .eq('google_id', googleId);

  if (error) {
    console.error('update-profile error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
