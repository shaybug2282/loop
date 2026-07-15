// Shared helpers for all API routers.
//
// Files prefixed with "_" in api/ are NOT deployed as Vercel serverless
// functions — they are plain modules imported by the routers (same convention
// as _crypto.js).

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from './_crypto.js';

// db — Supabase client with the service-role key (bypasses RLS).
// Server-only: this key must never reach the browser bundle.
export const db = () => createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Sessions ──────────────────────────────────────────────────────────────────
//
// Identity is carried by an HMAC-signed session token in an httpOnly cookie,
// issued by api/user.js op:'google-auth' after a server-side Google code
// exchange. Every router derives the caller from this cookie via requireUser —
// client-supplied googleId params are NEVER trusted for identity.
//
// CSRF: the cookie is SameSite=Lax and every mutating op is a JSON POST, which
// cross-site requests cannot send with cookies under Lax. GETs never mutate.

const SESSION_COOKIE = 'loop_session';
const SESSION_TTL_S  = 30 * 24 * 60 * 60; // 30 days, then re-login

// sessionKey — HMAC key for session signatures. Uses SESSION_SECRET when set;
// otherwise derives a dedicated key from TOKEN_ENCRYPTION_KEY (hashed with a
// distinct label so the signing key is never the encryption key itself).
function sessionKey() {
  const secret = process.env.SESSION_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('SESSION_SECRET or TOKEN_ENCRYPTION_KEY must be set');
  return createHash('sha256').update(`loop-session-v1:${secret}`).digest();
}

// signSession — { userId, googleId } → "payload.signature" token (base64url).
// `now`/`ttlSeconds` are overridable for tests. out: token string.
export function signSession({ userId, googleId }, { now = Date.now(), ttlSeconds = SESSION_TTL_S } = {}) {
  const payload = Buffer.from(JSON.stringify({
    uid: userId, gid: googleId, exp: Math.floor(now / 1000) + ttlSeconds,
  })).toString('base64url');
  const sig = createHmac('sha256', sessionKey()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// verifySession — token → { userId, googleId } when the signature checks out
// and the token hasn't expired; null for anything else (missing, malformed,
// tampered, expired). Constant-time signature comparison.
export function verifySession(token, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const expected = createHmac('sha256', sessionKey()).update(payload).digest();
    const given    = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || !data.gid || !data.exp || data.exp * 1000 <= now) return null;
    return { userId: data.uid, googleId: String(data.gid) };
  } catch { return null; }
}

// parseCookies — Cookie header → { name: value }. Tolerates missing header,
// stray spaces, and values containing '='. Exported for unit tests.
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name) out[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

// requireUser — the one identity gate every router op goes through.
// out: { userId, googleId } from a valid session cookie, else null (callers
// respond 401). Never reads identity from query/body.
export function requireUser(req) {
  return verifySession(parseCookies(req.headers?.cookie)[SESSION_COOKIE]);
}

// sessionCookie — Set-Cookie value that stores a session token. httpOnly (no
// script access), Secure (HTTPS + localhost only), SameSite=Lax (see CSRF
// note above).
export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_S}`;
}

// clearSessionCookie — Set-Cookie value that logs the browser out.
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ── Google OAuth tokens ───────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// googleClientId / googleClientSecret — server-side OAuth client credentials.
// The id doubles as the browser client id (REACT_APP_GOOGLE_CLIENT_ID); the
// secret is server-only and required for the authorization-code exchange.
export const googleClientId = () =>
  process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID;
export const googleClientSecret = () => process.env.GOOGLE_CLIENT_SECRET;

// loadGoogleTokenRow — the token columns getGoogleAccessToken needs for one
// user, with a graceful pre-016 fallback (no refresh_token column yet).
// out: { id, access_token, token_expiry, refresh_token? } or null.
export async function loadGoogleTokenRow(client, userId) {
  let { data, error } = await client.from('users')
    .select('id, access_token, token_expiry, refresh_token').eq('id', userId).single();
  if (error) {
    ({ data } = await client.from('users')
      .select('id, access_token, token_expiry').eq('id', userId).single());
  }
  return data ?? null;
}

// getGoogleAccessToken — a valid plaintext access token for a user, refreshing
// server-side with their stored refresh token when the cached one is expired
// (this is what keeps calendar reads working when the user isn't online).
// `user` needs { id, access_token, token_expiry, refresh_token? } — columns as
// stored (encrypted). Persists a refreshed token + expiry back to the row and
// updates user.token_expiry in place so callers can report the new expiry.
// out: token string, or null when the user has no usable token at all.
export async function getGoogleAccessToken(client, user) {
  if (!user) return null;
  const current = user.access_token ? safeDecrypt(user.access_token) : null;
  const expiry  = user.token_expiry ? new Date(user.token_expiry).getTime() : 0;
  // 60s skew so a token never expires mid-request chain.
  if (current && expiry - 60_000 > Date.now()) return current;

  const refresh = user.refresh_token ? safeDecrypt(user.refresh_token) : null;
  if (!refresh) return current; // pre-016 row or grant without offline access — best effort

  try {
    const r = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refresh,
        client_id:     googleClientId(),
        client_secret: googleClientSecret(),
      }),
    });
    if (!r.ok) return current;
    const d = await r.json();
    if (!d.access_token) return current;

    const token_expiry = new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString();
    await client.from('users').update({
      access_token: encrypt(d.access_token),
      token_expiry,
    }).eq('id', user.id);
    user.token_expiry = token_expiry;
    return d.access_token;
  } catch { return current; }
}

// safeDecrypt — decrypt a column value, falling back to the raw value for
// rows written before encryption-at-rest was introduced.
export function safeDecrypt(val) {
  if (!val) return val;
  try { return decrypt(val); } catch { return val; }
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
