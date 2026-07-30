import { loadWorld } from './demoStore';

// The demo's stand-in for the scheduling assistant.
//
// The language understanding here is keyword matching, not a model — the real
// assistant needs an account, and the demo says so on screen. But the part that
// matters is honest: once it knows who and roughly when, it computes genuinely
// free intersections from the fixture calendars. Name two demo friends and the
// times it proposes really are free for both of them.
//
// Replies use the same { reply, plans } contract the real endpoint returns
// (api/ai.js), so SchedulingAssistant renders them unmodified.

// Activity keywords → what to schedule and when it usually happens. Order
// matters: the first match wins, so put specific words before generic ones.
const ACTIVITIES = [
  { match: ['dinner', 'eat', 'food', 'restaurant'], title: 'Dinner',    hours: [18, 19, 20], duration: 2 },
  { match: ['lunch'],                               title: 'Lunch',     hours: [12, 13],     duration: 1 },
  { match: ['breakfast', 'brunch'],                 title: 'Brunch',    hours: [9, 10, 11],  duration: 2 },
  { match: ['coffee'],                              title: 'Coffee',    hours: [9, 10, 15],  duration: 1 },
  { match: ['drink', 'drinks', 'bar', 'beer'],      title: 'Drinks',    hours: [18, 19, 20], duration: 2 },
  { match: ['climb', 'climbing', 'gym', 'workout', 'run'], title: 'Climbing', hours: [17, 18, 19], duration: 2 },
  { match: ['movie', 'film', 'cinema'],             title: 'Movie',     hours: [19, 20],     duration: 2 },
  { match: ['call', 'meet', 'meeting', 'catch up', 'catchup'], title: 'Catch-up', hours: [10, 11, 14, 15], duration: 1 },
];

const DEFAULT_ACTIVITY = { title: 'Hangout', hours: [18, 19, 12, 15], duration: 2 };

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ── Parsing ──────────────────────────────────────────────────────────────────

// findPeople — fixture friends named anywhere in the message, by first name or
// full name. "everyone" / "all" pulls in every friend; a group name pulls in
// that group's accepted members. out: { ids: string[], names: string[] }
function findPeople(text, world) {
  const lower = text.toLowerCase();
  const ids = new Set();

  for (const g of world.groups) {
    if (lower.includes(g.name.toLowerCase())) {
      g.members
        .filter(m => m.status === 'accepted' && m.id !== world.me.id)
        .forEach(m => ids.add(m.id));
    }
  }

  for (const f of world.friends) {
    const full  = (f.display_name || f.name).toLowerCase();
    const first = full.split(' ')[0];
    // Word-boundary match so "sam" doesn't fire inside "same".
    if (new RegExp(`\\b${first}\\b`).test(lower) || lower.includes(full)) ids.add(f.id);
  }

  if (/\b(everyone|everybody|all of us|the group)\b/.test(lower)) {
    world.friends.forEach(f => ids.add(f.id));
  }

  const list = [...ids];
  return {
    ids:   list,
    names: list.map(id => {
      const f = world.friends.find(x => x.id === id);
      return (f?.display_name || f?.name || 'someone').split(' ')[0];
    }),
  };
}

// findWindow — the day range to search, as offsets from today. Understands a
// few common phrasings and falls back to the next week.
// out: { from: number, to: number, label: string }
function findWindow(text) {
  const lower = text.toLowerCase();
  const today = new Date().getDay();

  if (/\btomorrow\b/.test(lower))              return { from: 1, to: 1,  label: 'tomorrow' };
  if (/\btonight|this evening\b/.test(lower))  return { from: 0, to: 0,  label: 'tonight' };
  if (/\bthis week\b/.test(lower))             return { from: 0, to: 6,  label: 'this week' };
  if (/\bnext week\b/.test(lower))             return { from: 7, to: 13, label: 'next week' };
  if (/\bweekend\b/.test(lower)) {
    // Next Saturday and Sunday (today counts if it's already the weekend).
    const toSat = (6 - today + 7) % 7;
    return { from: toSat, to: toSat + 1, label: 'this weekend' };
  }

  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(lower)) {
      const offset = (i - today + 7) % 7 || 7; // always the *next* one
      return { from: offset, to: offset, label: WEEKDAYS[i] };
    }
  }

  return { from: 0, to: 13, label: 'over the next couple of weeks' };
}

