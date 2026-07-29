import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Bell, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { formatDuration } from '../utils/format';
import { getPrefs } from '../utils/prefs';
import EventPopup from './EventPopup';
import './NotificationCenter.css';

// localStorage keys for notification read/delete state (shared across tabs/reloads).
const LS_SEEN      = 'nc-seen';
const LS_DISMISSED = 'nc-dismissed';

// Load a persisted Set of notification ids; returns an empty Set on any error.
const loadSet = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')); }
  catch { return new Set(); }
};
const saveSet = (key, set) => {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
};

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Flatten schedule events into displayable activity entries (max 20, newest first).
function buildActivities(events) {
  const activities = [];
  events.forEach(e => {
    // Mutual cancel — both participants get the same notification. This is
    // the ONLY way a raincheck ever surfaces: one-sided ones stay secret.
    if (e.status === 'rainchecked') {
      activities.push({ type: 'rainchecked', event: e });
      return;
    }
    if (e.isCreator) {
      (e.declinedUsers ?? []).forEach(u =>
        activities.push({ type: 'decline', user: u, event: e }));
      (e.rescheduleUsers ?? []).forEach(u =>
        activities.push({ type: 'reschedule', user: u, event: e }));
      (e.invitedUsers ?? []).forEach(u => {
        if ((e.acceptances ?? []).includes(u.id))
          activities.push({ type: 'accept', user: u, event: e });
      });
      if (e.status === 'accepted')
        activities.push({ type: 'confirmed', event: e });
    } else if (!['declined', 'rescheduled'].includes(e.status)) {
      // Declined/rescheduled events are closed — never surface as open invites.
      activities.push({ type: 'invited', event: e });
    }
  });

  const seen = new Set();
  return activities
    .filter(a => {
      if (a.type !== 'confirmed') return true;
      if (seen.has(a.event.id)) return false;
      seen.add(a.event.id); return true;
    })
    .sort((a, b) => new Date(b.event.event_time) - new Date(a.event.event_time))
    .slice(0, 20);
}

// Stable id for an activity — survives refetches so seen/dismissed state sticks.
const activityId = (a) => `ev-${a.type}-${a.event.id}${a.user ? `-${a.user.id}` : ''}`;

