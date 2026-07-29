import React, { useState, useEffect, useCallback } from 'react';
import { Hourglass, Clock, Archive, X } from 'lucide-react';
import EventPopup from './EventPopup';
import NewEventPopup from './NewEventPopup';
import { formatEventTime as formatTime } from '../utils/format';
import { Panel, PanelHeader } from './Panel';
import './PendingEventsWidget.css';

const MAX_TILES = 6;

// Locally dismissed tile ids persist across reloads — dismissing here only
// hides the tile from this widget, it does not touch the underlying event.
const loadDismissed = () => {
  try { return new Set(JSON.parse(localStorage.getItem('pe-dismissed') || '[]')); }
  catch { return new Set(); }
};

// PendingEventsWidget — dashboard tile-cards of events still "in the works":
// invites that haven't been fully accepted onto everyone's calendar yet
// (status pending or rescheduling). Clicking a tile opens the universal
// EventPopup, where the event is viewed, edited, deleted, or handed to the
// assistant. Shows at most MAX_TILES at once, with a "See more" toggle for
// the rest; each tile can also be dismissed locally via a hover ✕, and the
// header's "Dismissed" button flips the body to a restorable list of those
// hidden events.
export default function PendingEventsWidget() {
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [expanded,  setExpanded]  = useState(false);
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [showDismissed, setShowDismissed] = useState(false); // body shows dismissed list instead of tiles
  const [showNew, setShowNew] = useState(false); // "New event" creation popup open
  const googleId = localStorage.getItem('googleUserId');

  // setMembership — add or remove an id from the persisted dismissed set.
  const setMembership = (id, add) => {
    setDismissed(prev => {
      if (prev.has(id) === add) return prev;
      const next = new Set(prev);
      add ? next.add(id) : next.delete(id);
      try { localStorage.setItem('pe-dismissed', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const dismiss = (id) => setMembership(id, true);
  const restore = (id) => setMembership(id, false);

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
    .filter(e => ['pending', 'rescheduled'].includes(e.status) && !dismissed.has(e.id))
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

  const visible = expanded ? inWorks : inWorks.slice(0, MAX_TILES);

  // Dismissed tiles, newest first — viewable and restorable via the header
  // button. Unfinalized dismissed events age out of the DB after 2 weeks
  // (api/schedule.js purgeStaleEvents), so this list is self-pruning.
  const dismissedEvents = events
    .filter(e => dismissed.has(e.id))
    .sort((a, b) => new Date(b.event_time) - new Date(a.event_time));

  // replyLine — how the invites are going, in words rather than a ratio.
// out: "Waiting on replies" | "Sam said yes" | "2 of 4 said yes" | "Everyone's in".
const replyLine = (accepted, total) => {
  if (total === 0)        return 'Just you so far';
  if (accepted === 0)     return 'Waiting on replies';
  if (accepted === total) return "Everyone's in";
  return `${accepted} of ${total} said yes`;
};

// withLine — who the event is with, from the viewer's side.
  const withLine = e => e.isCreator
    ? (e.invitedUsers ?? []).map(u => u.display_name || u.name).filter(Boolean).join(', ')
    : e.creator?.display_name || e.creator?.name || '';

  return (
    <Panel className="pe-widget">
      <PanelHeader icon={Hourglass} title="In the Works" subtitle="Waiting on replies">
        <button
          className="panel-pill-btn panel-pill-btn-solid"
          onClick={() => setShowNew(true)}
          title="Schedule a new event"
        >
          New plan
        </button>
        <button
          className={`panel-pill-btn${showDismissed ? ' panel-pill-btn-solid' : ''}`}
          onClick={() => setShowDismissed(v => !v)}
          title={showDismissed ? 'Back to pending events' : 'View dismissed events'}
        >
          <Archive size={12} />
          {showDismissed ? 'Back' : `Dismissed${dismissedEvents.length ? ` (${dismissedEvents.length})` : ''}`}
        </button>
      </PanelHeader>

      <div className="pe-body">
        {showDismissed ? (
          dismissedEvents.length === 0 ? (
            <p className="pe-hint">
              Nothing hidden here yet.<br />
              Plans you tuck away show up in this list.
            </p>
          ) : (
            <ul className="pe-dm-list">
              {dismissedEvents.map(e => (
                <li key={e.id} className="pe-dm-item">
                  <div
                    className="pe-dm-info"
                    onClick={() => setSelected(e)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') setSelected(e); }}
                  >
                    <span className="pe-dm-title">{e.title || 'Hangout'}</span>
                    <span className="pe-dm-time">{formatTime(e.event_time)}</span>
                  </div>
                  <button className="pe-dm-restore" onClick={() => restore(e.id)}>Restore</button>
                </li>
              ))}
            </ul>
          )
        ) : loading ? (
          <p className="pe-hint">Loading…</p>
        ) : inWorks.length === 0 ? (
          <p className="pe-hint">
            No plans in the works.<br />
            Anything you're still waiting on replies for shows up here.
          </p>
        ) : (
          <div className="pe-grid">
            {visible.map(e => {
              const acceptedN = e.acceptances?.length ?? 0;
              const totalN    = e.invited_user_ids?.length ?? 0;
              const resched   = e.status === 'rescheduled';
              return (
                <div key={e.id} className="pe-tile-wrap">
                  <button className="pe-tile" onClick={() => setSelected(e)}>
                    <span className="pe-tile-title">{e.title || 'Hangout'}</span>
                    <span className="pe-tile-time">
                      <Clock size={11} />
                      {formatTime(e.event_time)}
                    </span>
                    {withLine(e) && <span className="pe-tile-people">with {withLine(e)}</span>}
                    <span className={`pe-tile-badge${resched ? ' resched' : ''}`}>
                      {resched ? 'Picking a new time' : replyLine(acceptedN, totalN)}
                    </span>
                  </button>
                  <button
                    className="pe-tile-x"
                    title="Dismiss"
                    onClick={ev => { ev.stopPropagation(); dismiss(e.id); }}
                  ><X size={11} /></button>
                </div>
              );
            })}
          </div>
        )}

        {!showDismissed && inWorks.length > MAX_TILES && (
          <button className="pe-more-btn" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Show less' : `See more (${inWorks.length - MAX_TILES})`}
          </button>
        )}
      </div>

      {selected && (
        <EventPopup
          loopEvent={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}

      {showNew && (
        <NewEventPopup onClose={() => setShowNew(false)} onCreated={load} />
      )}
    </Panel>
  );
}
