import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Clock, Calendar, Home } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ScheduleWidget from '../components/ScheduleWidget';
import GroupsWidget from '../components/GroupsWidget';
import { formatEventTime as formatTime, formatDuration } from '../utils/format';
import './SchedulePage.css';

// ── Upcoming Events panel ─────────────────────────────────────────────────────

const UpcomingEvents = ({ events }) => {
  const [expanded, setExpanded] = useState(false);

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
        <Link to="/dashboard" className="home-btn" title="Dashboard"><Home size={18} /></Link>
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Schedule</h1>
      </div>

      <div className="schedule-page-grid">
        <div className="sp-col"><ScheduleWidget /></div>
        <div className="sp-col"><GroupsWidget /></div>
        <div className="sp-col"><UpcomingEvents events={events} /></div>
      </div>
    </div>
  );
};

export default SchedulePage;