// Always-visible bell button that opens a scrollable notification panel.
// Badge counts UNSEEN notifications; opening the panel marks everything seen.
// Each notification can be deleted (✕ on hover) — deletions persist locally.
const NotificationCenter = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isOpen,       setIsOpen]       = useState(false);
  const [events,       setEvents]       = useState([]);
  const [groupInvites, setGroupInvites] = useState([]);
  const [friendReqs,   setFriendReqs]   = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [seen,         setSeen]         = useState(() => loadSet(LS_SEEN));
  const [dismissed,    setDismissed]    = useState(() => loadSet(LS_DISMISSED));
  const [popupEvent,   setPopupEvent]   = useState(null); // event open in the universal popup
  const [quietSince,   setQuietSince]   = useState(null); // Quiet Time start (null = off)
  const wrapRef    = useRef(null);
  const fetchedRef = useRef(false); // true after the first successful fetch — gates pruning
  const syncedRef  = useRef(false); // true after server state is merged — gates pushes
  const pushTimer  = useRef(null);
  const googleId   = localStorage.getItem('googleUserId');

  // Pull server-side seen/dismissed state once and union-merge with local —
  // deletions and read state made on other devices apply here too.
  useEffect(() => {
    if (!isAuthenticated || !googleId) return;
    fetch(`/api/user?op=notification-state&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          const merge = (setter, key, remote) => setter(prev => {
            const n = new Set([...prev, ...(remote ?? [])]);
            if (n.size === prev.size) return prev;
            saveSet(key, n);
            return n;
          });
          merge(setSeen, LS_SEEN, d.seen);
          merge(setDismissed, LS_DISMISSED, d.dismissed);
        }
      })
      .catch(() => {})
      .finally(() => { syncedRef.current = true; });
  }, [isAuthenticated, googleId]);

  // Push the full merged state to the server whenever it changes (debounced,
  // fire-and-forget). Gated on syncedRef so a pre-merge local subset can never
  // overwrite another device's state.
  useEffect(() => {
    if (!syncedRef.current || !googleId) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      fetch('/api/user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          op: 'notification-state', googleId,
          seen: [...seen], dismissed: [...dismissed],
        }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(pushTimer.current);
  }, [seen, dismissed, googleId]);

  const fetchAll = useCallback(async () => {
    if (!googleId) return;
    setLoading(true);
    try {
      const [evtRes, grpRes, profRes, frRes] = await Promise.all([
        fetch(`/api/schedule?op=pending-events&googleId=${encodeURIComponent(googleId)}`),
        fetch(`/api/groups?op=pending-invites&googleId=${encodeURIComponent(googleId)}`),
        fetch(`/api/user?op=profile&googleId=${encodeURIComponent(googleId)}`),
        fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`),
      ]);
      if (evtRes.ok) setEvents((await evtRes.json()).events ?? []);
      if (grpRes.ok) setGroupInvites((await grpRes.json()).invites ?? []);
      if (profRes.ok) setQuietSince((await profRes.json()).quiet_time_since ?? null);
      if (frRes.ok)  setFriendReqs((await frRes.json()).requests ?? []);
      if (evtRes.ok && grpRes.ok) fetchedRef.current = true;
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [googleId]);

  useEffect(() => {
    if (!isAuthenticated || !googleId) return;
    fetchAll();
    const t = setInterval(fetchAll, 60_000);
    return () => clearInterval(t);
  }, [isAuthenticated, googleId, fetchAll]);

  useEffect(() => { if (isOpen) fetchAll(); }, [isOpen, fetchAll]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [isOpen]);

  const activities = useMemo(() => buildActivities(events), [events]);

  // Unified display list with stable ids; deleted items are filtered out and
  // whole categories can be muted from Profile → Notifications.
  const items = useMemo(() => {
    const on = getPrefs().notifications;
    return [
      ...(on.friendRequests ? friendReqs.map(req => ({ id: `freq-${req.id}`, kind: 'friend', req })) : []),
      ...(on.groupInvites ? groupInvites.map(inv => ({ id: `group-${inv.groupId}`, kind: 'group', inv })) : []),
      ...(on.events ? activities.map(a => ({ id: activityId(a), kind: 'activity', a })) : []),
    ].filter(i => !dismissed.has(i.id));
  }, [friendReqs, groupInvites, activities, dismissed]);

  // Quiet Time on for 24+ hours → prompt the user to turn it off. Not part of
  // the dismissable items list: it stays until Quiet Time is actually off.
  const quietOverdue = quietSince && Date.now() - new Date(quietSince).getTime() > 24 * 60 * 60 * 1000;

  const turnOffQuietTime = async () => {
    try {
      await fetch('/api/user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'quiet-time', googleId, enabled: false }),
      });
      setQuietSince(null);
    } catch {}
  };

  const unseenCount = useMemo(
    () => items.filter(i => !seen.has(i.id)).length,
    [items, seen]
  ) + (quietOverdue ? 1 : 0);

  // Opening the panel marks everything currently visible as seen.
  useEffect(() => {
    if (!isOpen) return;
    const unseenIds = items.filter(i => !seen.has(i.id)).map(i => i.id);
    if (!unseenIds.length) return;
    setSeen(prev => {
      const n = new Set(prev);
      unseenIds.forEach(id => n.add(id));
      saveSet(LS_SEEN, n);
      return n;
    });
  }, [isOpen, items, seen]);

  // Prune seen/dismissed ids that no longer correspond to a live notification
  // so localStorage stays bounded. Only after a successful fetch — pruning
  // against an empty pre-fetch list would wipe all state.
  useEffect(() => {
    if (!fetchedRef.current) return;
    const valid = new Set([
      ...friendReqs.map(req => `freq-${req.id}`),
      ...groupInvites.map(inv => `group-${inv.groupId}`),
      ...activities.map(activityId),
    ]);
    const prune = (setter, key) => setter(prev => {
      const n = new Set([...prev].filter(id => valid.has(id)));
      if (n.size === prev.size) return prev;
      saveSet(key, n);
      return n;
    });
    prune(setSeen, LS_SEEN);
    prune(setDismissed, LS_DISMISSED);
  }, [friendReqs, groupInvites, activities]);

  // Delete a notification from the panel (persists across reloads).
  const dismiss = (id) => {
    setDismissed(prev => {
      const n = new Set(prev);
      n.add(id);
      saveSet(LS_DISMISSED, n);
      return n;
    });
  };

  const respondGroup = async (groupId, accept) => {
    await fetch('/api/groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'respond', googleId, groupId, accept }),
    });
    fetchAll();
  };

  // Accept/decline a friend request straight from the bell.
  const respondFriend = async (requestId, action) => {
    await fetch('/api/friends', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'respond', googleId, requestId, action }),
    });
    fetchAll();
  };

  if (!isAuthenticated) return null;

  const n = x => x?.display_name || x?.name || 'Someone';

  // Color semantics: green = confirmed, yellow = pending invites, red = declined.
  const evLabel = a => {
    const dur = a.event.duration_hours ? ` (${formatDuration(a.event.duration_hours)})` : '';
    const t = fmtTime(a.event.event_time) + dur;
    switch (a.type) {
      case 'invited':    return { color: 'yellow', title: `Invited by ${n(a.event.creator)}`, sub: t };
      case 'decline':    return { color: 'red',    title: `${n(a.user)} declined`, sub: t };
      case 'reschedule': return { color: 'yellow', title: `${n(a.user)} asked to reschedule`, sub: `${t} — see Scheduling Assistant` };
      case 'accept':     return { color: 'green',  title: `${n(a.user)} confirmed`, sub: t };
      case 'confirmed':  return { color: 'green',  title: 'All confirmed', sub: t };
      case 'rainchecked': return { color: 'blue',  title: 'This event has been Rain Checked!', sub: t };
      default:          return null;
    }
  };

  return (
    <div className="nc-wrap" ref={wrapRef}>
      <button
        className={`nc-bell${isOpen ? ' nc-bell-active' : ''}`}
        title="Notifications"
        onClick={() => setIsOpen(v => !v)}
      >
        <Bell size={18} />
        {unseenCount > 0 && (
          <span className="nc-badge">{unseenCount > 9 ? '9+' : unseenCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="nc-panel">
          <div className="nc-panel-head">
            <span className="nc-panel-title">Notifications</span>
            <button className="nc-x" onClick={() => setIsOpen(false)} title="Close"><X size={14} /></button>
          </div>

          <div className="nc-scroll">
            {/* Quiet Time 24h reminder — pinned above the list, not
                dismissable: it clears only when Quiet Time turns off. */}
            {quietOverdue && (
              <div className="nc-item nc-quiet">
                <span className="nc-dot nc-dot-blue" />
                <div className="nc-item-body">
                  <p className="nc-item-title">Quiet Time has been on for over 24 hours</p>
                  <p className="nc-item-sub">Friends can't schedule anything with you while it's on.</p>
                  <div className="nc-invite-btns">
                    <button className="nc-btn-join" onClick={turnOffQuietTime}>Turn off Quiet Time</button>
                  </div>
                </div>
              </div>
            )}
            {loading && items.length === 0 ? (
              <p className="nc-empty">Loading…</p>
            ) : items.length === 0 ? (
              !quietOverdue && <p className="nc-empty">No notifications yet</p>
            ) : (
              items.map(item => {
                if (item.kind === 'friend') {
                  const { req } = item;
                  const name = req.sender?.display_name || req.sender?.name || 'Someone';
                  return (
                    <div key={item.id} className="nc-item">
                      <span className="nc-dot nc-dot-yellow" />
                      <div
                        className="nc-item-body nc-item-click"
                        onClick={() => { setIsOpen(false); navigate('/friends?tab=requests'); }}
                        role="button"
                        tabIndex={0}
                        title="Open Friends page"
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setIsOpen(false); navigate('/friends?tab=requests'); } }}
                      >
                        <p className="nc-item-title">Friend request from <strong>{name}</strong></p>
                        <div className="nc-invite-btns" onClick={e => e.stopPropagation()}>
                          <button className="nc-btn-join"    onClick={() => respondFriend(req.id, 'accept')}>Accept</button>
                          <button className="nc-btn-decline" onClick={() => respondFriend(req.id, 'reject')}>Decline</button>
                        </div>
                      </div>
                      <button className="nc-item-x" title="Delete notification"
                        onClick={() => dismiss(item.id)}><X size={11} /></button>
                    </div>
                  );
                }
                if (item.kind === 'group') {
                  const { inv } = item;
                  return (
                    <div key={item.id} className="nc-item">
                      <span className="nc-dot nc-dot-yellow" />
                      <div className="nc-item-body">
                        <p className="nc-item-title">
                          Group invite: <strong>{inv.groupName}</strong>
                        </p>
                        <p className="nc-item-sub">from {inv.invitedBy}</p>
                        <div className="nc-invite-btns">
                          <button className="nc-btn-join"    onClick={() => respondGroup(inv.groupId, true)}>Join</button>
                          <button className="nc-btn-decline" onClick={() => respondGroup(inv.groupId, false)}>Decline</button>
                        </div>
                      </div>
                      <button className="nc-item-x" title="Delete notification"
                        onClick={() => dismiss(item.id)}><X size={11} /></button>
                    </div>
                  );
                }
                const info = evLabel(item.a);
                if (!info) return null;
                return (
                  <div key={item.id} className="nc-item">
                    <span className={`nc-dot nc-dot-${info.color}`} />
                    <div
                      className="nc-item-body nc-item-click"
                      onClick={() => setPopupEvent(item.a.event)}
                      role="button"
                      tabIndex={0}
                      title="Open event"
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setPopupEvent(item.a.event); }}
                    >
                      <p className="nc-item-title">{info.title}</p>
                      <p className="nc-item-sub">{info.sub}</p>
                    </div>
                    <button className="nc-item-x" title="Delete notification"
                      onClick={() => dismiss(item.id)}><X size={11} /></button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {popupEvent && (
        <EventPopup
          loopEvent={popupEvent}
          onClose={() => setPopupEvent(null)}
          onChanged={fetchAll}
        />
      )}
    </div>
  );
};

export default NotificationCenter;
