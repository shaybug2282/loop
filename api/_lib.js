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

// isQuietNow — true while a user's Quiet Time blocks scheduling: on when
// quiet_time_since is set and the optional quiet_time_until end (migration
// 015) hasn't passed. Shared by api/schedule.js and api/ai.js.
export function isQuietNow(u) {
  if (!u?.quiet_time_since) return false;
  if (u.quiet_time_until && new Date(u.quiet_time_until) <= new Date()) return false;
  return true;
}

// inQuietHours — true when a moment falls inside the user's daily quiet-hours
// window (preferences.quietHours, evaluated in their timezone). Overnight
// windows (e.g. 22:00–08:00) wrap past midnight. out: boolean; malformed
// input reads as "not quiet" so scheduling fails open.
export function inQuietHours(whenIso, preferences, timezone = 'UTC') {
  const qh = preferences?.quietHours;
  if (!qh?.enabled || !qh.start || !qh.end) return false;
  const toMin = s => {
    const [h, m] = String(s).split(':').map(Number);
    return Number.isFinite(h) ? h * 60 + (m || 0) : NaN;
  };
  let local;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(whenIso));
    local = toMin(`${parts.find(p => p.type === 'hour')?.value}:${parts.find(p => p.type === 'minute')?.value}`);
  } catch { return false; }
  const start = toMin(qh.start), end = toMin(qh.end);
  if ([local, start, end].some(Number.isNaN)) return false;
  return start <= end ? (local >= start && local < end) : (local >= start || local < end);
}

// ── Anthropic helpers (shared by api/ai.js and api/_profiles.js) ──────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// callModel — single entry point to the Anthropic Messages API.
// in:  { model, system, messages, maxTokens? }. out: assistant reply string.
// `system` is either a plain string or { static, dynamic }: the static text is
// marked as a prompt-cache breakpoint — because it is byte-identical across
// every user and turn it becomes a cache READ on subsequent calls (~90%
// cheaper) — while the dynamic per-user/per-turn context follows uncached.
// Never put changing data (timestamps, busy windows) in the static part: one
// changed byte invalidates the cache prefix.
export async function callModel({ model, system, messages, maxTokens = 1024 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const systemBlocks = typeof system === 'string'
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : [
        { type: 'text', text: system.static, cache_control: { type: 'ephemeral' } },
        ...(system.dynamic ? [{ type: 'text', text: system.dynamic }] : []),
      ];

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
      system:   systemBlocks,
      messages,
    }),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`AI error (${r.status}): ${err.error?.message ?? 'unknown'}`);
  }
  const data = await r.json();
  // Models with adaptive reasoning (Sonnet 5+) may prepend a `thinking` block,
  // so the reply text is the first block of type "text", not content[0].
  return data.content?.find(b => b.type === 'text')?.text ?? '';
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
