import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Returns null when env vars are missing — callers check for this before use.
const supabase = url && key ? createClient(url, key) : null;

export default supabase;
