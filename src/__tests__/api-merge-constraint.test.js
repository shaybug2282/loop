// Unit tests for mergeConstraint (api/_profiles.js) — the pure fold of a
// chat-captured standing rule ({ constraint, kind }) into a stored profile.
import { mergeConstraint } from '../../api/_profiles';

describe('mergeConstraint', () => {
  const base = () => ({
    tags: ['student'],
    hard_constraints: ['no meetings before 9am'],
    soft_constraints: ['prefers evenings'],
  });

  it('adds a hard constraint without touching other keys', () => {
    const out = mergeConstraint(base(), { constraint: 'never weekday lunches', kind: 'hard' });
    expect(out.hard_constraints).toEqual(['no meetings before 9am', 'never weekday lunches']);
    expect(out.soft_constraints).toEqual(['prefers evenings']);
    expect(out.tags).toEqual(['student']);
  });

  it('adds a soft constraint', () => {
    const out = mergeConstraint(base(), { constraint: 'likes mornings', kind: 'soft' });
    expect(out.soft_constraints).toEqual(['prefers evenings', 'likes mornings']);
  });

  it('dedupes case-insensitively', () => {
    const out = mergeConstraint(base(), { constraint: 'No Meetings Before 9AM', kind: 'hard' });
    expect(out.hard_constraints).toEqual(['no meetings before 9am']);
  });

  it('forget removes matching entries from both lists by substring either way', () => {
    const out = mergeConstraint(base(), { constraint: 'meetings before 9am', kind: 'forget' });
    expect(out.hard_constraints).toEqual([]);
    expect(out.soft_constraints).toEqual(['prefers evenings']);
  });

  it('caps each list at 12, dropping the oldest', () => {
    const p = { ...base(), hard_constraints: Array.from({ length: 12 }, (_, i) => `rule ${i}`) };
    const out = mergeConstraint(p, { constraint: 'rule 12', kind: 'hard' });
    expect(out.hard_constraints).toHaveLength(12);
    expect(out.hard_constraints[0]).toBe('rule 1');
    expect(out.hard_constraints[11]).toBe('rule 12');
  });

  it('returns the input unchanged for invalid kind, empty text, or missing profile', () => {
    const p = base();
    expect(mergeConstraint(p, { constraint: 'x', kind: 'nope' })).toBe(p);
    expect(mergeConstraint(p, { constraint: '   ', kind: 'hard' })).toBe(p);
    expect(mergeConstraint(null, { constraint: 'x', kind: 'hard' })).toBe(null);
    expect(mergeConstraint(p, null)).toBe(p);
  });

  it('handles a profile missing the constraint arrays', () => {
    const out = mergeConstraint({ tags: [] }, { constraint: 'no sundays', kind: 'hard' });
    expect(out.hard_constraints).toEqual(['no sundays']);
  });
});
