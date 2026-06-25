import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './NotificationCenter.css';

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDur(hours) {
  if (!hours) return '';
  if (hours < 1) return ` (${Math.round(hours * 60)} min)`;
  return hours === 1 ? ' (1 hr)' : ` (${hours} hrs)`;
}

function buildActivities(events) {
  const activities = [];
  events.forEach(e => {
    if (e.isCreator) {
      (e.declinedUsers ?? []).forEach(u =>
        activities.push({ type: 'decline', user: u, event: e }));
      (e.invitedUsers ?? []).forEach(u => {
        if ((e.acceptances ?? []).includes(u.id))
          activities.push({ type: 'accept', user: u, event: e });
      });
      if (e.status === 'accepted')
        activities.push({ type: 'confirmed', event: e });
    } else {
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

const EVT_COLOR = { invited: 'orange', decline: 'red', accept: 'green', confirmed: 'pink' };

// Always-visible bell button that opens a scrollable notification panel.
const NotificationCenter = () => {
  const { isAuthenticated } = useAuth();
  const [isOpen,       setIsOpen]       = useState(false);
  const [events,       setEvents]       = useState([]);
  const [groupInvites, setGroupInvites] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const wrapRef  = useRef(null);
  const googleId = localStorage.getItem('googleUserId');

  const fetchAll = useCallback(async () => {
    if (!googleId) return;
    setLoading(true);
    try {
      const [evtRes, grpRes] = await Promise.all([
        fetch(`/api/schedule?op=pending-events&googleId=${encodeURIComponent(googleId)}`),
        fetch(`/api/groups?op=pending-invites&googleId=${encodeURIComponent(googleId)}`),
      ]);
      if (evtRes.ok) setEvents((await evtRes.json()).events ?? []);
      if (grpRes.ok) setGroupInvites((await grpRes.json()).invites ?? []);
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

  const respondGroup = async (groupId, accept) => {
    await fetch('/api/groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'respond', googleId, groupId, accept }),
    });
    fetchAll();
  };

  if (!isAuthenticated) return null;

  const activities   = buildActivities(events);
  const pendingCount = activities.filter(a => a.type === 'invited').length + groupInvites.length;
  const n = x => x?.display_name || x?.name || 'Someone';

  const evtLabel = a => {
    const t = fmtTime(a.event.event_time) + fmtDur(a.event.duration_hours);
    switch (a.type) {
      case 'invited':   return { color: 'orange', title: `Invited by ${n(a.event.creator)}`, sub: t };
      case 'decline':   return { color: 'red',    title: `${n(a.user)} declined`, sub: t };
      case 'accept':    return { color: 'green',  title: `${n(a.user)} confirmed`, sub: t };
      case 'confirmed': return { color: 'pink',   title: 'All confirmed', sub: t };
      default:          return null;
    }
  };

  const hasAny = groupInvites.length > 0 || activities.length > 0;

  return (
    <div className="nc-wrap" ref={wrapRef}>
      <button
        className={`nc-bell${isOpen ? ' nc-bell-active' : ''}`}
        title="Notifications"
        onClick={() => setIsOpen(v => !v)}
      >
        <Bell size={18} />
        {pendingCount > 0 && (
          <span className="nc-badge">{pendingCount > 9 ? '9+' : pendingCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="nc-panel">
          <div className="nc-panel-head">
            <span className="nc-panel-title">Notifications</span>
            <button className="nc-x" onClick={() => setIsOpen(false)}>✕</button>
          </div>

          <div className="nc-scroll">
            {loading && !hasAny ? (
              <p className="nc-empty">Loading…</p>
            ) : !hasAny ? (
              <p className="nc-empty">No notifications yet</p>
            ) : (
              <>
                {/* Group invites — actionable, always first */}
                {groupInvites.map((inv, i) => (
                  <div key={`gi-${i}`} className="nc-item">
                    <span className="nc-dot nc-dot-orange" />
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
                  </div>
                ))}

                {/* Event activity */}
                {activities.map((a, i) => {
                  const info = evtLabel(a);
                  if (!info) return null;
                  return (
                    <div key={`ev-${i}`} className="nc-item">
                      <span className={`nc-dot nc-dot-${info.color}`} />
                      <div className="nc-item-body">
                        <p className="nc-item-title">{info.title}</p>
                        <p className="nc-item-sub">{info.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
