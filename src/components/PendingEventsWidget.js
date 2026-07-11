import React, { useState, useEffect, useCallback } from 'react';
import { Hourglass, Clock } from 'lucide-react';
import EventPopup from './EventPopup';
import { formatEventTime as formatTime } from '../utils/format';
import './PendingEventsWidget.css';

// PendingEventsWidget — dashboard tile-cards of events still "in the works":
// invites that haven't been fully accepted onto everyone's calendar yet
// (status pending or rescheduling). Clicking a tile opens the universal
// EventPopup, where the event is viewed, edited, or handed to the assistant.
export default function PendingEventsWidget() {
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const googleId = localStorage.getItem('googleUserId');

  const load = useCallback(async () => {
    if (!googleId) { setLoading(false); return; }
    try {
      const r = await fetch(`/api/schedule?op=pending-events&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setEvents((await r.json()).events ?? []);
    } catch {}
    setLoading(false);
  }, [googleId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!googleId) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [googleId, load]);

  const inWorks = events
    .filter(e => ['pending', 'rescheduled'].includes(e.status))
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

  // withLine — who the event is with, from the viewer's side.
  const withLine = e => e.isCreator
    ? (e.invitedUsers ?? []).map(u => u.display_name || u.name).filter(Boolean).join(', ')
    : e.creator?.display_name || e.creator?.name || '';

  return (
    <div className="pe-widget">
      <div className="pe-header">
        <Hourglass size={16} />
        <h2>In the Works</h2>
      </div>

      <div className="pe-body">
        {loading ? (
          <p className="pe-hint">Loading…</p>
        ) : inWorks.length === 0 ? (
          <p className="pe-hint">
            Nothing in the works.<br />
            Events waiting on invites show up here until everyone accepts.
          </p>
        ) : (
          <div className="pe-grid">
            {inWorks.map(e => {
              const acceptedN = e.acceptances?.length ?? 0;
              const totalN    = e.invited_user_ids?.length ?? 0;
              const resched   = e.status === 'rescheduled';
              return (
                <button key={e.id} className="pe-tile" onClick={() => setSelected(e)}>
                  <span className="pe-tile-title">{e.title || 'Hangout'}</span>
                  <span className="pe-tile-time">
                    <Clock size={11} />
                    {formatTime(e.event_time)}
                  </span>
                  {withLine(e) && <span className="pe-tile-people">with {withLine(e)}</span>}
                  <span className={`pe-tile-badge${resched ? ' resched' : ''}`}>
                    {resched ? 'Rescheduling' : `${acceptedN}/${totalN} accepted`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <EventPopup
          loopEvent={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
