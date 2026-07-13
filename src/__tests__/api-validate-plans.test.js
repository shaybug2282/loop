// Unit tests for validatePlans and renderDateTable (api/ai.js) — the
// deterministic guards behind the scheduler's date/time correctness.
import { validatePlans, renderDateTable } from '../../api/ai';

describe('validatePlans', () => {
  const FRIEND = 'aaaaaaaa-1111-2222-3333-444444444444';
  const allowed = new Set([FRIEND]);
  // Fixed clock: noon UTC on Sat 2026-07-11.
  const NOW = new Date('2026-07-11T12:00:00Z').getTime();

  const plan = (over = {}) => ({
    title: 'Dinner',
    start: '2026-07-13T18:00:00-05:00',
    end:   '2026-07-13T20:00:00-05:00',
    participantIds: [FRIEND],
    ...over,
  });

  it('accepts a valid future plan with explicit offsets', () => {
    const out = validatePlans([plan()], allowed, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].start).toBe('2026-07-13T23:00:00.000Z');
    expect(out[0].participantIds).toEqual([FRIEND]);
  });

  it('accepts Z-suffixed (UTC) datetimes', () => {
    expect(validatePlans([plan({ start: '2026-07-13T23:00:00Z', end: '2026-07-14T01:00:00Z' })], allowed, { now: NOW }))
      .toHaveLength(1);
  });

  it('rejects offset-less datetimes (would be misparsed as UTC)', () => {
    expect(validatePlans([plan({ start: '2026-07-13T18:00:00' })], allowed, { now: NOW })).toHaveLength(0);
  });

  it('rejects plans in the past', () => {
    expect(validatePlans([plan({ start: '2026-07-10T18:00:00Z', end: '2026-07-10T20:00:00Z' })], allowed, { now: NOW }))
      .toHaveLength(0);
  });

  it('rejects end at or before start', () => {
    expect(validatePlans([plan({ end: plan().start })], allowed, { now: NOW })).toHaveLength(0);
  });

  it('rejects starts beyond the scheduling window', () => {
    const windowEnd = '2026-07-12T12:00:00Z';
    expect(validatePlans([plan()], allowed, { now: NOW, windowEnd })).toHaveLength(0);
  });

  it('rejects plans overlapping the requester busy intervals', () => {
    const busy = [{ start: '2026-07-13T22:00:00Z', end: '2026-07-14T00:00:00Z' }]; // 17:00–19:00 -05:00
    expect(validatePlans([plan()], allowed, { now: NOW, busy })).toHaveLength(0);
  });

  it('keeps plans that end exactly when a busy interval starts', () => {
    const busy = [{ start: '2026-07-14T01:00:00Z', end: '2026-07-14T03:00:00Z' }]; // starts at plan end
    expect(validatePlans([plan()], allowed, { now: NOW, busy })).toHaveLength(1);
  });

  it('filters unknown participant ids and clamps to 3 plans', () => {
    const p = plan({ participantIds: [FRIEND, 'not-a-friend'] });
    const out = validatePlans([p, plan({ start: '2026-07-14T10:00:00Z', end: '2026-07-14T11:00:00Z' }), plan({ start: '2026-07-15T10:00:00Z', end: '2026-07-15T11:00:00Z' }), plan({ start: '2026-07-16T10:00:00Z', end: '2026-07-16T11:00:00Z' })], allowed, { now: NOW });
    expect(out).toHaveLength(3);
    expect(out[0].participantIds).toEqual([FRIEND]);
  });

  it('passes through a trimmed description capped at 200 chars, drops empty/non-string ones', () => {
    const out = validatePlans([
      plan({ description: `  ${'x'.repeat(250)}  ` }),
      plan({ start: '2026-07-14T10:00:00Z', end: '2026-07-14T11:00:00Z', description: '   ' }),
      plan({ start: '2026-07-15T10:00:00Z', end: '2026-07-15T11:00:00Z', description: 42 }),
    ], allowed, { now: NOW });
    expect(out[0].description).toBe('x'.repeat(200));
    expect(out[1].description).toBeUndefined();
    expect(out[2].description).toBeUndefined();
  });

  it('returns [] for non-array input', () => {
    expect(validatePlans(undefined, allowed, { now: NOW })).toEqual([]);
    expect(validatePlans({ plans: [] }, allowed, { now: NOW })).toEqual([]);
  });
});

describe('renderDateTable', () => {
  // Fixed reference: 2026-07-11 is a Saturday.
  const FROM = new Date('2026-07-11T12:00:00Z');

  it('maps weekdays to the correct dates in a US timezone', () => {
    const lines = renderDateTable('America/Chicago', 14, FROM).split('\n');
    expect(lines).toHaveLength(14);
    expect(lines[0]).toContain('Sat 2026-07-11');
    expect(lines[0]).toContain('today');
    expect(lines[2]).toContain('Mon 2026-07-13'); // the "coming Monday" bug: 13th, not 12th
  });

  it('carries the DST-correct UTC offset per day', () => {
    const lines = renderDateTable('America/New_York', 3, FROM).split('\n');
    expect(lines[0]).toContain('UTC-04:00'); // EDT in July
  });

  it('rolls the date across a timezone where it is already the next day', () => {
    const lines = renderDateTable('Pacific/Auckland', 2, FROM).split('\n');
    expect(lines[0]).toContain('Sun 2026-07-12'); // NZ is past midnight already
  });
});
