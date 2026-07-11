// AI router — two-model scheduling apparatus with persistent conversations.
//
//   STAGE 1 (Haiku, "profiler")   builds a durable scheduling profile per user.
//   STAGE 2 (Sonnet, "scheduler") turns a request + every participant's profile
//                                 + real availability into candidate event plans.
//
// GET  ?op=conversations&googleId=      → { conversations } (open scheduling chats)
// GET  ?op=conversation&googleId=&id=   → { conversation } (full message history)
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
import { db, callModel, extractJson } from './_lib.js';
import { buildProfileForUser, loadProfile } from './_profiles.js';

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
  busy: renderBusy(p.busy, p.timezone),
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
async function resolveUsersByIds(client, ids) {
  if (!ids.length) return [];
  const { data } = await client
    .from('users')
    .select('id, google_id, name, display_name, timezone, access_token')
    .in('id', ids);
  return data ?? [];
}

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
    busy:     await fetchUserBusy(u, windowStart, windowEnd),
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
  '(5) Offer genuinely DISTINCT options as time/location pairs — vary the day and time-of-day across options (e.g. a weekday evening, a weekend afternoon), not three near-identical slots; suggest a location suited to the event type and participants\' frequented areas when you can, otherwise omit it. ' +
  '(6) All proposed times must be in the future, inside the availability window provided. ' +
  '(7) DATES: a date table (weekday → date, with UTC offset) is provided in your context. It is the ONLY source of truth for which date a weekday falls on — look dates up there, never compute them. When the user says "Monday"/"this weekend"/etc., resolve it against the table before anything else. ' +
  '(8) Every "start"/"end" you output must be ISO 8601 WITH the explicit UTC offset from the date table for that day (e.g. "2026-07-13T18:00:00-05:00") so the time means exactly what the participant\'s clock says — never output a bare local time or a bare "Z" time unless the timezone is UTC.';

// Static system prompt for the one-shot scheduler (op:'schedule'). Module-level
// and free of any per-request data so every call is a prompt-cache read; the
// date table / current time arrive via the dynamic system block.
const SCHEDULER_SYSTEM =
  'You are a scheduling engine. You receive a request plus, for every participant, their scheduling profile (tags, hard/soft constraints, inferred rhythm, awake hours, weekday pattern) and their individual busy intervals rendered in that participant\'s own local timezone. Find times that are reasonable for ALL participants. ' +
  SCHEDULING_RULES + ' ' +
  'You MUST respond with ONLY a raw JSON object — no prose, no markdown, no explanation. The object must have a "plans" array (up to 3 distinct time/location pairs, best first) where each entry has: "title" (string), "start" (ISO 8601 datetime with explicit UTC offset), "end" (ISO 8601 datetime with explicit UTC offset), "location" (optional string — a specific helpful venue or area suited to the event and participants; omit if unknown). Never include explanations for why a time was chosen. ' +
  'If you need clarification before proposing times, return { "plans": [], "clarification_needed": "your question here" } — still as raw JSON only.';

