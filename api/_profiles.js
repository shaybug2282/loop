// Scheduling-profile pipeline — the Haiku "profiler" that distills a durable,
// per-user scheduling profile from calendar behavior.
//
// Lifecycle:
//   • created once on the user's first login  (api/ai.js op:'build-profile')
//   • refreshed at most once per week, and only when the user is invited to an
//     event (api/schedule.js create-event → refreshProfileIfStale)
// All other scheduling in a given week reuses that one profile — it is NOT
// rewritten on every event. The Sonnet scheduler still reads live calendars
// separately (api/ai.js gatherBusy) to avoid conflicts.
//
// A `_`-prefixed module: imported by the routers, never deployed as its own
// Vercel function.

import { decrypt } from './_crypto.js';
import { callModel, extractJson } from './_lib.js';

const PROFILER_MODEL = 'claude-haiku-4-5';

// A profile is rebuilt at most this often. The single weekly refresh is
// triggered by an event invitation; everything else that week reuses it.
export const PROFILE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

// loadProfile — stored scheduling profile for a user. out: row or null.
export async function loadProfile(client, userId) {
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
// weekday/hour are computed in the USER's timezone, not the server's (UTC on
// Vercel) — otherwise every signal shifts by the UTC offset and the inferred
// awake_hours / weekday_pattern come out wrong.
async function fetchRecentEvents(token, tz = 'UTC', days = 30) {
  const now     = new Date();
  const timeMin = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const url =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
    `?timeMin=${timeMin}&timeMax=${now.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=100`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const { items = [] } = await r.json();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  return items
    .filter(ev => ev.start?.dateTime)
    .map(ev => {
      const start = new Date(ev.start.dateTime);
      const end   = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
      const parts = fmt.formatToParts(start);
      const get   = t => parts.find(p => p.type === t)?.value ?? '';
      return {
        title:         ev.summary ?? '(untitled)',
        weekday:       get('weekday'),
        hour:          Number(get('hour')),
        durationHours: end ? +((end - start) / 3.6e6).toFixed(1) : null,
        recurring:     Boolean(ev.recurringEventId),
        location:      ev.location ?? null,
      };
    });
}

// recordOutcome — append one durable row to event_outcomes at the moment a
// user answers (or creates) an invite. This is what lets outcome history
// survive the 2-week purge of dead pending_events rows. `ev` needs
// { id, title?, event_time, duration_hours? }. Errors ignored (an unmigrated
// DB without 010 still gets outcomes via the pending_events backfill below).
export async function recordOutcome(client, userId, ev, response) {
  try {
    await client.from('event_outcomes').insert({
      user_id:        userId,
      event_id:       ev.id ?? null,
      response,
      title:          ev.title ?? null,
      event_time:     ev.event_time ?? null,
      duration_hours: ev.duration_hours ?? null,
    });
  } catch { /* best-effort logging */ }
}

// fetchAppOutcomes — events scheduled through THIS app and how the user
// responded to each: revealed preferences the Google calendar can't show
// (declines and reschedule requests never become calendar events). Primary
// source is the durable event_outcomes log (written at response time, immune
// to purges); pending_events rows the log doesn't cover — pre-010 history,
// unmigrated DBs — are backfilled, including declines/reschedule_requests
// arrays so users the decline flow removed from invited_user_ids still count.
// weekday/hour are local to the user, same convention as fetchRecentEvents.
// out: [{ title, weekday, hour, durationHours, response, status? }] (≤40).
async function fetchAppOutcomes(client, userId, tz = 'UTC') {
  let logged = [];
  try {
    const { data } = await client
      .from('event_outcomes')
      .select('event_id, response, title, event_time, duration_hours')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40);
    logged = data ?? [];
  } catch {}

  const { data: evs } = await client
    .from('pending_events')
    .select('id, creator_id, invited_user_ids, acceptances, declines, reschedule_requests, status, event_time, duration_hours, title')
    .or(`creator_id.eq.${userId},invited_user_ids.cs.{${userId}},declines.cs.{${userId}},reschedule_requests.cs.{${userId}}`)
    .order('created_at', { ascending: false })
    .limit(40);

  const seen    = new Set(logged.map(o => o.event_id).filter(Boolean));
  const derived = (evs ?? [])
    .filter(e => !seen.has(e.id))
    .map(e => ({
      event_id:       e.id,
      response:
        e.creator_id === userId                        ? 'created' :
        (e.reschedule_requests ?? []).includes(userId) ? 'asked_to_reschedule' :
        (e.declines ?? []).includes(userId)            ? 'declined' :
        (e.acceptances ?? []).includes(userId)         ? 'accepted' : 'no_response_yet',
      title:          e.title,
      event_time:     e.event_time,
      duration_hours: e.duration_hours,
      status:         e.status,
    }));

  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  return [...logged, ...derived].slice(0, 40).map(o => {
    const parts = o.event_time ? fmt.formatToParts(new Date(o.event_time)) : [];
    const get   = t => parts.find(p => p.type === t)?.value ?? '';
    return {
      title:         o.title || 'Hangout',
      weekday:       get('weekday') || null,
      hour:          parts.length ? Number(get('hour')) : null,
      durationHours: o.duration_hours ?? null,
      response:      o.response,
      ...(o.status ? { status: o.status } : {}),
    };
  });
}

