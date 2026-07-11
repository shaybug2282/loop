import React, { useState, useMemo } from 'react';
import { X, Clock, MapPin, AlignLeft, Sparkles } from 'lucide-react';
import AISummary from './AISummary';
import { formatDuration } from '../utils/format';
import { updateCalendarEvent } from '../utils/googleCalendar';
import './EventPopup.css';

// EventPopup — the universal event modal. Every event surface (calendar week
// view, Today's Schedule, dashboard pending tiles, notification center) opens
// events through this popup. Header: event name + date & time. Below: every
// participant color-coded (blue host / green accepted / yellow pending / grey
// declined), then any extra details. The organizer can click any field to
// edit it; edits must be confirmed, which sends an updated invite to every
// invitee (Loop events restart their accept cycle; Google events are patched
// with sendUpdates=all). The Scheduling Assistant opens in a nested popup.
//
// Pass exactly one of:
//   loopEvent   — an enriched row from /api/schedule?op=pending-events
//   googleEvent — a raw Google Calendar API event

const pad = n => String(n).padStart(2, '0');

// addDays — 'YYYY-MM-DD' + n days → 'YYYY-MM-DD' (UTC math, no TZ drift).
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// normalize — flatten either event shape into the one the popup renders.
// Participants carry a status used for chip colors: host | accepted |
// pending | declined. canEdit: Loop → creator only; Google → organizer only.
function normalize({ loopEvent, googleEvent }) {
  const nameOf = u => u?.display_name || u?.name || 'Someone';

  if (loopEvent) {
    const e = loopEvent;
    const accepted = new Set(e.acceptances ?? []);
    return {
      source:        'loop',
      id:            e.id,
      title:         e.title || 'Hangout',
      start:         e.event_time,
      end:           null,
      allDay:        false,
      durationHours: e.duration_hours ?? 1,
      location:      e.location || '',
      description:   '',
      status:        e.status,
      canEdit:       Boolean(e.isCreator),
      participants: [
        { key: 'host', name: e.isCreator ? 'You' : nameOf(e.creator), status: 'host' },
        ...(e.invitedUsers ?? []).map(u => ({
          key:    u.id,
          name:   u.id === e.myId ? 'You' : nameOf(u),
          status: accepted.has(u.id) ? 'accepted' : 'pending',
        })),
        ...(e.declinedUsers ?? []).map(u => ({
          key: `d-${u.id}`, name: u.id === e.myId ? 'You' : nameOf(u), status: 'declined',
        })),
      ],
    };
  }

  const g = googleEvent;
  const gName = a => a?.self ? 'You' : (a?.displayName || a?.email || 'Someone');
  const partStatus = s => s === 'accepted' ? 'accepted' : s === 'declined' ? 'declined' : 'pending';
  return {
    source:        'google',
    id:            g.id,
    title:         g.summary || '(no title)',
    start:         g.start?.dateTime || g.start?.date,
    end:           g.end?.dateTime || g.end?.date || null,
    allDay:        !g.start?.dateTime,
    durationHours: null,
    location:      g.location || '',
    description:   g.description || '',
    status:        null,
    canEdit:       !g.organizer || g.organizer.self === true,
    participants: [
      ...(g.organizer ? [{ key: 'host', name: gName(g.organizer), status: 'host' }] : []),
      ...(g.attendees ?? []).filter(a => !a.organizer).map(a => ({
        key: a.email, name: gName(a), status: partStatus(a.responseStatus),
      })),
    ],
  };
}

// toDraft — normalized event → flat editable fields (local date/time strings).
function toDraft(n) {
  const d = new Date(n.start);
  return {
    title:         n.title,
    date:          n.allDay ? n.start.slice(0, 10) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time:          n.allDay ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    durationHours: n.durationHours,
    location:      n.location,
    description:   n.description,
  };
}

const STATUS_LABEL = {
  pending:     'Pending',
  accepted:    'Confirmed',
  rescheduled: 'Being rescheduled',
  declined:    'Declined',
};

