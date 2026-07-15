// Unit tests for applyReinvites (api/schedule.js) — who is in the restarted
// invite cycle after a material edit: decliners stay out unless re-added.
import { applyReinvites } from '../../api/schedule';

describe('applyReinvites', () => {
  const A = 'aaaa', B = 'bbbb', C = 'cccc';

  it('keeps decliners out of the new cycle (decliner already removed from invited)', () => {
    const out = applyReinvites({ invited_user_ids: [A, B], declines: [C] });
    expect(out.invited).toEqual([A, B]);
    expect(out.declines).toEqual([C]);
    expect(out.readded).toEqual([]);
  });

  it('drops a decliner who is still in invited_user_ids (sole-invitee decline)', () => {
    const out = applyReinvites({ invited_user_ids: [A], declines: [A] });
    expect(out.invited).toEqual([]);
    expect(out.declines).toEqual([A]);
  });

  it('re-adds a declined user: back into invited, out of declines', () => {
    const out = applyReinvites({ invited_user_ids: [A], declines: [B, C] }, [B]);
    expect(out.invited).toEqual([A, B]);
    expect(out.declines).toEqual([C]);
    expect(out.readded).toEqual([B]);
  });

  it('ignores readd ids that never declined (injection guard) and dedupes', () => {
    const out = applyReinvites({ invited_user_ids: [A], declines: [B] }, [B, B, 'zzzz', A]);
    expect(out.invited).toEqual([A, B]);
    expect(out.readded).toEqual([B]);
  });

  it('tolerates missing arrays and non-array readdUserIds', () => {
    expect(applyReinvites({}, 'nope')).toEqual({ invited: [], declines: [], readded: [] });
    expect(applyReinvites({ invited_user_ids: [A] })).toEqual({ invited: [A], declines: [], readded: [] });
  });
});
