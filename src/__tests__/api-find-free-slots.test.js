// Unit tests for findFreeSlots (api/schedule.js) — the calendar-aware
// free-slot search used by the "Find a time" flow.
import { findFreeSlots } from '../../api/schedule';

const HOUR = 60 * 60 * 1000;

// A fixed one-week window starting on a known Monday at midnight local time.
const windowStart = new Date(2030, 5, 3, 0, 0, 0, 0);   // Mon Jun 3 2030
const windowEnd   = new Date(windowStart.getTime() + 7 * 24 * HOUR);

describe('findFreeSlots', () => {
  it('proposes up to 3 slots in an empty calendar', () => {
    const slots = findFreeSlots([], windowStart, windowEnd, HOUR);
    expect(slots.length).toBe(3);
  });

  it('prefers daytime hours (9–18) when the calendar is free', () => {
    const slots = findFreeSlots([], windowStart, windowEnd, HOUR);
    for (const iso of slots) {
      const h = new Date(iso).getHours();
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThan(18);
    }
  });

  it('spaces proposals at least 6 hours apart', () => {
    const slots = findFreeSlots([], windowStart, windowEnd, HOUR)
      .map(iso => new Date(iso).getTime())
      .sort((a, b) => a - b);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(6 * HOUR);
    }
  });

  it('never proposes a slot overlapping a busy interval', () => {
    // Busy every day 9:00–17:00 for the whole week → daytime pass mostly blocked.
    const busy = [];
    for (let d = 0; d < 7; d++) {
      const s = new Date(windowStart.getTime() + d * 24 * HOUR);
      s.setHours(9, 0, 0, 0);
      busy.push({ start: s.toISOString(), end: new Date(s.getTime() + 8 * HOUR).toISOString() });
    }
    const slots = findFreeSlots(busy, windowStart, windowEnd, HOUR);
    for (const iso of slots) {
      const start = new Date(iso).getTime();
      const end = start + HOUR;
      for (const b of busy) {
        const bs = new Date(b.start).getTime();
        const be = new Date(b.end).getTime();
        expect(start < be && end > bs).toBe(false);
      }
    }
  });

  it('returns no slot that extends past the window end', () => {
    const slots = findFreeSlots([], windowStart, windowEnd, 2 * HOUR);
    for (const iso of slots) {
      expect(new Date(iso).getTime() + 2 * HOUR).toBeLessThanOrEqual(windowEnd.getTime());
    }
  });

  it('merges overlapping busy intervals correctly', () => {
    // Two overlapping blocks covering 9:00–13:00 on day 1
    const d1 = new Date(windowStart); d1.setHours(9, 0, 0, 0);
    const busy = [
      { start: d1.toISOString(), end: new Date(d1.getTime() + 3 * HOUR).toISOString() },
      { start: new Date(d1.getTime() + 2 * HOUR).toISOString(), end: new Date(d1.getTime() + 4 * HOUR).toISOString() },
    ];
    const slots = findFreeSlots(busy, windowStart, windowEnd, HOUR);
    for (const iso of slots) {
      const start = new Date(iso).getTime();
      const overlaps = start < d1.getTime() + 4 * HOUR && start + HOUR > d1.getTime();
      expect(overlaps).toBe(false);
    }
  });
});