// gatherUserSignals — builds the payload Haiku reasons over: identity,
// calendar behavior, in-app booking outcomes, and the user's own reschedule
// notes (recorded by recordRescheduleNote below).
async function gatherUserSignals(client, user, notes = '', prevProfile = null) {
  let recentEvents = [], appOutcomes = [];
  if (user.access_token) {
    try { recentEvents = await fetchRecentEvents(decrypt(user.access_token), user.timezone || 'UTC'); } catch {}
  }
  try { appOutcomes = await fetchAppOutcomes(client, user.id, user.timezone || 'UTC'); } catch {}
  return {
    user:        user.display_name || user.name || 'User',
    timezone:    user.timezone || 'UTC',
    statedNotes: notes || null,
    statedRescheduleNotes: prevProfile?.reschedule_notes ?? [],
    recentEvents,
    appOutcomes,
  };
}

// Haiku profiler system prompt — consumed by buildProfileForUser below.
// Output schema: { user, tags[], hard_constraints[], soft_constraints[],
//                  inferred_rhythm, awake_hours, weekday_pattern }
const PROFILER_SYSTEM =
  'Read through the user\'s calendar history and stated notes. Every event\'s weekday and hour is already expressed in the user\'s own local timezone — treat them as local clock times. Compile a scheduling profile: occupation, when they are typically busy, what hours of the day they are most active, how often they have social events, who they see most often, frequented locations. ' +
  'Infer the invisible structure too: from event start/end times estimate when this person sleeps and wakes, and whether their weekdays show a work/school pattern (regular daytime commitments) or a flexible daytime. Sparse weekday daytime events do NOT prove availability — say so in weekday_pattern when the calendar is inconclusive. ' +
  'appOutcomes lists events scheduled through this app and how the user responded (accepted / declined / asked_to_reschedule / created / no_response_yet) — treat acceptances and self-created events as revealed preferences, and declines or reschedule requests as evidence about times or kinds of events this user avoids. ' +
  'statedRescheduleNotes are the user\'s own words when asking to move events (with dates) — mine them for durable rules ("evenings after 6 work best" → constraint) and ignore one-off conflicts ("out of town that week"). ' +
  'You MUST respond with ONLY a raw JSON object — no prose, no markdown, no explanation. The object must have exactly these keys: ' +
  '"user" (string), ' +
  '"tags" (array of short descriptive strings, e.g. "student", "early riser", "gym regular", "often at Cafe Luna"), ' +
  '"hard_constraints" (array of inviolable rules, e.g. "no meetings before 9am"), ' +
  '"soft_constraints" (array of preferences, e.g. "prefers evenings for social events"), ' +
  '"inferred_rhythm" (single string summarizing their daily pattern), ' +
  '"awake_hours" (string like "07:30-23:00" — your best estimate of when they are awake; use "unknown" only if there is truly no signal), ' +
  '"weekday_pattern" (string: does this person appear to have work/school on weekdays? e.g. "9-5 office pattern Mon-Fri", "student, classes Mon/Wed/Fri mornings", "flexible daytime", or "inconclusive — assume daytime commitments"). ' +
  'If you cannot infer something, use an empty array or empty string.';

