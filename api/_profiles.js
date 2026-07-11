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

// gatherUserSignals — builds the payload Haiku reasons over: identity + calendar behavior.
async function gatherUserSignals(user, notes = '') {
  let recentEvents = [];
  if (user.access_token) {
    try { recentEvents = await fetchRecentEvents(decrypt(user.access_token), user.timezone || 'UTC'); } catch {}
  }
  return {
    user:        user.display_name || user.name || 'User',
    timezone:    user.timezone || 'UTC',
    statedNotes: notes || null,
    recentEvents,
  };
}

// Haiku profiler system prompt — consumed by buildProfileForUser below.
// Output schema: { user, tags[], hard_constraints[], soft_constraints[],
//                  inferred_rhythm, awake_hours, weekday_pattern }
const PROFILER_SYSTEM =
  'Read through the user\'s calendar history and stated notes. Every event\'s weekday and hour is already expressed in the user\'s own local timezone — treat them as local clock times. Compile a scheduling profile: occupation, when they are typically busy, what hours of the day they are most active, how often they have social events, who they see most often, frequented locations. ' +
  'Infer the invisible structure too: from event start/end times estimate when this person sleeps and wakes, and whether their weekdays show a work/school pattern (regular daytime commitments) or a flexible daytime. Sparse weekday daytime events do NOT prove availability — say so in weekday_pattern when the calendar is inconclusive. ' +
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
// out: the stored profile object.
export async function buildProfileForUser(client, user, notes = '') {
  const signals = await gatherUserSignals(user, notes);

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

  await saveProfile(client, user.id, profile, signals);
  return profile;
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
