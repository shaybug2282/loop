// Unit tests for the shared date/duration formatters.
import {
  formatDuration,
  formatMsgTime,
  hasGapBefore,
  isGroupedMsg,
  MSG_GAP_MS,
} from '../utils/format';

describe('formatDuration', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(undefined)).toBe('');
  });

  it('formats sub-hour durations as minutes', () => {
    expect(formatDuration(0.5)).toBe('30 min');
    expect(formatDuration(0.25)).toBe('15 min');
  });

  it('formats exactly one hour', () => {
    expect(formatDuration(1)).toBe('1 hr');
  });

  it('formats multi-hour durations', () => {
    expect(formatDuration(2)).toBe('2 hrs');
    expect(formatDuration(2.5)).toBe('2.5 hrs');
  });
});

describe('formatMsgTime', () => {
  it('shows only the time for a today timestamp', () => {
    const today = new Date();
    today.setHours(14, 30, 0, 0);
    const out = formatMsgTime(today.toISOString());
    expect(out).toMatch(/2:30/);
    expect(out).not.toMatch(/[A-Za-z]{3} \d/); // no "Jul 5"-style date part
  });

  it('includes the date for a non-today timestamp', () => {
    const past = new Date('2020-03-15T10:00:00Z');
    const out = formatMsgTime(past.toISOString());
    expect(out).toMatch(/Mar/);
  });
});

// Build a message list with controlled timestamps and senders.
const msg = (offsetMs, sender) => ({
  created_at: new Date(1_700_000_000_000 + offsetMs).toISOString(),
  sender,
});

describe('hasGapBefore', () => {
  it('is always true for the first message', () => {
    expect(hasGapBefore([msg(0, 'a')], 0)).toBe(true);
  });

  it('is false when the previous message is within the gap threshold', () => {
    const msgs = [msg(0, 'a'), msg(MSG_GAP_MS - 1, 'a')];
    expect(hasGapBefore(msgs, 1)).toBe(false);
  });

  it('is true at or beyond the gap threshold', () => {
    const msgs = [msg(0, 'a'), msg(MSG_GAP_MS, 'a')];
    expect(hasGapBefore(msgs, 1)).toBe(true);
  });
});

describe('isGroupedMsg', () => {
  const getSender = (m) => m.sender;

  it('never groups the first message', () => {
    expect(isGroupedMsg([msg(0, 'a')], 0, getSender)).toBe(false);
  });

  it('groups rapid messages from the same sender', () => {
    const msgs = [msg(0, 'a'), msg(1000, 'a')];
    expect(isGroupedMsg(msgs, 1, getSender)).toBe(true);
  });

  it('does not group messages from different senders', () => {
    const msgs = [msg(0, 'a'), msg(1000, 'b')];
    expect(isGroupedMsg(msgs, 1, getSender)).toBe(false);
  });

  it('does not group across a time gap', () => {
    const msgs = [msg(0, 'a'), msg(MSG_GAP_MS + 1000, 'a')];
    expect(isGroupedMsg(msgs, 1, getSender)).toBe(false);
  });
});
