import React, { useState, useEffect, useCallback } from 'react';
import { CalendarClock } from 'lucide-react';
import { formatMsgTime } from '../utils/format';
import './ChatConversation.css';

// PlansList — the scheduling conversations already in flight. `onNew` starts an
// empty one; `activeId` highlights the open thread. The pane itself is
// SchedulingAssistant, rendered by ChatHub in `embedded` mode.
const PlansList = ({ onSelect, onNew, activeId, reloadKey }) => {
  const [convos,  setConvos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const googleId = localStorage.getItem('googleUserId');

  const load = useCallback(async () => {
    if (!googleId) { setLoading(false); return; }
    try {
      const r = await fetch(`/api/ai?op=conversations&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setConvos((await r.json()).conversations ?? []);
    } catch {}
    setLoading(false);
  }, [googleId]);

  // reloadKey changes after a booking so the list reflects it without a reopen.
  useEffect(() => { load(); }, [load, reloadKey]);

  return (
    <div className="cp-wrap">
      <button className="cp-new" onClick={onNew}>Plan something new</button>

      {loading ? (
        <p className="mp-status">Loading…</p>
      ) : convos.length === 0 ? (
        <div className="mp-list-empty">
          <CalendarClock size={32} strokeWidth={1.2} />
          <p>Nothing being planned</p>
          <p className="mp-list-sub">Start one and Loop will read everyone's calendars.</p>
        </div>
      ) : (
        <ul className="cp-list">
          {convos.map(c => (
            <li key={c.id}>
              <button
                className={`cp-item${c.id === activeId ? ' active' : ''}`}
                onClick={() => onSelect(c.id)}
              >
                <span className="cp-item-main">
                  <span className="cp-item-title">{c.title}</span>
                  <span className="cp-item-time">{formatMsgTime(c.updated_at)}</span>
                </span>
                {c.pending_event_id && (
                  <span className="cp-item-note">Waiting on replies</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export { PlansList };
