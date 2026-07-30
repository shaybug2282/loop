// Unit tests for demo mode's seeded world and its scripted assistant.
//
// The assistant's language understanding is keyword matching and not worth
// pinning down exhaustively, but the slot finder is real arithmetic that the
// demo presents as truth — if it proposes a time someone is busy, the demo is
// lying to visitors. That's what these cover.
import { seedWorld, DEMO_ME, FRIEND_IDS } from '../demo/demoFixtures';
import { findSlots } from '../demo/demoAssistant';

const HOUR = 3600_000;

describe('seedWorld', () => {
  it('anchors fixture dates to today, not a hardcoded date', () => {
    const w = seedWorld();
    const starts = w.calendars[DEMO_ME].map(e => new Date(e.start.dateTime).getTime());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Everything lands in the two-week span the demo can be asked about.
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(today.getTime());
    expect(Math.max(...starts)).toBeLessThan(today.getTime() + 15 * 24 * HOUR);
  });

  it('puts real conflicts in week two, where "next week" queries land', () => {
    // The landing page suggests "dinner with Sam next week", so week two must
    // have evening conflicts to dodge — otherwise the assistant's "checked
    // everyone's calendars" is true but demonstrates nothing.
    const w = seedWorld();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekTwoStart = today.getTime() + 7 * 24 * HOUR;

    for (const id of [DEMO_ME, ...w.friends.map(f => f.id)]) {
      const inWeekTwo = (w.calendars[id] ?? [])
        .filter(e => new Date(e.start.dateTime).getTime() >= weekTwoStart);
      expect(inWeekTwo.length).toBeGreaterThan(0);
    }
  });

  it('gives every friend a calendar the slot finder can read', () => {
    const w = seedWorld();
    for (const f of w.friends) {
      expect(Array.isArray(w.calendars[f.id])).toBe(true);
      expect(w.calendars[f.id].length).toBeGreaterThan(0);
    }
  });

  it('seeds a pending event so the dashboard is not empty on first load', () => {
    const w = seedWorld();
    expect(w.pendingEvents.length).toBeGreaterThan(0);
    expect(w.pendingEvents[0].creator_id).toBe(DEMO_ME);
  });
});

describe('findSlots', () => {
  const world = seedWorld();
  const activity = { title: 'Dinner', hours: [18, 19, 20], duration: 2 };
  const window = { from: 0, to: 13, label: 'test' };

  // overlaps — does [start,end) collide with any of these people's events?
  const overlaps = (slot, ids) =>
    ids.flatMap(id => world.calendars[id] ?? []).some(e => {
      const bs = new Date(e.start.dateTime).getTime();
      const be = new Date(e.end.dateTime).getTime();
      return slot.start.getTime() < be && slot.end.getTime() > bs;
    });

  it('never proposes a time any participant is busy', () => {
    const ids = [DEMO_ME, FRIEND_IDS.sam, FRIEND_IDS.priya];
    const slots = findSlots({ participantIds: ids, window, activity, world });

    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(overlaps(s, ids)).toBe(false);
  });

  it('never proposes a time in the past', () => {
    const now = Date.now();
    const slots = findSlots({
      participantIds: [DEMO_ME], window, activity, world, now,
    });
    for (const s of slots) expect(s.start.getTime()).toBeGreaterThan(now);
  });

  it('caps at three proposals', () => {
    const slots = findSlots({ participantIds: [DEMO_ME], window, activity, world });
    expect(slots.length).toBeLessThanOrEqual(3);
  });

  it('spreads proposals across different days', () => {
    const slots = findSlots({ participantIds: [DEMO_ME], window, activity, world });
    const days = new Set(slots.map(s => s.start.toDateString()));
    expect(days.size).toBe(slots.length);
  });

  it('honours the requested duration', () => {
    const slots = findSlots({
      participantIds: [DEMO_ME], window, world,
      activity: { title: 'Coffee', hours: [9, 10], duration: 1 },
    });
    for (const s of slots) {
      expect(s.end.getTime() - s.start.getTime()).toBe(1 * HOUR);
    }
  });

  it('returns nothing when the window is fully booked', () => {
    // A person busy across the whole candidate window has no openings.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);
    const blocked = {
      ...world,
      calendars: {
        ...world.calendars,
        'blocked-person': [{
          id: 'x',
          start: { dateTime: start.toISOString() },
          end:   { dateTime: new Date(start.getTime() + 48 * HOUR).toISOString() },
        }],
      },
    };

    const slots = findSlots({
      participantIds: ['blocked-person'],
      window: { from: 1, to: 1, label: 'tomorrow' },
      activity, world: blocked,
    });
    expect(slots).toEqual([]);
  });
});