// buildProfileForUser — run the Haiku profiler for one user and persist the
// result. `user` needs { id, name/display_name, timezone, access_token }.
// App-learned keys (comm_style from updateCommStyle, reschedule_notes from
// recordRescheduleNote) survive rebuilds — Haiku never outputs them and would
// otherwise wipe them weekly; reschedule_notes are also fed IN as signals.
// out: the stored profile object.
export async function buildProfileForUser(client, user, notes = '') {
  const existing = await loadProfile(client, user.id);
  const signals  = await gatherUserSignals(client, user, notes, existing?.profile);

  const reply = await callModel({
    model:     PROFILER_MODEL,
    system:    PROFILER_SYSTEM,
    messages:  [{ role: 'user', content: JSON.stringify(signals) }],
    maxTokens: 800,
  });

  const profile = extractJson(reply) ?? {
    user: signals.user, tags: [], hard_constraints: [], soft_constraints: [],
    inferred_rhythm: '', awake_hours: 'unknown', weekday_pattern: 'inconclusive',
  };

  if (existing?.profile?.comm_style)       profile.comm_style       = existing.profile.comm_style;
  if (existing?.profile?.reschedule_notes) profile.reschedule_notes = existing.profile.reschedule_notes;

  // User-stated rules (Preferences input / chat `remember`) are pinned: the
  // rebuild regenerates hard/soft lists from calendar signals, so re-apply
  // each pinned rule that the fresh lists don't already contain.
  const pinned = existing?.profile?.pinned_constraints;
  if (pinned?.length) {
    profile.pinned_constraints = pinned;
    for (const p of pinned) {
      const key  = p.kind === 'hard' ? 'hard_constraints' : 'soft_constraints';
      const list = Array.isArray(profile[key]) ? profile[key] : [];
      if (!list.some(c => String(c).toLowerCase() === String(p.text).toLowerCase()))
        profile[key] = [...list, p.text];
    }
  }

  await saveProfile(client, user.id, profile, signals);
  return profile;
}

// mergeConstraint — pure: fold a user-stated standing rule into a profile.
// entry: { constraint, kind: 'hard'|'soft'|'forget' } from the assistant's
// `remember` contract field or the Profile page's Preferences input.
// 'forget' removes any matching entry (case-insensitive substring either way,
// so "no weekday lunches" retracts "never schedules weekday lunches"). Adds
// dedupe case-insensitively and cap each list at 12.
// Every add is also registered in pinned_constraints — the durable record of
// USER-stated rules, which buildProfileForUser re-applies after each weekly
// Haiku rebuild (the rebuild regenerates hard/soft lists from calendar
// signals and would otherwise silently drop them).
// out: a new profile object (input untouched), or the input when invalid.
export function mergeConstraint(profile, entry) {
  const text = typeof entry?.constraint === 'string' ? entry.constraint.trim().slice(0, 120) : '';
  const kind = entry?.kind;
  if (!profile || !text || !['hard', 'soft', 'forget'].includes(kind)) return profile;

  const lower  = text.toLowerCase();
  const pinned = Array.isArray(profile.pinned_constraints) ? profile.pinned_constraints : [];

  if (kind === 'forget') {
    const keep = list => (list ?? []).filter(c => {
      const cl = String(c).toLowerCase();
      return !cl.includes(lower) && !lower.includes(cl);
    });
    return {
      ...profile,
      hard_constraints:   keep(profile.hard_constraints),
      soft_constraints:   keep(profile.soft_constraints),
      pinned_constraints: pinned.filter(p => {
        const pl = String(p.text).toLowerCase();
        return !pl.includes(lower) && !lower.includes(pl);
      }),
    };
  }

  const key  = kind === 'hard' ? 'hard_constraints' : 'soft_constraints';
  const list = Array.isArray(profile[key]) ? profile[key] : [];
  const nextPinned = pinned.some(p => String(p.text).toLowerCase() === lower)
    ? pinned
    : [...pinned, { text, kind }].slice(-12);
  if (list.some(c => String(c).toLowerCase() === lower))
    return { ...profile, pinned_constraints: nextPinned };
  return { ...profile, [key]: [...list, text].slice(-12), pinned_constraints: nextPinned };
}

