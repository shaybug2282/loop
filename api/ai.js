// AI router — two-model scheduling apparatus with persistent conversations.
//
//   STAGE 1 (Haiku, "profiler")   builds a durable scheduling profile per user.
//   STAGE 2 (Sonnet, "scheduler") turns a request + every participant's profile
//                                 + real availability into candidate event plans.
//
// GET  ?op=conversations&googleId=      → { conversations } (open scheduling chats)
// GET  ?op=conversation&googleId=&id=   → { conversation } (full message history)
// GET  ?op=profile-prefs&googleId=      → { hard_constraints, soft_constraints } (Profile page Preferences)
// POST { op:'add-constraint', googleId, constraint }      → user-stated preference ("I'm not a morning person")
// POST { op:'forget-constraint', googleId, constraint }   → remove a learned rule (chat pill Undo / Profile ✕)
// POST { op:'build-profile', googleId, notes?, force? }        → { profile }
// POST { op:'schedule', googleId, participantIds[], request }  → { plans }
// POST { op:'chat', googleId, conversationId?, message, groupId? } → { conversationId, reply, plans }
//        groupId puts the chat in group mode: the group's accepted members are
//        injected as mandatory participants (sent by the client on every turn).
// POST { op:'record-booking', googleId, conversationId, eventId, plan } → { ok }
// POST { op:'delete-conversation', googleId, conversationId }  → { ok }
//
// The Haiku profile is created on first login here (op:'build-profile') and
// refreshed at most weekly when a user is invited to an event (that refresh
// lives in api/schedule.js create-event → refreshProfileIfStale). The pipeline
// itself is in api/_profiles.js.
//
// Conversations persist in ai_conversations (db/migrations/007_ai_conversations.sql)
// so pending-event chats survive reloads and can be resumed; api/schedule.js
// deletes a conversation once its linked event is confirmed or declined.
// Requires the user_profiles table: db/migrations/003_user_profiles.sql

import { decrypt } from './_crypto.js';
import { db, callModel, extractJson, isQuietNow } from './_lib.js';
import { buildProfileForUser, loadProfile, updateCommStyle, mergeConstraint } from './_profiles.js';

// Re-exported so the existing unit tests (import from api/ai) keep resolving.
export { extractJson };

const MODELS = {
  SCHEDULER: 'claude-sonnet-5',
};

// renderDateTable — the next `days` days as one "weekday YYYY-MM-DD" line each
// in the given timezone, with the UTC offset per day (DST-safe) and a today
// marker. Injected into every scheduler prompt so weekday↔date mapping is a
// lookup, never arithmetic the model can get wrong. `from` is overridable for
// tests. out: multi-line string. Exported for unit tests.
export function renderDateTable(tz, days = 14, from = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    timeZoneName: 'longOffset',
  });
  const lines = [];
  for (let i = 0; i < days; i++) {
    const parts = fmt.formatToParts(new Date(from.getTime() + i * 86400000));
    const get = t => parts.find(p => p.type === t)?.value ?? '';
    const offset = get('timeZoneName').replace('GMT', 'UTC');
    lines.push(`${get('weekday')} ${get('year')}-${get('month')}-${get('day')} (${offset})${i === 0 ? ' ← today' : ''}`);
  }
  return lines.join('\n');
}

// renderBusy — busy intervals as compact local-time lines
// ("Mon, Jul 13, 09:00–10:30"), sorted, in the given timezone — the model
// reads them directly with no UTC conversion, at far fewer tokens than ISO
// pairs. out: single string; "none" when empty.
function renderBusy(busy, tz) {
  if (!busy?.length) return 'none';
  const fD = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  const fT = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return [...busy]
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .map(({ start, end }) => {
      const s = new Date(start), e = new Date(end);
      const sameDay = fD.format(s) === fD.format(e);
      return `${fD.format(s)} ${fT.format(s)}–${sameDay ? '' : fD.format(e) + ' '}${fT.format(e)}`;
    })
    .join('; ');
}

// renderParticipants — participant context for a model payload: profile plus
// busy windows pre-rendered in each participant's own timezone.
const renderParticipants = (participants) => participants.map(p => ({
  id: p.id, name: p.name, timezone: p.timezone, profile: p.profile,
  busy: p.shared === false
    ? 'not shared — this participant keeps their calendar private; rely on their profile and note the times are unverified'
    : renderBusy(p.busy, p.timezone),
}));

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
// preferences (migration 015) carries availabilitySharing; absent pre-015.
async function resolveUsersByIds(client, ids) {
  if (!ids.length) return [];
  let { data, error } = await client
    .from('users')
    .select('id, google_id, name, display_name, timezone, access_token, preferences')
    .in('id', ids);
  if (error) {
    ({ data } = await client
      .from('users')
      .select('id, google_id, name, display_name, timezone, access_token')
      .in('id', ids));
  }
  return data ?? [];
}

