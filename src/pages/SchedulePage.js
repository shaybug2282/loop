import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Clock, Calendar, Home, Archive } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ScheduleWidget, { isDismissed, restoreEvent, subscribeDismissed } from '../components/ScheduleWidget';
import GroupsWidget from '../components/GroupsWidget';
import EventPopup from '../components/EventPopup';
import { formatEventTime as formatTime, formatDuration } from '../utils/format';
import './SchedulePage.css';

const STATUS_LABEL = { accepted: 'Confirmed', pending: 'Pending', declined: 'Declined', rescheduled: 'Rescheduling' };

// ── Dismissed events panel ─────────────────────────────────────────────────────

// DismissedEvents — lists every event hidden via a ✕ (invite cards, decline/
// reschedule notices, confirmed-done banners) across all ScheduleWidget
// instances, so a dismissal isn't a dead end. Each entry opens the universal
// EventPopup, or can be restored so it reappears in Schedule!. Dismissal is
// purely a local view-state flag — restoring never touches the server; events
// that were never finalized are separately purged from the database after two
// weeks (see api/schedule.js purgeStaleEvents), independent of this panel.
const DismissedEvents = ({ events, onClose, onChanged }) => {
  const [, setVersion] = useState(0);
  const [selected, setSelected] = useState(null);

  useEffect(() => subscribeDismissed(() => setVersion(v => v + 1)), []);

  const items = events
    .filter(e => isDismissed(e.id))
    .sort((a, b) => new Date(b.event_time) - new Date(a.event_time));

  return (
    <div className="sp-dm-backdrop" onClick={onClose}>
      <div className="sp-dm-modal" onClick={e => e.stopPropagation()}>
        <div className="sp-dm-head">
          <span className="sp-dm-title">Dismissed events</span>
          <button className="sp-dm-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="sp-dm-body">
          {items.length === 0 ? (
            <p className="sp-empty">Events you dismiss with ✕ show up here — unfinished ones are removed after two weeks.</p>
          ) : (
            <ul className="sp-list">
              {items.map(e => (
                <li key={e.id} className="sp-dm-item">
                  <div
                    className="sp-dm-info"
                    onClick={() => setSelected(e)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') setSelected(e); }}
                  >
                    <span className="sp-dm-item-title">{e.title || 'Hangout'}</span>
                    <span className="sp-dm-item-time">{formatTime(e.event_time)}</span>
                    <span className={`sp-badge status-${e.status}`}>{STATUS_LABEL[e.status] || e.status}</span>
                  </div>
                  <button className="sp-dm-restore" onClick={() => restoreEvent(e.id)}>Restore</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {selected && (
        <EventPopup loopEvent={selected} onClose={() => setSelected(null)} onChanged={onChanged} />
      )}
    </div>
  );
};

// ── Upcoming Events panel ─────────────────────────────────────────────────────

const UpcomingEvents = ({ events, onChanged }) => {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(null); // event open in the popup

  const upcoming = events
    .filter(e => !['declined', 'rescheduled'].includes(e.status) && new Date(e.event_time) > new Date())
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

  const visible = expanded ? upcoming : upcoming.slice(0, 2);

  return (
    <div className="sp-panel">
      <h3 className="sp-panel-title"><Calendar size={15} /> Upcoming Events</h3>
      {upcoming.length === 0 ? (
        <p className="sp-empty">No upcoming events</p>
      ) : (
        <>
          <ul className="sp-list">
            {visible.map(e => {
              const otherPeople = e.isCreator
                ? (e.invitedUsers ?? []).map(u => u.display_name || u.name).filter(Boolean)
                : [e.creator?.display_name || e.creator?.name].filter(Boolean);

              return (
                <li
                  key={e.id}
                  className="sp-event-item sp-event-click"
                  onClick={() => setSelected(e)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') setSelected(e); }}
                >
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
          {upcoming.length > 2 && (
            <button
              className="sp-expand-btn"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? 'Show less' : `View events log (${upcoming.length - 2} more)`}
            </button>
          )}
        </>
      )}
      {selected && (
        <EventPopup
          loopEvent={selected}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const SchedulePage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [, setDismVersion] = useState(0);
  const googleId = localStorage.getItem('googleUserId');

  useEffect(() => subscribeDismissed(() => setDismVersion(v => v + 1)), []);
  const dismissedCount = events.filter(e => isDismissed(e.id)).length;

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
        <Link to="/dashboard" className="home-btn" title="Dashboard"><Home size={18} /></Link>
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Schedule</h1>
        <button className="sp-dismissed-btn" onClick={() => setShowDismissed(true)}>
          <Archive size={14} />
          Dismissed{dismissedCount ? ` (${dismissedCount})` : ''}
        </button>
      </div>

      <div className="schedule-page-grid">
        <div className="sp-col"><ScheduleWidget /></div>
        <div className="sp-col"><GroupsWidget /></div>
        <div className="sp-col"><UpcomingEvents events={events} onChanged={loadEvents} /></div>
      </div>

      {showDismissed && (
        <DismissedEvents events={events} onClose={() => setShowDismissed(false)} onChanged={loadEvents} />
      )}
    </div>
  );
};

export default SchedulePage;
