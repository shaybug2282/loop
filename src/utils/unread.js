// DM unread tracking + per-friend mute cache. The server keeps no read state
// for E2E messages, so "read" is tracked client-side: a per-conversation
// last-read timestamp in localStorage, compared against each conversation's
// lastMessageAt. Muted friend ids are cached here from friends fetches so the
// toast/badge polls don't need their own friends request.

const READ_KEY  = 'mp-lastread';
const MUTED_KEY = 'loop-muted';

// getLastReadMap — { [userId]: ISO of last time that conversation was open }.
export function getLastReadMap() {
  try { return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') ?? {}; }
  catch { return {}; }
}

// markRead — stamp a conversation read as of now.
export function markRead(userId) {
  const map = getLastReadMap();
  map[userId] = new Date().toISOString();
  try { localStorage.setItem(READ_KEY, JSON.stringify(map)); } catch {}
}

// isUnread — does this conversation have activity newer than my last open?
export function isUnread(convo) {
  const last = getLastReadMap()[convo.userId];
  return !last || new Date(convo.lastMessageAt) > new Date(last);
}

// countUnread — unread conversations, muted friends excluded.
export function countUnread(conversations) {
  const muted = getMutedSet();
  return (conversations ?? []).filter(c => !muted.has(c.userId) && isUnread(c)).length;
}

// getMutedSet / saveMutedSet — cached ids of friends I've muted (source of
// truth is friendships.muted; friends fetches refresh this cache).
export function getMutedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(MUTED_KEY) ?? '[]')); }
  catch { return new Set(); }
}

export function saveMutedSet(ids) {
  try { localStorage.setItem(MUTED_KEY, JSON.stringify([...ids])); } catch {}
}

// syncMutedFromFriends — refresh the cache from a friends list that carries
// per-friend settings (api/friends op:data).
export function syncMutedFromFriends(friends) {
  saveMutedSet((friends ?? []).filter(f => f.settings?.muted).map(f => f.id));
}