// sharesCalendarWithAI — availabilitySharing 'off' means the assistant must
// not read this user's calendar at all (the strictest privacy setting);
// 'ai' (the default) and 'friends' both allow assistant lookups.
const sharesCalendarWithAI = u => (u.preferences?.availabilitySharing ?? 'ai') !== 'off';

// loadProfiles — batch: user UUIDs → { [userId]: profile }. One query, not N.
async function loadProfiles(client, userIds) {
  if (!userIds.length) return {};
  const { data } = await client
    .from('user_profiles')
    .select('user_id, profile')
    .in('user_id', userIds);
  return Object.fromEntries((data ?? []).map(r => [r.user_id, r.profile]));
}

// fetchUserBusy — one user's free/busy intervals for the next `days` days.
// out: [{start, end}] (empty when no token or the fetch fails).
async function fetchUserBusy(user, windowStart, windowEnd) {
  if (!user.access_token) return [];
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method:  'POST',
      headers: { Authorization: `Bearer ${decrypt(user.access_token)}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        timeMin: windowStart.toISOString(),
        timeMax: windowEnd.toISOString(),
        items:   [{ id: 'primary' }],
      }),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return d.calendars?.primary?.busy ?? [];
  } catch { return []; }
}

// gatherBusy — aggregate free/busy data across all participant calendars.
// out: { windowStart, windowEnd, busy: [{start, end}] }
async function gatherBusy(users, days = 14) {
  const windowStart = new Date();
  const windowEnd   = new Date(windowStart.getTime() + days * 24 * 60 * 60 * 1000);
  const busy = [];

  await Promise.allSettled((users ?? []).map(async u => {
    busy.push(...await fetchUserBusy(u, windowStart, windowEnd));
  }));

  return { windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), busy };
}

// gatherParticipantContext — per-participant profile + busy windows, keyed by
// name so the model can weigh individual schedules (not just the union).
// out: [{ id, name, timezone, profile, busy: [{start,end}] }]
async function gatherParticipantContext(client, userIds, days = 14) {
  const users       = await resolveUsersByIds(client, userIds);
  const profiles    = await loadProfiles(client, users.map(u => u.id));
  const windowStart = new Date();
  const windowEnd   = new Date(windowStart.getTime() + days * 24 * 60 * 60 * 1000);

  return Promise.all(users.map(async u => ({
    id:       u.id,
    name:     u.display_name || u.name || 'User',
    timezone: u.timezone || 'UTC',
    profile:  profiles[u.id] ?? null,
    shared:   sharesCalendarWithAI(u),
    busy:     sharesCalendarWithAI(u) ? await fetchUserBusy(u, windowStart, windowEnd) : [],
  })));
}

// Shared scheduling doctrine injected into both scheduler prompts — how the
// model must reason about time when hard calendar data is sparse.
const SCHEDULING_RULES =
  'Scheduling rules you must always apply: ' +
  '(1) People sleep at night — never propose times between a participant\'s inferred sleep hours; if a profile gives no awake window, assume asleep 22:30–08:00 in that participant\'s timezone. ' +
  '(2) An empty weekday daytime on a calendar does NOT mean free — many people have work or school that never appears as events. Unless a participant\'s profile indicates a flexible daytime schedule, prefer weekday evenings (17:00–21:30) and weekends for social events; weekday 09:00–17:00 slots are acceptable only when profiles support daytime availability or the request demands it. ' +
  '(3) Never propose a time overlapping any participant\'s busy interval, and leave sensible travel/transition buffer around adjacent events. ' +
  '(4) Honor every hard_constraint absolutely; satisfy soft_constraints and stated preferences whenever possible, and use profile tags (occupation, frequented locations, active hours, social rhythm) to infer unstated preferences. ' +
  '(5) Offer genuinely DISTINCT options — vary the day and time-of-day across options (e.g. a weekday evening, a weekend afternoon), not three near-identical slots. Include a location ONLY when the user named one or asked for venue suggestions — never fill in a venue on your own. ' +
  '(6) All proposed times must be in the future, inside the availability window provided. ' +
  '(7) DATES: a date table (weekday → date, with UTC offset) is provided in your context. It is the ONLY source of truth for which date a weekday falls on — look dates up there, never compute them. When the user says "Monday"/"this weekend"/etc., resolve it against the table before anything else. ' +
  '(8) Every "start"/"end" you output must be ISO 8601 WITH the explicit UTC offset from the date table for that day (e.g. "2026-07-13T18:00:00-05:00") so the time means exactly what the participant\'s clock says — never output a bare local time or a bare "Z" time unless the timezone is UTC.';

// Static system prompt for the one-shot scheduler (op:'schedule'). Module-level
// and free of any per-request data so every call is a prompt-cache read; the
// date table / current time arrive via the dynamic system block.
const SCHEDULER_SYSTEM =
  'You are a scheduling engine. You receive a request plus, for every participant, their scheduling profile (tags, hard/soft constraints, inferred rhythm, awake hours, weekday pattern) and their individual busy intervals rendered in that participant\'s own local timezone. Find times that are reasonable for ALL participants. ' +
  SCHEDULING_RULES + ' ' +
  'You MUST respond with ONLY a raw JSON object — no prose, no markdown, no explanation. The object must have a "plans" array (up to 3 distinct options, best first) where each entry has: "title" (string), "start" (ISO 8601 datetime with explicit UTC offset), "end" (ISO 8601 datetime with explicit UTC offset), "location" (string — only when the request named or asked for one; omit otherwise). Never include explanations for why a time was chosen. ' +
  'If you need clarification before proposing times, return { "plans": [], "clarification_needed": "your question here" } — still as raw JSON only.';

// Static system prompt for the conversational assistant (op:'chat'). Same
// cache discipline as SCHEDULER_SYSTEM: everything user- or time-specific
// lives in the dynamic context block, never here.
const AUTHORED_PROMPT =
  'CRITICAL OUTPUT CONTRACT: you must ALWAYS respond with ONLY a raw JSON object — never plain text, never markdown, nothing before or after the JSON. The UI parses it directly. Valid responses are exactly one of: ' +
  '(A) {"reply":"...","plans":[...]} — reply is your short, natural conversational message; plans is up to 3 suggestions (or [] when not suggesting times). Each plan: {"title":"...","start":"ISO8601 with explicit UTC offset","end":"ISO8601 with explicit UTC offset","location":"only when the user named or asked for one — never invent a venue","description":"optional invite note ≤140 chars — only when the user asks to include a note or gives details invitees need; it appears on the invite and event card, never on the Google Calendar event","participantIds":["friend uuids from the roster, [] if for the user alone"]}. ' +
  'Form (A) may also carry "remember":{"constraint":"...","kind":"hard"|"soft"} — include ONLY when the user directly states a durable scheduling rule about themselves in THIS message ("I never do weekday lunches" → hard, "I prefer mornings" → soft); never inferred, never one already in their profile; acknowledge it in a few words in reply. Use kind "forget" when they retract one. ' +
  '(B) {"action":"check_availability","participantIds":["friend uuids"]} — returns those friends\' real calendar busy windows and full scheduling profiles as the next message. ' +
  'You are a concise, friendly scheduling assistant helping one user coordinate events with friends. When the user names a friend, resolve them via the roster. Roster entries may include shared_history — events the user actually booked with that friend before; use it to default the event type, duration, day, and time instead of asking. A roster entry with quiet_time:true CANNOT be scheduled right now: never include them in plans — tell the user that friend has Quiet Time enabled and to try again later. A roster entry with quiet_hours (a daily window in that friend\'s local time) must never receive plans that START inside that window. BEFORE first proposing times for any event involving friends, you MUST issue check_availability for all involved friends so proposals rest on their real calendars and profiles — never guess someone else\'s availability. Do not repeat a lookup within the same turn. ' +
  'CALENDAR DATA FRESHNESS: your context may include participants\' calendars from an earlier lookup, labeled with when they were fetched. Reuse them for small revisions in the same timeframe, but if participants changed, the timeframe moved, or the data is more than a day old, issue check_availability again before proposing times. If no participant calendar data is in context, you do NOT have any — never propose times for friends from memory of a previous turn. ' +
  'CORRECTIONS: when the user rejects, corrects, or expresses doubt about a suggestion, treat that as a standing hard constraint for the rest of this conversation — never re-propose a slot (or anything materially similar) that the user turned down, and re-read their message for the specific day/time they actually asked for before revising. ' +
  SCHEDULING_RULES + ' ' +
  'PRIVACY: never remark on or characterize another participant\'s calendar or availability ("X is wide open", "Y has a busy week") — reference someone\'s schedule only when it explains a concrete tradeoff between options (e.g. "Friday 5:00 works but is a tight squeeze after Sam\'s prior event; Monday leaves more buffer"). ' +
  'Be as concise as possible: replies are warm but minimal, no bullet lists, and NEVER restate what the plan cards already show (title, date, time, location, description) — add words only for a necessary tradeoff, caveat, or question. When your reply does mention a day, name both weekday and date from the date table (e.g. "Monday the 13th") so mistakes are visible. If the context includes a reply-style preference learned for this user, match it. ' +
  'CLARIFICATION BUDGET: ask a question (plans []) ONLY when something essential is genuinely unresolvable from the request, profiles, and shared_history — like who is coming. Otherwise default sensibly — duration from the event type or shared_history (dinner ≈ 2h, coffee ≈ 1h), a vague timeframe means the next 7 days — and propose times immediately; a correction from the user costs less than a question. ' +
  'If the user gives feedback on suggestions, revise (re-check availability if participants changed). After a booking is confirmed, acknowledge briefly with plans [].';

// gatherSharedHistory — per-friend digest of events the user actually booked
// with each friend through the app (status accepted), newest first. One query
// for all ids, filtered in JS — never a query per friend. Rendered as compact
// strings in the user's timezone so the model can default event type/day/
// time/duration from real pairing habits instead of asking.
// out: { [friendId]: ['Dinner Thu 19:00 (2h)', ...] } (≤3 each; ids with no
// shared events are omitted entirely).
async function gatherSharedHistory(client, userId, friendIds, tz) {
  if (!friendIds.length) return {};
  const { data } = await client
    .from('pending_events')
    .select('creator_id, invited_user_ids, event_time, duration_hours, title')
    .eq('status', 'accepted')
    .or(`creator_id.eq.${userId},invited_user_ids.cs.{${userId}}`)
    .order('event_time', { ascending: false })
    .limit(60);
  if (!data?.length) return {};
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const out = {};
  for (const fid of friendIds) {
    const shared = data.filter(e => e.creator_id === fid || (e.invited_user_ids ?? []).includes(fid));
    if (!shared.length) continue;
    out[fid] = shared.slice(0, 3).map(e =>
      `${e.title || 'Hangout'} ${fmt.format(new Date(e.event_time))} (${e.duration_hours ?? 1}h)`);
  }
  return out;
}

// loadGroupContext — groupId → { id, name, members: [{ id, name }] } for a
// group-mode chat; members are the group's OTHER accepted members (requester
// excluded). Returns null unless the requester is an accepted member, so a
// leaked groupId can't expose a group's roster.
async function loadGroupContext(client, groupId, userId) {
  const { data: g } = await client
    .from('groups')
    .select('id, name')
    .eq('id', groupId)
    .single();
  if (!g) return null;

  const { data: gm } = await client
    .from('group_members')
    .select('user_id, status')
    .eq('group_id', groupId)
    .eq('status', 'accepted');
  const memberIds = (gm ?? []).map(m => m.user_id);
  if (!memberIds.includes(userId)) return null;

  // group_members has two FKs to users (ambiguous embed) — resolve names in a
  // separate batch, same pattern as api/groups.js.
  const rows = await resolveUsersByIds(client, memberIds.filter(id => id !== userId));
  return { id: g.id, name: g.name, members: rows.map(u => ({ id: u.id, name: u.display_name || u.name })) };
}

// loadConversation — fetch one conversation, enforcing ownership. out: row or null.
async function loadConversation(client, userId, conversationId) {
  const { data } = await client
    .from('ai_conversations')
    .select('id, title, messages, pending_event_id, updated_at')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();
  return data ?? null;
}

// Matches an ISO 8601 datetime that carries an explicit offset ("Z" or ±hh:mm).
// Offset-less strings are rejected outright: the server would parse them as
// UTC while the model meant local time — the exact bug behind shifted plans.
const ISO_WITH_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

// validatePlans — clamp model output to the plan contract: ≤3 plans whose
// dates parse AND carry an explicit UTC offset, end after start, start in the
// future (and inside the scheduling window when given), no overlap with the
// requester's busy intervals, participantIds restricted to allowed ids.
// location/description pass through only as trimmed non-empty strings
// (description capped at 200 chars — it's an invite note, not a document).
// Deterministic backstop for model time errors. Exported for unit tests.
// opts: { busy?: [{start,end}], windowEnd?: ISO string, now?: ms epoch }
export function validatePlans(plans, friendIds, { busy = [], windowEnd = null, now = Date.now() } = {}) {
  if (!Array.isArray(plans)) return [];
  const endLimit   = windowEnd ? new Date(windowEnd).getTime() : null;
  const intervals  = (busy ?? []).map(b => [new Date(b.start).getTime(), new Date(b.end).getTime()]);
  return plans
    .filter(p => p && typeof p.start === 'string' && typeof p.end === 'string' &&
      ISO_WITH_OFFSET.test(p.start.trim()) && ISO_WITH_OFFSET.test(p.end.trim()) &&
      !isNaN(new Date(p.start)) && !isNaN(new Date(p.end)))
    .filter(p => {
      const s = new Date(p.start).getTime(), e = new Date(p.end).getTime();
      if (e <= s || s <= now) return false;
      if (endLimit && s > endLimit) return false;
      return !intervals.some(([bs, be]) => s < be && e > bs);
    })
    .slice(0, 3)
    .map(p => ({
      title:          typeof p.title === 'string' && p.title.trim() ? p.title.trim() : 'Event',
      start:          new Date(p.start).toISOString(),
      end:            new Date(p.end).toISOString(),
      ...(typeof p.location === 'string' && p.location.trim() ? { location: p.location.trim() } : {}),
      ...(typeof p.description === 'string' && p.description.trim() ? { description: p.description.trim().slice(0, 200) } : {}),
      participantIds: (Array.isArray(p.participantIds) ? p.participantIds : []).filter(id => friendIds.has(id)),
    }));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const client = db();

  // ── GET · conversation memory reads ─────────────────────────────────────
  if (req.method === 'GET') {
    const { op, googleId, id } = req.query;

    if (!googleId) return res.status(400).json({ error: 'googleId required' });

    try {
      const [me] = await resolveUsers(client, [googleId]);
      if (!me) return res.status(404).json({ error: 'User not found' });

      if (op === 'conversations') {
        const { data, error } = await client
          .from('ai_conversations')
          .select('id, title, pending_event_id, updated_at')
          .eq('user_id', me.id)
          .order('updated_at', { ascending: false });
        // Graceful degrade for deployments that haven't run migration 007 yet.
        if (error) return res.status(200).json({ conversations: [] });
        return res.status(200).json({ conversations: data ?? [] });
      }

      if (op === 'conversation') {
        if (!id) return res.status(400).json({ error: 'id required' });
        const convo = await loadConversation(client, me.id, id);
        if (!convo) return res.status(404).json({ error: 'Conversation not found' });
        return res.status(200).json({ conversation: convo });
      }

      // The learned-profile surface for the Profile page Preferences section:
      // standing rules the assistant captured plus ones the user typed in.
      if (op === 'profile-prefs') {
        const stored = await loadProfile(client, me.id);
        const p = stored?.profile ?? {};
        return res.status(200).json({
          hard_constraints: p.hard_constraints ?? [],
          soft_constraints: p.soft_constraints ?? [],
        });
      }

      return res.status(400).json({ error: `Unknown op: ${op}` });
    } catch (err) {
      return res.status(500).json({ error: err.message ?? 'Internal error' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { op } = req.body ?? {};

  try {
    // ── STAGE 1 · Haiku profiler — first-login creation ──────────────────────
    // Called on app mount. Builds the profile only when the user has none yet;
    // after that, logging in never rewrites it. The profile is refreshed at
    // most once per week, and only when the user is invited to an event
    // (api/schedule.js create-event → refreshProfileIfStale). `force`/`notes`
    // are explicit overrides (e.g. a manual rebuild with new stated notes).
    if (op === 'build-profile') {
      const { googleId, notes, force } = req.body;
      if (!googleId) return res.status(400).json({ error: 'googleId required' });

      const [user] = await resolveUsers(client, [googleId]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (!force && !notes) {
        const existing = await loadProfile(client, user.id);
        // Only a profiler-built profile (marked by its `user` key) counts as
        // cached — a constraints-only stub from add-constraint must not block
        // the first real Haiku build (which preserves the pinned rules).
        if (existing?.profile?.user) return res.status(200).json({ profile: existing.profile, cached: true });
      }

      const profile = await buildProfileForUser(client, user, notes);
      return res.status(200).json({ profile });
    }

    // ── STAGE 2 · Sonnet scheduler (one-shot, ScheduleWidget "Ask AI") ───────
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

      // Every participant contributes their profile AND their own busy windows,
      // so the model can reason per-person instead of over an anonymous union.
      const participants = await gatherParticipantContext(client, users.map(u => u.id));
      const windowStart  = new Date().toISOString();
      const windowEnd    = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const tz           = requester.timezone || 'UTC';
      const now          = new Date();

      // Dynamic system block: everything time/user-specific, so the static
      // SCHEDULER_SYSTEM stays byte-identical (prompt-cache read) per call.
      const dynamic = [
        `Current time: ${now.toLocaleString('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (requester's timezone: ${tz})`,
        `Date table (next 14 days, ${tz}):\n${renderDateTable(tz)}`,
      ].join('\n');

      const reply = await callModel({
        model:     MODELS.SCHEDULER,
        system:    { static: SCHEDULER_SYSTEM, dynamic },
        messages:  [{ role: 'user', content: JSON.stringify({ request: request.trim(), durationHours, window: { start: windowStart, end: windowEnd }, participants: renderParticipants(participants) }) }],
        maxTokens: 1500,
      });

      const parsed        = extractJson(reply) ?? {};
      const allowed       = new Set(users.map(u => u.id));
      const requesterBusy = participants.find(p => p.id === requester.id)?.busy ?? [];
      const plans         = validatePlans(parsed.plans, allowed, { busy: requesterBusy, windowEnd });

      return res.status(200).json({
        plans,
        ...(parsed.clarification_needed ? { clarification_needed: parsed.clarification_needed } : {}),
      });
    }

    // ── Conversational chat — persistent multi-turn scheduling assistant ─────
    // History lives server-side in ai_conversations, so every pending-event
    // chat can be reopened and continued from the Scheduling Assistant UI.
    // Context per call: user profile, friend roster (names + UUIDs + profile
    // digests), and the user's own busy windows. When the model needs other
    // participants' calendars it returns a check_availability action; we fetch
    // their real free/busy + full profiles and let it continue (≤2 lookups per
    // turn, results NOT persisted — availability goes stale, the model can
    // re-request it next turn).
    if (op === 'chat') {
      const { googleId, conversationId, message, groupId } = req.body;
      if (!googleId || !message?.trim())
        return res.status(400).json({ error: 'googleId and message required' });

      const [user] = await resolveUsers(client, [googleId]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Group mode (GroupsWidget schedule popup): the client sends groupId on
      // every message; the group's members become mandatory participants.
      const group = groupId ? await loadGroupContext(client, groupId, user.id) : null;

      // Load or create the conversation.
      let convo = conversationId ? await loadConversation(client, user.id, conversationId) : null;
      if (conversationId && !convo)
        return res.status(404).json({ error: 'Conversation not found' });
      if (!convo) {
        const title = (group ? `${group.name}: ${message.trim()}` : message.trim()).slice(0, 60);
        const { data, error } = await client
          .from('ai_conversations')
          .insert({ user_id: user.id, title, messages: [] })
          .select('id, title, messages, pending_event_id')
          .single();
        if (error) throw new Error(`Conversation store unavailable (run migration 007): ${error.message}`);
        convo = data;
      }

      // User's scheduling profile (built by Haiku on login).
      const stored = await loadProfile(client, user.id);

      // Friend roster — names + UUIDs so Sonnet can identify participants by
      // name, plus a compact profile digest per friend for early preference
      // inference (full profiles + busy windows arrive via check_availability).
      // quiet_time_since marks friends who can't be scheduled right now;
      // falls back to the legacy column set pre-migration-013.
      let { data: friendships, error: fErr } = await client
        .from('friendships')
        .select('friend:friend_id(id, name, display_name, quiet_time_since, quiet_time_until, preferences, timezone)')
        .eq('user_id', user.id);
      if (fErr) {
        ({ data: friendships, error: fErr } = await client
          .from('friendships')
          .select('friend:friend_id(id, name, display_name, quiet_time_since)')
          .eq('user_id', user.id));
      }
      if (fErr) {
        ({ data: friendships } = await client
          .from('friendships')
          .select('friend:friend_id(id, name, display_name)')
          .eq('user_id', user.id));
      }
      const friendRows   = (friendships ?? []).map(f => f.friend).filter(Boolean);
      const friendIds    = new Set(friendRows.map(f => f.id));

      // Group members may not all be friends of the requester, but they are
      // valid participants in a group-mode chat — widen the allowed set used
      // for availability lookups and plan validation.
      const allowedIds = new Set([...friendIds, ...(group?.members ?? []).map(m => m.id)]);

      // Friend profile digests + per-friend booked-event history + the user's
      // own busy windows, fetched in parallel (independent queries).
      const [friendProfs, sharedHist, availability] = await Promise.all([
        loadProfiles(client, [...friendIds]),
        gatherSharedHistory(client, user.id, [...allowedIds], user.timezone || 'UTC'),
        gatherBusy([user]),
      ]);
      const friends = friendRows.map(f => {
        const p = friendProfs[f.id];
        const qh = f.preferences?.quietHours;
        return {
          id:   f.id,
          name: f.display_name || f.name,
          ...(isQuietNow(f) ? { quiet_time: true } : {}),
          ...(qh?.enabled && qh.start && qh.end
            ? { quiet_hours: `${qh.start}–${qh.end} daily (${f.timezone || 'their local time'})` }
            : {}),
          ...(p ? { tags: p.tags, awake_hours: p.awake_hours, weekday_pattern: p.weekday_pattern } : {}),
          ...(sharedHist[f.id] ? { shared_history: sharedHist[f.id] } : {}),
        };
      });

      const persisted = Array.isArray(convo.messages) ? convo.messages : [];

      // Most recent availability lookup from an earlier turn (stored as an
      // `availability` key on the assistant message; stripped from API replay
      // below). Re-injected into context so revisions don't guess blind.
      const prevAvail = [...persisted].reverse().find(m => m.availability)?.availability ?? null;

      const tz  = user.timezone || 'UTC';
      const now = new Date();
      // comm_style is served to the model as the one-line reply-style hint
      // below, not as raw profile JSON; pinned_constraints only duplicates
      // the hard/soft lists (it's the rebuild-survival registry).
      const { comm_style: commStyle, pinned_constraints: _pins, ...schedProfile } = stored?.profile ?? {};
      const context = [
        `Current time: ${now.toLocaleString('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (user's timezone: ${tz})`,
        `Date table (next 14 days, ${tz}):\n${renderDateTable(tz)}`,
        `User: ${user.display_name || user.name}`,
        Object.keys(schedProfile).length ? `User scheduling profile: ${JSON.stringify(schedProfile)}` : null,
        commStyle?.style === 'brief'
          ? 'Reply-style preference (learned): this user likes minimal replies — one short sentence, no elaboration.'
          : commStyle?.style === 'detailed'
            ? 'Reply-style preference (learned): this user appreciates a little more context — up to 2–3 sentences when there is something worth explaining.'
            : null,
        friends.length
          ? `Friends roster (id, name, profile digest): ${JSON.stringify(friends)}`
          : 'Friends: none yet.',
        group
          ? `GROUP SCHEDULING MODE: this conversation schedules ONE event for the group "${group.name}". The other group members (id, name): ${JSON.stringify(group.members.map(m => ({ ...m, ...(sharedHist[m.id] ? { shared_history: sharedHist[m.id] } : {}) })))}. Every plan's participantIds MUST include ALL of these member ids — never ask who is attending, and run check_availability for all of them before first proposing times.`
          : null,
        `User's own busy windows (next 14 days, shown in ${tz}): ${renderBusy(availability.busy, tz)}`,
        prevAvail
          ? `Participants' calendars from an earlier lookup (fetched ${prevAvail.fetchedAt} — may be stale; see CALENDAR DATA FRESHNESS): ${JSON.stringify(prevAvail.participants)}`
          : null,
        convo.pending_event_id
          ? 'An event from this conversation has already been booked and is awaiting responses — do not propose new plans unless the user asks to reschedule.'
          : null,
      ].filter(Boolean).join('\n');

      // API message list = persisted history + the new user turn. Extra stored
      // keys (availability) are stripped — the API sees only role/content.
      const userMsg     = { role: 'user', content: message.trim() };
      const apiMessages = [...persisted, userMsg].map(m => ({ role: m.role, content: m.content }));

      // Model loop: allow up to 2 availability lookups before the final answer.
      // The static prompt + history are cache reads on every round.
      let parsed = null, raw = '', lastAvailability = null;
      for (let round = 0; round < 3; round++) {
        raw    = await callModel({ model: MODELS.SCHEDULER, system: { static: AUTHORED_PROMPT, dynamic: context }, messages: apiMessages, maxTokens: 1500 });
        parsed = extractJson(raw);

        const wantsLookup = round < 2 &&
          parsed?.action === 'check_availability' &&
          Array.isArray(parsed.participantIds);
        if (!wantsLookup) break;

        const ids  = [...new Set(parsed.participantIds.filter(id => allowedIds.has(id)))];
        const info = ids.length ? await gatherParticipantContext(client, ids) : [];
        const rendered = renderParticipants(info);
        // Digest (no profiles — the roster already carries those) persisted on
        // the assistant message so the next turn's context can reuse it.
        lastAvailability = {
          fetchedAt:    now.toISOString(),
          participants: rendered.map(({ profile, ...rest }) => rest),
        };
        apiMessages.push({ role: 'assistant', content: JSON.stringify(parsed) });
        apiMessages.push({ role: 'user', content: JSON.stringify({ availability_result: rendered, note: 'Real calendar data, busy windows rendered in each participant\'s local timezone. Now respond to the user with contract form (A).' }) });
      }

      const reply = typeof parsed?.reply === 'string' ? parsed.reply : (raw || 'Sorry — I had trouble with that. Could you rephrase?');
      const plans = validatePlans(parsed?.plans, allowedIds, { busy: availability.busy, windowEnd: availability.windowEnd });

      // Standing-constraint capture: when the model flagged a directly stated
      // durable rule ("I never do weekday lunches"), fold it into the profile
      // in memory — updateCommStyle below performs the single profile write
      // for this turn, so the two learners can't clobber each other. Actual
      // additions are surfaced to the client as `remembered` so the chat can
      // show a "saved to your profile" pill with an Undo (op:'forget-constraint').
      let profileNow = stored?.profile ?? null;
      let remembered = null;
      if (profileNow && parsed?.remember) {
        const merged = mergeConstraint(profileNow, parsed.remember);
        if (merged !== profileNow && ['hard', 'soft'].includes(parsed.remember.kind)) {
          remembered = { constraint: String(parsed.remember.constraint).trim().slice(0, 120), kind: parsed.remember.kind };
        }
        profileNow = merged;
      }

      // Persist the exchange (assistant stored as its JSON contract string so
      // plan cards re-render when the chat is reopened). Lookup exchanges are
      // not replayed verbatim, but their digest rides along on the message.
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ reply, plans, ...(remembered ? { remembered } : {}) }),
        ...(lastAvailability ? { availability: lastAvailability } : {}),
      };
      await Promise.all([
        client
          .from('ai_conversations')
          .update({ messages: [...persisted, userMsg, assistantMsg], updated_at: new Date().toISOString() })
          .eq('id', convo.id),
        // Fold this turn into the user's learned reply-style preference
        // (deterministic — no model call; errors swallowed inside). Writes
        // profileNow, which already carries any `remember` constraint above.
        updateCommStyle(client, user.id, profileNow, message.trim()),
      ]);

      return res.status(200).json({ conversationId: convo.id, reply, plans, ...(remembered ? { remembered } : {}) });
    }

    // ── add-constraint — user-typed preference from the Profile page ─────────
    // Stored as a soft constraint (same list the assistant's `remember`
    // capture feeds), so it flows into every scheduling prompt immediately.
    if (op === 'add-constraint') {
      const { googleId, constraint } = req.body;
      if (!googleId || !constraint?.trim())
        return res.status(400).json({ error: 'googleId and constraint required' });

      const [user] = await resolveUsers(client, [googleId]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const stored = await loadProfile(client, user.id);
      // No profile row yet (first login race) — store a stub holding just
      // this rule; the next Haiku build folds it in (pinned survives rebuilds
      // and the stub, having no `user` key, doesn't count as a cached profile).
      const text   = constraint.trim().slice(0, 120);
      const base   = stored?.profile ?? null;
      const merged = base
        ? mergeConstraint(base, { constraint: text, kind: 'soft' })
        : { soft_constraints: [text], pinned_constraints: [{ text, kind: 'soft' }] };

      const { error } = base
        ? await client.from('user_profiles').update({ profile: merged }).eq('user_id', user.id)
        : await client.from('user_profiles').upsert({ user_id: user.id, profile: merged }, { onConflict: 'user_id' });
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({
        ok: true,
        hard_constraints: merged.hard_constraints ?? [],
        soft_constraints: merged.soft_constraints ?? [],
      });
    }

    // ── forget-constraint — undo a learned standing rule (chat pill / Profile) ─
    if (op === 'forget-constraint') {
      const { googleId, constraint } = req.body;
      if (!googleId || !constraint?.trim())
        return res.status(400).json({ error: 'googleId and constraint required' });

      const [user] = await resolveUsers(client, [googleId]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const stored = await loadProfile(client, user.id);
      if (!stored?.profile)
        return res.status(200).json({ ok: true, hard_constraints: [], soft_constraints: [] });

      const merged = mergeConstraint(stored.profile, { constraint: constraint.trim(), kind: 'forget' });
      await client.from('user_profiles').update({ profile: merged }).eq('user_id', user.id);
      return res.status(200).json({
        ok: true,
        hard_constraints: merged.hard_constraints ?? [],
        soft_constraints: merged.soft_constraints ?? [],
      });
    }

    // ── record-booking — link a chat to the pending event it produced ────────
    // Appends a confirmation bubble (with the booked plan marker) and pins
    // pending_event_id; api/schedule.js clears the row on confirm/decline.
    if (op === 'record-booking') {
      const { googleId, conversationId, eventId, plan } = req.body;
      if (!googleId || !conversationId || !eventId)
        return res.status(400).json({ error: 'googleId, conversationId, eventId required' });

      const [user] = await resolveUsers(client, [googleId]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const convo = await loadConversation(client, user.id, conversationId);
      if (!convo) return res.status(404).json({ error: 'Conversation not found' });

      const when  = plan?.start ? new Date(plan.start).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        timeZone: user.timezone || 'UTC',
      }) : 'Your event';
      const reply = `${when} is booked${plan?.participantIds?.length ? ' — invites sent!' : '!'}`;
      const confirmMsg = { role: 'assistant', content: JSON.stringify({ reply, plans: [], booked: { start: plan?.start ?? null, title: plan?.title ?? null } }) };

      const { error } = await client
        .from('ai_conversations')
        .update({
          pending_event_id: eventId,
          messages:         [...(convo.messages ?? []), confirmMsg],
          updated_at:       new Date().toISOString(),
        })
        .eq('id', convo.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, reply });
    }

    // ── delete-conversation — user dismisses a chat from the assistant UI ────
    if (op === 'delete-conversation') {
      const { googleId, conversationId } = req.body;
      if (!googleId || !conversationId)
        return res.status(400).json({ error: 'googleId and conversationId required' });

      const [user] = await resolveUsers(client, [googleId]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { error } = await client
        .from('ai_conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', user.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? 'Internal error' });
  }
}