// Static system prompt for the conversational assistant (op:'chat'). Same
// cache discipline as SCHEDULER_SYSTEM: everything user- or time-specific
// lives in the dynamic context block, never here.
const AUTHORED_PROMPT =
  'CRITICAL OUTPUT CONTRACT: you must ALWAYS respond with ONLY a raw JSON object — never plain text, never markdown, nothing before or after the JSON. The UI parses it directly. Valid responses are exactly one of: ' +
  '(A) {"reply":"...","plans":[...]} — reply is your short, natural conversational message; plans is up to 3 suggestions (or [] when not suggesting times). Each plan: {"title":"...","start":"ISO8601 with explicit UTC offset","end":"ISO8601 with explicit UTC offset","location":"optional string","participantIds":["friend uuids from the roster, [] if for the user alone"]}. ' +
  '(B) {"action":"check_availability","participantIds":["friend uuids"]} — returns those friends\' real calendar busy windows and full scheduling profiles as the next message. ' +
  'You are a concise, friendly scheduling assistant helping one user coordinate events with friends. When the user names a friend, resolve them via the roster. BEFORE first proposing times for any event involving friends, you MUST issue check_availability for all involved friends so proposals rest on their real calendars and profiles — never guess someone else\'s availability. Do not repeat a lookup within the same turn. ' +
  'CALENDAR DATA FRESHNESS: your context may include participants\' calendars from an earlier lookup, labeled with when they were fetched. Reuse them for small revisions in the same timeframe, but if participants changed, the timeframe moved, or the data is more than a day old, issue check_availability again before proposing times. If no participant calendar data is in context, you do NOT have any — never propose times for friends from memory of a previous turn. ' +
  'CORRECTIONS: when the user rejects, corrects, or expresses doubt about a suggestion, treat that as a standing hard constraint for the rest of this conversation — never re-propose a slot (or anything materially similar) that the user turned down, and re-read their message for the specific day/time they actually asked for before revising. ' +
  SCHEDULING_RULES + ' ' +
  'Keep replies short and warm — no bullet lists, no explanations of why times were chosen. When your reply mentions a day, name both weekday and date from the date table (e.g. "Monday the 13th") so mistakes are visible. If you lack essential information (duration, rough timeframe, who is coming), set plans to [] and ask in reply. If the user gives feedback on suggestions, revise (re-check availability if participants changed). After a booking is confirmed, acknowledge briefly with plans [].';

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
        if (existing?.profile) return res.status(200).json({ profile: existing.profile, cached: true });
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
      const { data: friendships } = await client
        .from('friendships')
        .select('friend:friend_id(id, name, display_name)')
        .eq('user_id', user.id);
      const friendRows   = (friendships ?? []).map(f => f.friend).filter(Boolean);
      const friendIds    = new Set(friendRows.map(f => f.id));
      const friendProfs  = await loadProfiles(client, [...friendIds]);
      const friends      = friendRows.map(f => {
        const p = friendProfs[f.id];
        return {
          id:   f.id,
          name: f.display_name || f.name,
          ...(p ? { tags: p.tags, awake_hours: p.awake_hours, weekday_pattern: p.weekday_pattern } : {}),
        };
      });

      // Group members may not all be friends of the requester, but they are
      // valid participants in a group-mode chat — widen the allowed set used
      // for availability lookups and plan validation.
      const allowedIds = new Set([...friendIds, ...(group?.members ?? []).map(m => m.id)]);

      // User's own busy windows — gives Sonnet real availability context.
      const availability = await gatherBusy([user]);

      const persisted = Array.isArray(convo.messages) ? convo.messages : [];

      // Most recent availability lookup from an earlier turn (stored as an
      // `availability` key on the assistant message; stripped from API replay
      // below). Re-injected into context so revisions don't guess blind.
      const prevAvail = [...persisted].reverse().find(m => m.availability)?.availability ?? null;

      const tz  = user.timezone || 'UTC';
      const now = new Date();
      const context = [
        `Current time: ${now.toLocaleString('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (user's timezone: ${tz})`,
        `Date table (next 14 days, ${tz}):\n${renderDateTable(tz)}`,
        `User: ${user.display_name || user.name}`,
        stored?.profile ? `User scheduling profile: ${JSON.stringify(stored.profile)}` : null,
        friends.length
          ? `Friends roster (id, name, profile digest): ${JSON.stringify(friends)}`
          : 'Friends: none yet.',
        group
          ? `GROUP SCHEDULING MODE: this conversation schedules ONE event for the group "${group.name}". The other group members (id, name): ${JSON.stringify(group.members)}. Every plan's participantIds MUST include ALL of these member ids — never ask who is attending, and run check_availability for all of them before first proposing times.`
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

      // Persist the exchange (assistant stored as its JSON contract string so
      // plan cards re-render when the chat is reopened). Lookup exchanges are
      // not replayed verbatim, but their digest rides along on the message.
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ reply, plans }),
        ...(lastAvailability ? { availability: lastAvailability } : {}),
      };
      await client
        .from('ai_conversations')
        .update({ messages: [...persisted, userMsg, assistantMsg], updated_at: new Date().toISOString() })
        .eq('id', convo.id);

      return res.status(200).json({ conversationId: convo.id, reply, plans });
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