// findActivity — what kind of event this is. out: activity descriptor
function findActivity(text) {
  const lower = text.toLowerCase();
  return ACTIVITIES.find(a => a.match.some(m => lower.includes(m))) ?? DEFAULT_ACTIVITY;
}

// ── Slot finding (the part that is genuinely real) ───────────────────────────

// busyFor — every busy interval for these people, as [startMs, endMs] pairs.
// out: array of [number, number]
function busyFor(ids, world) {
  return ids
    .flatMap(id => world.calendars[id] ?? [])
    .map(e => [new Date(e.start.dateTime).getTime(), new Date(e.end.dateTime).getTime()])
    .filter(([s, e]) => !isNaN(s) && !isNaN(e));
}

// findSlots — up to `limit` start times where every participant is free, one
// per day so proposals aren't three variations of the same evening. Mirrors the
// filtering validatePlans applies server-side (api/ai.js): future only, no
// overlap with any busy window. out: array of { start: Date, end: Date }
export function findSlots({ participantIds, window, activity, world, limit = 3, now = Date.now() }) {
  const busy = busyFor(participantIds, world);
  const free = (startMs, endMs) => !busy.some(([bs, be]) => startMs < be && endMs > bs);

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const found = [];
  for (let day = window.from; day <= window.to && found.length < limit; day++) {
    for (const hour of activity.hours) {
      const start = new Date(midnight);
      start.setDate(start.getDate() + day);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + activity.duration * 3600_000);

      if (start.getTime() <= now) continue;
      if (!free(start.getTime(), end.getTime())) continue;

      found.push({ start, end });
      break; // one slot per day
    }
  }
  return found;
}

// ── Reply generation ─────────────────────────────────────────────────────────

const DAY_FMT  = { weekday: 'long', month: 'short', day: 'numeric' };
const TIME_FMT = { hour: 'numeric', minute: '2-digit' };

// respond — the whole scripted turn: parse the message, find real free slots,
// and return the { reply, plans } contract SchedulingAssistant expects. Plan
// cards match the shape validatePlans emits server-side (api/ai.js:318).
// out: { reply: string, plans: array }
export function respond(message) {
  const world = loadWorld();
  const text  = String(message ?? '').trim();

  const { ids, names } = findPeople(text, world);

  // No recognisable participants: say plainly that this is a stand-in rather
  // than bluffing an answer the demo can't actually produce.
  if (!ids.length) {
    const examples = world.friends.slice(0, 2).map(f => f.name.split(' ')[0]).join(' and ');
    return {
      reply:
        `I'm a scripted stand-in for this demo, so I only know ${world.me.name.split(' ')[0]}'s demo friends — ` +
        `${world.friends.map(f => f.name.split(' ')[0]).join(', ')}. ` +
        `Try something like "dinner with ${examples} next week".\n\n` +
        `The real assistant reads everyone's actual calendars and handles this in plain language.`,
      plans: [],
    };
  }

  const window   = findWindow(text);
  const activity = findActivity(text);
  const withMe   = [world.me.id, ...ids];
  const slots    = findSlots({ participantIds: withMe, window, activity, world });

  const who = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  if (!slots.length) {
    return {
      reply:
        `${names.length === 1 ? `${who} is` : `You and ${who} are`} booked solid ${window.label} — ` +
        `nothing opens up for ${activity.title.toLowerCase()}. Try a wider range, like "next week".`,
      plans: [],
    };
  }

  const plans = slots.map(s => ({
    title:          `${activity.title} with ${who}`,
    start:          s.start.toISOString(),
    end:            s.end.toISOString(),
    participantIds: ids,
  }));

  const first = slots[0].start;
  return {
    reply:
      `Checked ${names.length === 1 ? `${who}'s calendar` : 'everyone\'s calendars'} — ` +
      `${slots.length === 1 ? 'one time works' : `${slots.length} times work`} ${window.label}. ` +
      `${first.toLocaleDateString('en-US', DAY_FMT)} at ${first.toLocaleTimeString('en-US', TIME_FMT)} ` +
      `is the earliest. Pick one and I'll send the invite.`,
    plans,
  };
}
