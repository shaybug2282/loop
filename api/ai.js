// Two-model scheduling apparatus — the brain behind the invisible scheduling assistant.
//
//   STAGE 1 (Haiku, "profiler")   builds a durable scheduling profile per user.
//   STAGE 2 (Sonnet, "scheduler") turns a request + every participant's profile
//                                 + real availability into candidate event plans.
//
// Endpoints (all POST):
//   { op:'build-profile', googleId, notes? }
//        → runs Haiku over the user's signals, persists & returns their profile.
//   { op:'get-profile', googleId }
//        → returns the stored profile without re-running the model (cheap read).
//   { op:'schedule', googleId, participantGoogleIds[], request, durationHours? }
//        → runs Sonnet over all participants → { plans: [...] }.
//
// Prompts are intentionally left blank — search for INSERT PROMPT HERE.
//
// Required Supabase migration (run once):
//   CREATE TABLE IF NOT EXISTS user_profiles (
//     user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
//     profile     JSONB NOT NULL DEFAULT '{}',
//     raw_signals JSONB,
//     updated_at  TIMESTAMPTZ DEFAULT now()
//   );

import { createClient } from '@supabase/supabase-js';
import { decrypt } from './_crypto.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const MODELS = {
  PROFILER:  'claude-haiku-4-5',
  SCHEDULER: 'claude-sonnet-4-6',
};