// recordRescheduleNote — bank an invitee's "this doesn't work for me" note on
// their own profile (rolling last 5, with dates). Not used for scheduling
// directly: it rides into the next weekly Haiku rebuild as
// statedRescheduleNotes, where durable rules get distilled into constraints.
// No-op when the user has no profile row yet; errors swallowed.
export async function recordRescheduleNote(client, userId, note) {
  try {
    const existing = await loadProfile(client, userId);
    if (!existing?.profile) return;
    const notes = [...(existing.profile.reschedule_notes ?? []), { note: note.slice(0, 200), at: new Date().toISOString().slice(0, 10) }].slice(-5);
    await client
      .from('user_profiles')
      .update({ profile: { ...existing.profile, reschedule_notes: notes } })
      .eq('user_id', userId);
  } catch { /* best-effort learning */ }
}

// Explicit reply-length cues in a user message — these override anything the
// implicit word-count signal says, permanently until contradicted.
const BRIEF_CUES  = /\b(shorter|too long|too wordy|less detail|keep it (short|brief)|be brief|just (the )?(times?|options?))\b/i;
const DETAIL_CUES = /\b(more detail|explain|elaborate|tell me more|walk me through|why\b)/i;

// updateCommStyle — deterministic (no model call) reply-style learner, run on
// every chat turn. Folds the message into an EWMA of the user's message word
// counts and scans for explicit length cues; the derived style
// ('brief'|'detailed'|'neutral') is stored as profile.comm_style and injected
// into the scheduler's context as a one-line hint. Uses .update() (not upsert)
// so a user with no profile row yet is a no-op — a synthetic row here would
// trick build-profile's "already exists" gate — and leaves updated_at alone so
// the weekly Haiku refresh cadence keys off real rebuilds only.
// out: nothing; all errors swallowed (learning never blocks a chat reply).
export async function updateCommStyle(client, userId, profile, message) {
  try {
    if (!profile) return;
    const prev  = profile.comm_style ?? {};
    const words = message.trim().split(/\s+/).length;
    const msgs  = (prev.msgs ?? 0) + 1;
    const ewma  = prev.ewma_words == null ? words : +(0.7 * prev.ewma_words + 0.3 * words).toFixed(1);

    let explicit = prev.explicit ?? null;
    if (BRIEF_CUES.test(message)) explicit = 'brief';
    else if (DETAIL_CUES.test(message)) explicit = 'detailed';

    // Implicit signal needs a few messages before it's trusted.
    const style = explicit ??
      (msgs >= 4 ? (ewma < 9 ? 'brief' : ewma > 25 ? 'detailed' : 'neutral') : 'neutral');

    await client
      .from('user_profiles')
      .update({ profile: { ...profile, comm_style: { style, explicit, ewma_words: ewma, msgs } } })
      .eq('user_id', userId);
  } catch { /* best-effort learning */ }
}

// refreshProfileIfStale — the weekly refresh gate. Rebuilds the user's profile
// only when it is missing or older than PROFILE_REFRESH_MS; otherwise the
// stored profile is reused untouched. Called when a user is invited to an
// event, so at most one Haiku rebuild happens per user per week regardless of
// how many events are scheduled. out: { profile, refreshed }.
export async function refreshProfileIfStale(client, user) {
  const existing = await loadProfile(client, user.id);
  if (existing?.profile &&
      Date.now() - new Date(existing.updated_at).getTime() < PROFILE_REFRESH_MS) {
    return { profile: existing.profile, refreshed: false };
  }
  const profile = await buildProfileForUser(client, user);
  return { profile, refreshed: true };
}