const EventPopup = ({ loopEvent = null, googleEvent = null, onClose, onChanged = null }) => {
  const norm = useMemo(() => normalize({ loopEvent, googleEvent }), [loopEvent, googleEvent]);

  const [draft,    setDraft]    = useState(() => toDraft(norm));
  const [baseline, setBaseline] = useState(() => toDraft(norm));
  const [editing,  setEditing]  = useState(null);   // field name being edited
  const [saving,   setSaving]   = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);
  const [error,    setError]    = useState(null);
  const [nudge,    setNudge]    = useState(false);  // close attempted with unsaved edits
  const [showAI,   setShowAI]   = useState(false);

  const googleId = localStorage.getItem('googleUserId');
  const dirty    = JSON.stringify(draft) !== JSON.stringify(baseline);

  const set       = patch => { setDraft(prev => ({ ...prev, ...patch })); setSavedMsg(null); setError(null); };
  const startEdit = field => { if (norm.canEdit && !saving) setEditing(field); };

  // whenLabel — human date & time built from the draft so header edits show live.
  const whenLabel = () => {
    const d = new Date(`${draft.date}T${norm.allDay ? '00:00' : draft.time}`);
    if (isNaN(d)) return draft.date;
    const datePart = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (norm.allDay) return `${datePart} · All day`;
    const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty) { setNudge(true); return; }
    onClose();
  };

  const discard = () => {
    setDraft(baseline);
    setEditing(null);
    setError(null);
    if (nudge) { onClose(); return; }
    setNudge(false);
  };

  // save — confirm the edits: Loop events restart their invite cycle via
  // update-event; Google events are patched with sendUpdates=all so Google
  // emails every attendee an updated invitation.
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (norm.source === 'loop') {
        const eventTime = new Date(`${draft.date}T${draft.time}`).toISOString();
        const r = await fetch('/api/schedule', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            op: 'update-event', googleId, eventId: norm.id,
            title:         draft.title || null,
            eventTime,
            durationHours: Number(draft.durationHours) || 1,
            location:      draft.location || null,
          }),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
        setSavedMsg('Saved — an updated invite was sent to all invitees.');
      } else {
        const patch = {
          summary:     draft.title,
          location:    draft.location,
          description: draft.description,
        };
        if (norm.allDay) {
          const spanDays = norm.end
            ? Math.max(1, Math.round((new Date(norm.end) - new Date(norm.start)) / 86400000))
            : 1;
          patch.start = { date: draft.date };
          patch.end   = { date: addDays(draft.date, spanDays) };
        } else {
          const start = new Date(`${draft.date}T${draft.time}`);
          const durMs = (norm.end ? new Date(norm.end) - new Date(norm.start) : 0) || 3600000;
          patch.start = { dateTime: start.toISOString() };
          patch.end   = { dateTime: new Date(start.getTime() + durMs).toISOString() };
        }
        await updateCalendarEvent(norm.id, patch);
        setSavedMsg('Saved — attendees were sent the updated invite.');
      }
      setBaseline(draft);
      setEditing(null);
      setNudge(false);
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const editableCls = norm.canEdit ? ' ep-editable' : '';

  return (
    <div className="ep-backdrop" onClick={requestClose}>
      <div className="ep-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header: name, date & time ── */}
        <div className="ep-header">
          <div className="ep-head-main">
            {editing === 'title' ? (
              <input
                className="ep-title-input"
                value={draft.title}
                autoFocus
                onChange={e => set({ title: e.target.value })}
                onBlur={() => setEditing(null)}
                onKeyDown={e => e.key === 'Enter' && setEditing(null)}
              />
            ) : (
              <h2
                className={`ep-title${editableCls}`}
                onClick={() => startEdit('title')}
                title={norm.canEdit ? 'Click to edit' : undefined}
              >{draft.title}</h2>
            )}

            {editing === 'when' ? (
              <div className="ep-when-edit">
                <input type="date" className="ep-input" value={draft.date}
                  onChange={e => set({ date: e.target.value })} />
                {!norm.allDay && (
                  <input type="time" className="ep-input" value={draft.time}
                    onChange={e => set({ time: e.target.value })} />
                )}
                {norm.source === 'loop' && (
                  <input type="number" className="ep-input ep-input-dur" min="0.5" step="0.5"
                    value={draft.durationHours ?? 1} title="Duration (hours)"
                    onChange={e => set({ durationHours: e.target.value })} />
                )}
                <button className="ep-mini-btn" onClick={() => setEditing(null)}>Done</button>
              </div>
            ) : (
              <p
                className={`ep-when${editableCls}`}
                onClick={() => startEdit('when')}
                title={norm.canEdit ? 'Click to edit' : undefined}
              >
                <Clock size={13} />
                {whenLabel()}
                {norm.durationHours ? ` · ${formatDuration(Number(draft.durationHours) || norm.durationHours)}` : ''}
                {norm.status && (
                  <span className={`ep-status ep-status-${norm.status}`}>{STATUS_LABEL[norm.status]}</span>
                )}
              </p>
            )}
          </div>
          <button className="ep-close" onClick={requestClose} title="Close"><X size={16} /></button>
        </div>

        {/* ── Participants ── */}
        {norm.participants.length > 0 && (
          <div className="ep-participants">
            <div className="ep-part-list">
              {norm.participants.map(p => (
                <span key={p.key} className={`ep-part ${p.status}`}>{p.name}</span>
              ))}
            </div>
            <div className="ep-legend">
              <span className="ep-legend-item host">Host</span>
              <span className="ep-legend-item accepted">Accepted</span>
              <span className="ep-legend-item pending">Pending</span>
              <span className="ep-legend-item declined">Declined</span>
            </div>
          </div>
        )}

        {/* ── Additional details ── */}
        {(draft.location || norm.canEdit) && (
          <div className="ep-row">
            <MapPin size={13} className="ep-row-ic" />
            {editing === 'location' ? (
              <input
                className="ep-input ep-row-input"
                value={draft.location}
                autoFocus
                placeholder="Add location"
                onChange={e => set({ location: e.target.value })}
                onBlur={() => setEditing(null)}
                onKeyDown={e => e.key === 'Enter' && setEditing(null)}
              />
            ) : (
              <span
                className={`ep-row-val${editableCls}${draft.location ? '' : ' ep-row-empty'}`}
                onClick={() => startEdit('location')}
              >{draft.location || 'Add location'}</span>
            )}
          </div>
        )}

        {norm.source === 'google' && (draft.description || norm.canEdit) && (
          <div className="ep-row">
            <AlignLeft size={13} className="ep-row-ic" />
            {editing === 'description' ? (
              <textarea
                className="ep-input ep-row-input ep-desc-input"
                value={draft.description}
                autoFocus
                rows={3}
                placeholder="Add description"
                onChange={e => set({ description: e.target.value })}
                onBlur={() => setEditing(null)}
              />
            ) : (
              <span
                className={`ep-row-val${editableCls}${draft.description ? '' : ' ep-row-empty'}`}
                onClick={() => startEdit('description')}
              >{draft.description || 'Add description'}</span>
            )}
          </div>
        )}

        {/* ── Confirm / status bar ── */}
        {error && <p className="ep-error">{error}</p>}
        {savedMsg && !dirty && <p className="ep-saved">{savedMsg}</p>}
        {dirty && (
          <div className={`ep-confirm${nudge ? ' nudged' : ''}`}>
            <p className="ep-confirm-msg">
              {nudge ? 'You have unsaved edits. ' : ''}
              {norm.source === 'loop'
                ? 'Confirm edits? An updated invite will be sent to all invitees.'
                : 'Confirm edits? Attendees will be sent the updated invite.'}
            </p>
            <div className="ep-confirm-btns">
              <button className="ep-btn-confirm" onClick={save} disabled={saving}>
                {saving ? 'Sending…' : 'Confirm & send'}
              </button>
              <button className="ep-btn-discard" onClick={discard} disabled={saving}>Discard</button>
            </div>
          </div>
        )}

        {/* ── Footer: assistant access ── */}
        <div className="ep-footer">
          <button className="ep-ai-btn" onClick={() => setShowAI(true)}>
            <Sparkles size={13} /> Scheduling Assistant
          </button>
        </div>
      </div>

      {showAI && (
        <div className="ep-backdrop ep-ai-backdrop" onClick={e => { e.stopPropagation(); setShowAI(false); }}>
          <div className="ep-ai-modal" onClick={e => e.stopPropagation()}>
            <AISummary onClose={() => setShowAI(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default EventPopup;