const db = () => createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// callModel — single entry point to the Anthropic Messages API.
// in:  { model, system, messages, maxTokens? }. out: assistant reply string.
async function callModel({ model, system, messages, maxTokens = 1024 }) {
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
// out: parsed value or null.
function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body   = fenced ? fenced[1] : text;
  const start  = body.search(/[[{]/);
  if (start === -1) return null;
  const open = body[start], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === open)  depth++;
    if (body[i] === close) depth--;
    if (depth === 0) {
      try { return JSON.parse(body.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

// resolveUsers — google IDs → user rows (includes encrypted token for calendar reads).
async function resolveUsers(client, googleIds) {
  const { data } = await client
    .from('users')
    .select('id, google_id, name, display_name, timezone, access_token')
    .in('google_id', googleIds);
  return data ?? [];
}

// loadProfile — fetch stored scheduling profile for a user. out: row or null.
async function loadProfile(client, userId) {
  const { data } = await client
    .from('user_profiles')
    .select('profile, raw_signals, updated_at')
    .eq('user_id', userId)
    .single();
  return data ?? null;
}

// saveProfile — upsert the Haiku-built profile + the raw signals it came from.
async function saveProfile(client, userId, profile, rawSignals) {
  const { error } = await client
    .from('user_profiles')
    .upsert(
      { user_id: userId, profile, raw_signals: rawSignals, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) throw new Error(error.message);
}

// fetchRecentEvents — last `days` days of calendar events compressed for Haiku.
async function fetchRecentEvents(token, days = 30) {
  const now     = new Date();
  const timeMin = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const url =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
    `?timeMin=${timeMin}&timeMax=${now.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=100`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const { items = [] } = await r.json();
  return items
    .filter(ev => ev.start?.dateTime)
    .map(ev => {
      const start = new Date(ev.start.dateTime);
      const end   = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
      return {
        title:         ev.summary ?? '(untitled)',
        weekday:       start.toLocaleDateString('en-US', { weekday: 'short' }),
        hour:          start.getHours(),
        durationHours: end ? +((end - start) / 3.6e6).toFixed(1) : null,
        recurring:     Boolean(ev.recurringEventId),
      };
    });
}

// gatherUserSignals — builds the payload Haiku reasons over: identity + calendar behavior.
async function gatherUserSignals(user, notes = '') {
  let recentEvents = [];
  if (user.access_token) {
    try { recentEvents = await fetchRecentEvents(decrypt(user.access_token)); } catch {}
  }
  return {
    user:        user.display_name || user.name || 'User',
    timezone:    user.timezone || 'UTC',
    statedNotes: notes || null,
    recentEvents,
  };
}

// gatherBusy — aggregate free/busy data across all participant calendars.
// out: { windowStart, windowEnd, busy: [{start, end}] }
async function gatherBusy(users, days = 14) {
  const windowStart = new Date();
  const windowEnd   = new Date(windowStart.getTime() + days * 24 * 60 * 60 * 1000);
  const busy = [];

  await Promise.allSettled((users ?? []).map(async u => {
    if (!u.access_token) return;
    try {
      const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method:  'POST',
        headers: { Authorization: `Bearer ${decrypt(u.access_token)}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          timeMin: windowStart.toISOString(),
          timeMax: windowEnd.toISOString(),
          items:   [{ id: 'primary' }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        busy.push(...(d.calendars?.primary?.busy ?? []));
      }
    } catch {}
  }));

  return { windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), busy };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { op } = req.body ?? {};
  const client = db();

  try {
    // ── STAGE 1 · Haiku profiler ─────────────────────────────────────────────
    if (op === 'build-profile') {
      const { googleId, notes } = req.body;
      if (!googleId) return res.status(400).json({ error: 'googleId required' });

      const [user] = await resolveUsers(client, [googleId]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const signals = await gatherUserSignals(user, notes);

      // =======================================================================
      // INSERT PROMPT HERE — HAIKU PROFILER SYSTEM PROMPT
      // -----------------------------------------------------------------------
      // Receives JSON: { user, timezone, statedNotes, recentEvents[] }
      // Must return ONLY valid JSON matching this schema — no prose, no fences:
      //   {
      //     "user": string,
      //     "tags": string[],              // e.g. ["student","early riser","athlete"]
      //     "hard_constraints": string[],  // inviolable, e.g. ["no 8am classes Mon/Wed"]
      //     "soft_constraints": string[],  // preferences, e.g. ["prefers not after 6pm"]
      //     "inferred_rhythm": string      // e.g. "deep work 9am–12pm"
      //   }
      // =======================================================================
      const PROFILER_SYSTEM = 'Read through user calendar and past events. Based on this, compile a profile about the user with all necessary information for scheduling, including what their occupation is, when they are often busy, what hours of the day they are most active, how often they have social events, who they see most often, frequented locations. Compile this information into tags that can be stored about the user to inform future scheduling suggestions. You MUST respond with ONLY a raw JSON object — no prose, no markdown, no explanation. The object must have exactly these keys: "user" (string), "tags" (array of short descriptive strings), "hard_constraints" (array of strings for inviolable rules, e.g. "no meetings before 9am"), "soft_constraints" (array of strings for preferences, e.g. "prefers mornings"), "inferred_rhythm" (single string summarizing their daily pattern, e.g. "focused work 9am–12pm"). If you cannot infer something, use an empty array or empty string.';

      const reply = await callModel({
        model:     MODELS.PROFILER,
        system:    PROFILER_SYSTEM,
        messages:  [{ role: 'user', content: JSON.stringify(signals) }],
        maxTokens: 800,
      });

      const profile = extractJson(reply) ?? {
        user: signals.user, tags: [], hard_constraints: [], soft_constraints: [], inferred_rhythm: '',
      };

      await saveProfile(client, user.id, profile, signals);
      return res.status(200).json({ profile });
    }

    // ── Stored profile read — no model call ──────────────────────────────────
    if (op === 'get-profile') {
      const { googleId } = req.body;
      if (!googleId) return res.status(400).json({ error: 'googleId required' });

      const [user] = await resolveUsers(client, [googleId]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const stored = await loadProfile(client, user.id);
      return res.status(200).json({ profile: stored?.profile ?? null, updatedAt: stored?.updated_at ?? null });
    }

    // ── STAGE 2 · Sonnet scheduler ───────────────────────────────────────────
    if (op === 'schedule') {
      const { googleId, participantGoogleIds = [], request, durationHours = 1 } = req.body;
      if (!googleId || !request?.trim())
        return res.status(400).json({ error: 'googleId and request required' });

      const allGoogleIds = [...new Set([googleId, ...participantGoogleIds])];
      const users = await resolveUsers(client, allGoogleIds);
      if (!users.length) return res.status(404).json({ error: 'No valid participants' });

      const participants = await Promise.all(users.map(async u => {
        const stored = await loadProfile(client, u.id);
        return { name: u.display_name || u.name || 'User', profile: stored?.profile ?? null };
      }));

      const availability = await gatherBusy(users);

      // =======================================================================
      // INSERT PROMPT HERE — SONNET SCHEDULER SYSTEM PROMPT
      // -----------------------------------------------------------------------
      // Receives JSON: { request, durationHours, participants[{name, profile}], availability }
      // profile shape: { user, tags[], hard_constraints[], soft_constraints[], inferred_rhythm }
      // availability:  { windowStart, windowEnd, busy: [{start, end}] }
      //
      // Must return ONLY valid JSON — no prose, no fences:
      //   {
      //     "plans": [
      //       {
      //         "title": string,
      //         "start": ISO 8601 string,
      //         "end":   ISO 8601 string,
      //         "rationale": string,          // one line — why this time fits everyone
      //         "respectsHardConstraints": boolean,
      //         "warnings": string[]          // soft-constraint trade-offs, if any
      //       }
      //     ]
      //   }
      // Up to 3 plans, best first. Never propose a time inside a busy interval.
      // Never violate any participant's hard_constraints.
      // =======================================================================
      const SCHEDULER_SYSTEM = 'You are a concise, subtle personal assistant. Based on input from User, you will pull all necessary information to make helpful scheduling recommendations. This information includes the context tags compiled by Haiku, the User requests regarding what type of event they want, when it is, and who it is with, as well other engagements on their calendar. Based on this information, formulate up to three plans that fulfill all the parameters for an event. If necessary, ask user for essential information such as location, other users, or type of event. You MUST respond with ONLY a raw JSON object — no prose, no markdown, no explanation, no rationale. The object must have a "plans" array where each entry has: "title" (string), "start" (ISO 8601 datetime), "end" (ISO 8601 datetime), "location" (optional string — only include if you can suggest a specific helpful venue or area relevant to the event type and participants; omit if unknown). Never include explanations or reasons for why a time was chosen. Never propose a time that overlaps a busy interval. Never violate a hard_constraint. If you need clarification before proposing times, return { "plans": [], "clarification_needed": "your question here" } — still as raw JSON only.';

      const reply = await callModel({
        model:     MODELS.SCHEDULER,
        system:    SCHEDULER_SYSTEM,
        messages:  [{ role: 'user', content: JSON.stringify({ request: request.trim(), durationHours, participants, availability }) }],
        maxTokens: 1500,
      });

      return res.status(200).json(extractJson(reply) ?? { plans: [] });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? 'Internal error' });
  }
}
