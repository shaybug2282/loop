// Two-model scheduling apparatus — the brain behind the invisible scheduling assistant.
//
//   STAGE 1 (Haiku, "profiler")   builds a durable scheduling profile per user.
//   STAGE 2 (Sonnet, "scheduler") turns a request + every participant's profile
//                                 + real availability into candidate event plans.

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

// resolveUsersByIds — Supabase UUIDs → user rows (used when participant list comes
// from ScheduleWidget's `selected` Set, which stores internal UUIDs, not googleIds).
async function resolveUsersByIds(client, ids) {
  if (!ids.length) return [];
  const { data } = await client
    .from('users')
    .select('id, google_id, name, display_name, timezone, access_token')
    .in('id', ids);
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
      // participantIds: Supabase UUIDs from ScheduleWidget's `selected` Set.
      const { googleId, participantIds = [], request, durationHours = 1 } = req.body;
      if (!googleId || !request?.trim())
        return res.status(400).json({ error: 'googleId and request required' });

      const [requester] = await resolveUsers(client, [googleId]);
      if (!requester) return res.status(404).json({ error: 'User not found' });
      const others = await resolveUsersByIds(client, participantIds);
      // De-dupe in case the requester is also in participantIds.
      const seen = new Set([requester.id]);
      const users = [requester, ...others.filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; })];
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

    // ── Conversational chat — multi-turn scheduling assistant ────────────────
    // Maintains conversation history across turns. System context includes the
    // user's scheduling profile, their full friend list (name → UUID mapping so
    // Sonnet can resolve "Sam" to a participant ID), and the user's own busy
    // windows for the next 14 days. Returns { reply, plans? } where plans carry
    // participantIds so the frontend can create the event without a second trip.
    if (op === 'chat') {
      const { googleId, messages = [] } = req.body;
      if (!googleId || !Array.isArray(messages))
        return res.status(400).json({ error: 'googleId and messages array required' });

      const [user] = await resolveUsers(client, [googleId]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // User's scheduling profile (built by Haiku on login).
      const stored = await loadProfile(client, user.id);

      // Friend list — names + UUIDs so Sonnet can identify participants by name
      // and embed the correct IDs in the plans it returns.
      const { data: friendships } = await client
        .from('friendships')
        .select('friend:friend_id(id, name, display_name)')
        .eq('user_id', user.id);
      const friends = (friendships ?? []).map(f => ({
        id:   f.friend.id,
        name: f.friend.display_name || f.friend.name,
      }));

      // User's own busy windows — gives Sonnet real availability context.
      const availability = await gatherBusy([user]);

      // Dynamic context prepended to the authored system prompt so the model
      // always has up-to-date scheduling signals without changing the cached prompt.
      const context = [
        `Today: ${new Date().toISOString()}`,
        `User: ${user.display_name || user.name}`,
        stored?.profile ? `Scheduling profile: ${JSON.stringify(stored.profile)}` : null,
        friends.length
          ? `Friends (name → id): ${JSON.stringify(friends)}`
          : 'Friends: none yet.',
        `User busy windows (next 14 days): ${JSON.stringify(availability)}`,
      ].filter(Boolean).join('\n');

      // =======================================================================
      // INSERT PROMPT HERE — SONNET CHAT SYSTEM PROMPT
      // -----------------------------------------------------------------------
      // The model receives the above `context` block prepended automatically,
      // then this authored prompt as its persona + output contract.
      //
      // The conversation history (user ↔ assistant turns) is passed as the
      // `messages` array; the model should maintain continuity across turns.
      //
      // Return ONLY a raw JSON object — no prose, no fences:
      //   {
      //     "reply": string,          // conversational response shown to user
      //     "plans": [                // omit or use [] when no times to suggest
      //       {
      //         "title": string,
      //         "start": ISO 8601 datetime,
      //         "end":   ISO 8601 datetime,
      //         "location": string,   // optional — specific venue or area
      //         "participantIds": string[]  // Supabase UUIDs from the friends list
      //                                     // above; [] if scheduling for self only
      //       }
      //     ]
      //   }
      // Up to 3 plans per response. Never propose a time inside a busy window.
      // When suggesting plans always include them in the same response as reply.
      // If you need more information before suggesting times, set plans to [] and
      // ask via reply. After the user selects a time, confirm naturally in reply.
      // =======================================================================
      // OUTPUT FORMAT IS MANDATORY — every single response must be a raw JSON
      // object with no surrounding prose, no markdown fences, no explanation outside
      // the JSON. The UI parses this directly; plain text breaks the interface.
      const AUTHORED_PROMPT = 'CRITICAL: You must ALWAYS respond with ONLY a raw JSON object. Never write plain text. Never use markdown. Every response must be exactly: {"reply":"...","plans":[...]} — nothing before or after the JSON. The reply field contains your conversational message to the user. The plans array contains time suggestions (or [] if not suggesting times). Each plan: {"title":"...","start":"ISO8601","end":"ISO8601","location":"optional","participantIds":["uuid1"]}. You are a concise, friendly personal scheduling assistant. Use the context above — scheduling profile, friends list, busy windows — to suggest times that fit. When the user names a friend, look them up in the Friends list and put their id in participantIds. Keep reply text short and natural — no bullet points, no explanations of why times were chosen. Up to 3 plans per response. If you need more info before suggesting times set plans to [] and ask in reply. If the user gives feedback on suggestions, revise them. After a booking is confirmed, acknowledge briefly in reply and set plans to [].';


      const CHAT_SYSTEM = `${context}\n\n${AUTHORED_PROMPT}`;

      // Prefill the assistant turn with `{"reply":"` so Claude is forced to
      // continue as a JSON object rather than starting with prose.
      const prefill    = '{"reply":"';
      const prefillMsg = { role: 'assistant', content: prefill };

      const raw = await callModel({
        model:     MODELS.SCHEDULER,
        system:    CHAT_SYSTEM,
        messages:  [...messages, prefillMsg],
        maxTokens: 1500,
      });

      // Reconstruct the full JSON string (prefill + completion) and parse it.
      const full   = prefill + raw;
      const parsed = extractJson(full);
      if (parsed && typeof parsed.reply === 'string') {
        return res.status(200).json({ reply: parsed.reply, plans: parsed.plans ?? [] });
      }
      // Last-resort fallback: surface raw text so the chat never goes blank.
      return res.status(200).json({ reply: raw.replace(/^["']|["']$/g, ''), plans: [] });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? 'Internal error' });
  }
}
