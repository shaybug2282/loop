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

// ── Anthropic helpers (shared by api/ai.js and api/_profiles.js) ──────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// callModel — single entry point to the Anthropic Messages API.
// in:  { model, system, messages, maxTokens? }. out: assistant reply string.
export async function callModel({ model, system, messages, maxTokens = 1024 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system:   [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`AI error (${r.status}): ${err.error?.message ?? 'unknown'}`);
  }
  const data = await r.json();
  return data.content?.[0]?.text ?? '';
}

// extractJson — tolerant JSON extraction from model replies (handles fences and prose).
// Tracks string/escape state so braces inside string values don't end the match.
// out: parsed value or null. Re-exported from api/ai.js for unit tests.
export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body   = fenced ? fenced[1] : text;
  const start  = body.search(/[[{]/);
  if (start === -1) return null;
  const open = body[start], close = open === '{' ? '}' : ']';
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped)           escaped = false;
      else if (ch === '\\')  escaped = true;
      else if (ch === '"')   inString = false;
      continue;
    }
    if (ch === '"')   { inString = true; continue; }
    if (ch === open)  depth++;
    if (ch === close) depth--;
    if (depth === 0) {
      try { return JSON.parse(body.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}
