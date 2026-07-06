// Shared helpers for all API routers.
//
// Files prefixed with "_" in api/ are NOT deployed as Vercel serverless
// functions — they are plain modules imported by the routers (same convention
// as _crypto.js).

import { createClient } from '@supabase/supabase-js';
import { decrypt } from './_crypto.js';

// db — Supabase client with the service-role key (bypasses RLS).
// Server-only: this key must never reach the browser bundle.
export const db = () => createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// safeDecrypt — decrypt a column value, falling back to the raw value for
// rows written before encryption-at-rest was introduced.
export function safeDecrypt(val) {
  if (!val) return val;
  try { return decrypt(val); } catch { return val; }
}

// resolveUser — googleId → user row, selecting only the given columns.
// Returns null when the user doesn't exist.
export async function resolveUser(client, googleId, columns = 'id') {
  const { data } = await client
    .from('users')
    .select(columns)
    .eq('google_id', googleId)
    .single();
  return data ?? null;
}
