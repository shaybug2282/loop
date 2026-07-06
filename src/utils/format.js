// Shared date/duration formatters used across widgets and panels.
// Keep display formats here so the same kind of timestamp reads identically
// everywhere in the app.

// "Sat, Jul 5 at 7:00 PM" — event times in widgets and lists.
export function formatEventTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// "30 min" / "1 hr" / "2.5 hrs" — event durations.
export function formatDuration(hours) {
  if (!hours) return '';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours === 1) return '1 hr';
  return `${hours} hrs`;
}

// "7:00 PM" for today, "Jul 5 7:00 PM" otherwise — chat message time labels.
export function formatMsgTime(iso) {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// 30-second gap threshold for showing a time label between chat bubbles.
export const MSG_GAP_MS = 30_000;

// True when a time label should render before message i (first message, or
// a MSG_GAP_MS+ gap since the previous one).
export function hasGapBefore(msgs, i) {
  if (i === 0) return true;
  return new Date(msgs[i].created_at) - new Date(msgs[i - 1].created_at) >= MSG_GAP_MS;
}

// True when message i should be visually grouped with the previous bubble
// (same sender, no time gap). getSender extracts the sender id from a message.
export function isGroupedMsg(msgs, i, getSender) {
  if (i === 0 || hasGapBefore(msgs, i)) return false;
  return getSender(msgs[i]) === getSender(msgs[i - 1]);
}
