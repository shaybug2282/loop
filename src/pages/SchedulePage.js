import React, { useState, useEffect, useCallback } from 'react';
import { Menu, Clock, Calendar, Bell } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ScheduleWidget from '../components/ScheduleWidget';
import './SchedulePage.css';

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(hours) {
  if (!hours) return '';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours === 1) return '1 hr';
  return `${hours} hrs`;
}

// ── Upcoming Events panel ─────────────────────────────────────────────────────

const UpcomingEvents = ({ events }) => {
  const upcoming = events
    .filter(e => new Date(e.event_time) > new Date())
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

  return (
    <div className="sp-panel">
      <h3 className="sp-panel-title"><Calendar size={15} /> Upcoming Events</h3>
      {upcoming.length === 0 ? (
        <p className="sp-empty">No upcoming events</p>
      ) : (
        <ul className="sp-list">
          {upcoming.map(e => {
            const otherPeople = e.isCreator
              ? (e.invitedUsers ?? []).map(u => u.display_name || u.name).filter(Boolean)
              : [e.creator?.display_name || e.creator?.name].filter(Boolean);

            return (
              <li key={e.id} className="sp-event-item">
                <div className="sp-event-time">
                  <Clock size={11} />
                  {formatTime(e.event_time)}
                </div>
                <div className="sp-event-meta">
                  <span className="sp-badge duration">{formatDuration(e.duration_hours)}</span>
                  <span className={`sp-badge status-${e.status}`}>
                    {e.status === 'accepted' ? 'Confirmed' : 'Pending'}
                  </span>
                </div>
                {otherPeople.length > 0 && (
                  <div className="sp-event-with">
                    {e.isCreator ? 'with' : 'from'} {otherPeople.join(', ')}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// ── Notification Log panel ────────────────────────────────────────────────────

const NotificationLog = ({ events }) => {
  const activities = [];

  events.forEach(e => {
    if (e.isCreator) {
      (e.declinedUsers ?? []).forEach(u => {
        activities.push({ type: 'decline', user: u, event: e });
      });
      (e.invitedUsers ?? []).forEach(u => {
        if ((e.acceptances ?? []).includes(u.id)) {
          activities.push({ type: 'accept', user: u, event: e });
        }
      });
      if (e.status === 'accepted') {
        activities.push({ type: 'confirmed', event: e });
      }
    } else {
      activities.push({ type: 'invited', event: e });
    }
  });

  // Most-recent event time first; deduplicate "confirmed" per event
  const seen = new Set();
  const deduped = activities.filter(a => {
    if (a.type !== 'confirmed') return true;
    if (seen.has(a.event.id)) return false;
    seen.add(a.event.id); return true;
  });
  deduped.sort((a, b) => new Date(b.event.event_time) - new Date(a.event.event_time));

  const label = a => {
    const t = `${formatTime(a.event.event_time)} (${formatDuration(a.event.duration_hours)})`;
    const name = n => n?.display_name || n?.name || 'Someone';
    switch (a.type) {
      case 'decline':   return <><span className="sp-log-name">{name(a.user)}</span> declined · {t}</>;
      case 'accept':    return <><span className="sp-log-name">{name(a.user)}</span> confirmed · {t}</>;
      case 'confirmed': return <>All confirmed · {t}</>;
      case 'invited':   return <>Invited by <span className="sp-log-name">{name(a.event.creator)}</span> · {t}</>;
      default:          return null;
    }
  };

  return (
    <div className="sp-panel">
      <h3 className="sp-panel-title"><Bell size={15} /> Notification Log</h3>
      {deduped.length === 0 ? (
        <p className="sp-empty">No activity yet</p>
      ) : (
        <ul className="sp-list">
          {deduped.map((a, i) => (
            <li key={i} className={`sp-log-item sp-log-${a.type}`}>
              {label(a)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const SchedulePage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const googleId = localStorage.getItem('googleUserId');

  const loadEvents = useCallback(async () => {
    if (!googleId) return;
    try {
      const r = await fetch(`/api/schedule?op=pending-events&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setEvents((await r.json()).events ?? []);
    } catch {}
  }, [googleId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    if (!googleId) return;
    const t = setInterval(loadEvents, 15_000);
    return () => clearInterval(t);
  }, [googleId, loadEvents]);

  return (
    <div className="schedule-page">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="schedule-page-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Schedule</h1>
      </div>

      <div className="schedule-page-grid">
        <div className="sp-col">
          <ScheduleWidget />
        </div>
        <div className="sp-col">
          <UpcomingEvents events={events} />
        </div>
        <div className="sp-col">
          <NotificationLog events={events} />
        </div>
      </div>
    </div>
  );
};

export default SchedulePage;
