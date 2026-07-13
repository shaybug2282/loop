import React, { useState, useMemo } from 'react';
import { X, Clock, MapPin, AlignLeft, Sparkles, Trash2, Info, Umbrella } from 'lucide-react';
import AISummary from './AISummary';
import { formatDuration } from '../utils/format';
import { updateCalendarEvent, deleteCalendarEvent } from '../utils/googleCalendar';
import './EventPopup.css';

// EventPopup — the universal event modal. Every event surface (calendar week
// view, Today's Schedule, dashboard pending tiles, notification center) opens
// events through this popup. Header: event name + date & time. Below: every
// participant color-coded (blue host / green accepted / yellow pending / grey
// declined), then any extra details. The organizer can click any field to
// edit it; edits must be confirmed, which sends an updated invite to every
// invitee (Loop events restart their accept cycle; Google events are patched
// with sendUpdates=all). Invitees answer pending Loop invites here too:
// Accept, or "This doesn't work for me." → Reschedule? (with a constraint
// note for the organizer) / Decline. The Scheduling Assistant opens in a
// nested popup.
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
    // Latest constraint note per reschedule requester (migration 011) — the
    // creator reviews these in the popup while the event is locked.
    const noteByUser = {};
    for (const n of (e.reschedule_notes ?? [])) noteByUser[n.user_id] = n.note;
    return {
      source:        'loop',
      id:            e.id,
      title:         e.title || 'Hangout',
      start:         e.event_time,
      end:           null,
      allDay:        false,
      durationHours: e.duration_hours ?? 1,
      location:      e.location || '',
      // Invite-only note (migration 009) — shown here and on the invite,
      // never forwarded to the confirmed Google Calendar event.
      description:   e.description || '',
      status:        e.status,
      canEdit:       Boolean(e.isCreator),
      // Invitees answer the invite right in the popup (the pending tiles and
      // notification center are now the only surfaces that show invites).
      canRespond:    !e.isCreator && e.status === 'pending' && (e.invited_user_ids ?? []).includes(e.myId),
      iAccepted:     accepted.has(e.myId),
      // Reschedule lock context: who asked (with their constraint note, for
      // the creator to review) and whether the viewer is a requester.
      rescheduleRequests: (e.rescheduleUsers ?? []).map(u => ({
        key:  u.id,
        name: u.id === e.myId ? 'You' : nameOf(u),
        note: noteByUser[u.id] ?? null,
      })),
      iAskedReschedule: (e.reschedule_requests ?? []).includes(e.myId),
      // Rain Check: two-person CONFIRMED events only; iRainchecked is the
      // viewer's own secret bit from the API (the other side's is never sent).
      iRainchecked: Boolean(e.iRainchecked),
      canRaincheck: e.status === 'accepted' &&
        (e.invited_user_ids ?? []).length === 1 &&
        (e.isCreator || (e.invited_user_ids ?? []).includes(e.myId)),
      participants: [
        { key: 'host', name: e.isCreator ? 'You' : nameOf(e.creator), status: 'host' },
        ...(e.invitedUsers ?? []).map(u => ({
          key:    u.id,
          userId: u.id,
          name:   u.id === e.myId ? 'You' : nameOf(u),
          status: accepted.has(u.id) ? 'accepted' : 'pending',
        })),
        ...(e.declinedUsers ?? []).map(u => ({
          key: `d-${u.id}`, userId: u.id, name: u.id === e.myId ? 'You' : nameOf(u), status: 'declined',
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
    canRespond:    false,
    iAccepted:     false,
    rescheduleRequests: [],
    iAskedReschedule:   false,
    iRainchecked:       false,
    canRaincheck:       false,
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
  rainchecked: 'Rain Checked',
};

// The Rain Check explainer, shown when hovering the info symbol.
const RAINCHECK_TIP =
  "Rain Check allows you to tentatively cancel an event. If you choose to Rain Check, " +
  "your friend won't be notified unless they Rain Check too! If you both independently " +
  "choose to cancel, the event will be canceled. Otherwise, your secret is safe here :)";

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
  const [delConfirm, setDelConfirm] = useState(false); // "Delete event" clicked, awaiting confirm
  const [deleting,   setDeleting]   = useState(false);
  // Invite-response state (invitees on pending Loop events only)
  // Re-invite staging (creator on Loop events): declined chips toggle into
  // `readds`; confirming the edit sends them as readdUserIds. `reinvited`
  // remembers successful re-adds so chips read as pending until a refetch.
  const [readds,    setReadds]    = useState(() => new Set());
  const [reinvited, setReinvited] = useState(() => new Set());
  const [noWork,      setNoWork]      = useState(false); // "This doesn't work for me." expanded
  const [reschedOpen, setReschedOpen] = useState(false); // constraint-note input visible
  const [reschedNote, setReschedNote] = useState('');
  const [responding,  setResponding]  = useState(false);
  const [respMsg,     setRespMsg]     = useState(null);  // post-response confirmation text
  // Rain Check: null | 'sending' | 'sent' | 'undone' | 'canceled' ('sent' =
  // mine recorded, still secret — retractable until the other side matches;
  // 'undone' = retracted this session, overrides the server's iRainchecked;
  // 'canceled' = both sides rainchecked, event cancelled).
  const [rcState, setRcState] = useState(null);
  // Fixed-position coords for the Rain Check tooltip — rendered outside the
  // modal's scroll clipping so it can overlay the popup border.
  const [rcTip, setRcTip] = useState(null);

  const googleId = localStorage.getItem('googleUserId');
  const dirty    = JSON.stringify(draft) !== JSON.stringify(baseline) || readds.size > 0;
  const changed  = k => String(draft[k] ?? '') !== String(baseline[k] ?? '');
  // Description is an invite-only note; editing it alone doesn't change what
  // invitees agreed to, so Loop events skip the re-invite cycle for it (the
  // server enforces the same rule) — the confirm copy must match. Staged
  // re-invites are material: they restart the cycle.
  const materialDirty = ['title', 'date', 'time', 'durationHours', 'location'].some(changed) || readds.size > 0;
  const noteOnlyEdit  = norm.source === 'loop' && dirty && !materialDirty;

  // toggleReadd — stage/unstage a declined user for re-inviting on save.
  const toggleReadd = (userId) => {
    if (saving) return;
    setReadds(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
    setSavedMsg(null);
    setError(null);
  };

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
    setReadds(new Set());
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
        // Send only the fields that changed — the server treats a
        // description-only payload as non-material and keeps acceptances.
        const r = await fetch('/api/schedule', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            op: 'update-event', googleId, eventId: norm.id,
            ...(changed('title') ? { title: draft.title || null } : {}),
            ...((changed('date') || changed('time'))
              ? { eventTime: new Date(`${draft.date}T${draft.time}`).toISOString() }
              : {}),
            ...(changed('durationHours') ? { durationHours: Number(draft.durationHours) || 1 } : {}),
            ...(changed('location') ? { location: draft.location || null } : {}),
            ...(changed('description') ? { description: draft.description || null } : {}),
            ...(readds.size ? { readdUserIds: [...readds] } : {}),
          }),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
        if (readds.size) {
          setReinvited(prev => new Set([...prev, ...readds]));
          setReadds(new Set());
        }
        setSavedMsg(noteOnlyEdit
          ? 'Saved — the note was updated for everyone; no new invites needed.'
          : 'Saved — an updated invite was sent to all invitees.');
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

  // respond — answer the invite (accept | decline | reschedule + optional
  // constraint note). On success the action bar is replaced by a confirmation
  // message and the parent surface refetches via onChanged.
  const respond = async (action, note = null) => {
    setResponding(true);
    setError(null);
    try {
      const r = await fetch('/api/schedule', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'respond', googleId, eventId: norm.id, action, ...(note ? { note } : {}) }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
      const hostName = norm.participants.find(p => p.status === 'host')?.name || 'the organizer';
      setRespMsg(
        action === 'accept'
          ? (body.status === 'accepted'
              ? "Everyone's in — the event is confirmed!"
              : 'Accepted — waiting for the others.')
          : action === 'decline'
            ? `Declined — ${hostName} will be notified.`
            : `Got it — we've asked ${hostName} to reschedule and passed your note along. You'll get a new invite once they pick a time.`
      );
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not send your response.');
    } finally {
      setResponding(false);
    }
  };

  // sendRaincheck — record (or with undo=true retract) this side's secret
  // raincheck. Retracting is possible right up until the other person matches
  // it; once they do, the server cancels the event everywhere and we show the
  // mutual-cancel message. One side alone changes nothing for the other.
  const sendRaincheck = async (undo = false) => {
    const prev = rcState;
    setRcState('sending');
    setError(null);
    try {
      const r = await fetch('/api/schedule', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'raincheck', googleId, eventId: norm.id, ...(undo ? { undo: true } : {}) }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
      if (body.canceled) {
        setRcState('canceled');
        setRespMsg('This event has been Rain Checked!');
        onChanged?.();
      } else {
        setRcState(undo ? 'undone' : 'sent');
      }
    } catch (err) {
      setRcState(prev);
      setError(err.message || 'Could not update your Rain Check.');
    }
  };

  // showRcTip / hideRcTip — the tooltip is position:fixed (anchored to the
  // info icon's viewport rect, clamped to the screen) so the modal's
  // overflow-y:auto can never clip it — it overlays the popup border instead.
  const showRcTip = (e) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const width = 250;
    const left  = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setRcTip({ left, bottom: window.innerHeight - rect.top + 8, width });
  };
  const hideRcTip = () => setRcTip(null);

  // deleteEvent — cancels and removes the event: Loop rows are deleted via
  // delete-event (which cancels any already-confirmed Google copy first,
  // sendUpdates=all); Google events are deleted directly. Either way every
  // invitee/attendee is notified of the cancellation.
  const deleteEvent = async () => {
    setDeleting(true);
    setError(null);
    try {
      if (norm.source === 'loop') {
        const r = await fetch('/api/schedule', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ op: 'delete-event', googleId, eventId: norm.id }),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
      } else {
        await deleteCalendarEvent(norm.id);
      }
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Could not delete event.');
      setDeleting(false);
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
              {norm.participants.map(p => {
                // A saved re-invite shows as pending until the parent refetches.
                if (p.status === 'declined' && reinvited.has(p.userId)) {
                  return <span key={p.key} className="ep-part pending">{p.name}</span>;
                }
                // Creator can click a declined invitee to stage a re-invite;
                // declined users are otherwise left out when the event is
                // rescheduled or edited.
                if (p.status === 'declined' && norm.source === 'loop' && norm.canEdit) {
                  const staged = readds.has(p.userId);
                  return (
                    <button
                      key={p.key}
                      className={`ep-part declined ep-readd${staged ? ' staged' : ''}`}
                      title={staged ? 'Will be re-invited on save — click to cancel' : 'Click to re-invite'}
                      onClick={() => toggleReadd(p.userId)}
                    >
                      {p.name}{staged ? ' · re-inviting' : ' +'}
                    </button>
                  );
                }
                return <span key={p.key} className={`ep-part ${p.status}`}>{p.name}</span>;
              })}
            </div>
            <div className="ep-legend">
              <span className="ep-legend-item host">Host</span>
              <span className="ep-legend-item accepted">Accepted</span>
              <span className="ep-legend-item pending">Pending</span>
              <span className="ep-legend-item declined">Declined</span>
            </div>
            {norm.source === 'loop' && norm.canEdit && norm.participants.some(p => p.status === 'declined' && !reinvited.has(p.userId)) && (
              <p className="ep-readd-hint">
                Declined people aren't re-invited when you reschedule — click their name to include them again.
              </p>
            )}
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

        {(draft.description || norm.canEdit) && (
          <div className="ep-row">
            <AlignLeft size={13} className="ep-row-ic" />
            {editing === 'description' ? (
              <textarea
                className="ep-input ep-row-input ep-desc-input"
                value={draft.description}
                autoFocus
                rows={3}
                maxLength={norm.source === 'loop' ? 500 : undefined}
                placeholder={norm.source === 'loop' ? 'Add invite note (stays off Google Calendar)' : 'Add description'}
                onChange={e => set({ description: e.target.value })}
                onBlur={() => setEditing(null)}
              />
            ) : (
              <span
                className={`ep-row-val${editableCls}${draft.description ? '' : ' ep-row-empty'}`}
                onClick={() => startEdit('description')}
              >{draft.description || (norm.source === 'loop' ? 'Add invite note' : 'Add description')}</span>
            )}
          </div>
        )}

        {/* ── Reschedule lock ── */}
        {/* Creator: review the requester's constraints; a confirmed edit is
            what lifts the lock and sends fresh invites. */}
        {norm.source === 'loop' && norm.canEdit && norm.status === 'rescheduled' && norm.rescheduleRequests.length > 0 && (
          <div className="ep-resched-review">
            {norm.rescheduleRequests.map(r => (
              <p key={r.key} className="ep-resched-req">
                <strong>{r.name}</strong> asked to reschedule{r.note ? <> — “{r.note}”</> : '.'}
              </p>
            ))}
            <p className="ep-resched-review-hint">
              Responses are locked while you review. Pick a new time above and confirm to send everyone a fresh invite.
            </p>
          </div>
        )}

        {/* ── Invite response (invitee on a pending Loop event) ── */}
        {norm.source === 'loop' && !norm.canEdit && norm.status === 'rescheduled' && (
          norm.iAskedReschedule ? (
            <p className="ep-resched-notice">
              You asked to reschedule — {norm.participants.find(p => p.status === 'host')?.name || 'the host'} is
              reviewing your note. Responses are locked until they send an updated invite.
            </p>
          ) : (
            <p className="ep-resched-notice">Pending: Event is being rescheduled.</p>
          )
        )}
        {respMsg && <p className="ep-saved">{respMsg}</p>}
        {norm.canRespond && !respMsg && (
          norm.iAccepted ? (
            <p className="ep-resp-waiting">You accepted · waiting for others</p>
          ) : reschedOpen ? (
            <div className="ep-respond">
              <p className="ep-resp-q">Are there any other constraints or preferred times for this event?</p>
              <div className="ep-resp-note-row">
                <input
                  className="ep-input ep-resp-note"
                  type="text"
                  placeholder="e.g. Evenings after 6 work best…"
                  value={reschedNote}
                  autoFocus
                  onChange={e => setReschedNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && reschedNote.trim() && !responding) respond('reschedule', reschedNote.trim()); }}
                  disabled={responding}
                />
                <button
                  className="ep-mini-btn"
                  disabled={!reschedNote.trim() || responding}
                  onClick={() => respond('reschedule', reschedNote.trim())}
                >{responding ? 'Sending…' : 'Send'}</button>
              </div>
              <button className="ep-resp-cancel" onClick={() => setReschedOpen(false)} disabled={responding}>Cancel</button>
            </div>
          ) : (
            <div className="ep-respond ep-resp-btns">
              <button className="ep-resp-accept" disabled={responding} onClick={() => respond('accept')}>Accept</button>
              {noWork ? (
                <>
                  <button className="ep-resp-alt" disabled={responding} onClick={() => setReschedOpen(true)}>Reschedule?</button>
                  <button className="ep-resp-alt" disabled={responding} onClick={() => respond('decline')}>Decline.</button>
                </>
              ) : (
                <button className="ep-resp-alt" disabled={responding} onClick={() => setNoWork(true)}>This doesn't work for me.</button>
              )}
            </div>
          )
        )}

        {/* ── Confirm / status bar ── */}
        {error && <p className="ep-error">{error}</p>}
        {savedMsg && !dirty && <p className="ep-saved">{savedMsg}</p>}
        {dirty && (
          <div className={`ep-confirm${nudge ? ' nudged' : ''}`}>
            <p className="ep-confirm-msg">
              {nudge ? 'You have unsaved edits. ' : ''}
              {noteOnlyEdit
                ? 'Confirm edits? The note updates for everyone — no new invites are sent.'
                : norm.source === 'loop'
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

        {/* ── Footer: assistant access + rain check + delete ── */}
        <div className="ep-footer">
          <button className="ep-ai-btn" onClick={() => setShowAI(true)}>
            <Sparkles size={13} /> Scheduling Assistant
          </button>

          {rcState !== 'canceled' && norm.canRaincheck && (
            <div className="ep-rc-wrap">
              {(rcState === 'sent' || (norm.iRainchecked && rcState !== 'undone' && rcState !== 'sending')) ? (
                <>
                  <span className="ep-rc-sent">Rain check sent — your secret is safe here :)</span>
                  <button className="ep-rc-undo" onClick={() => sendRaincheck(true)}>Undo</button>
                </>
              ) : (
                <button className="ep-rc-btn" onClick={() => sendRaincheck(false)} disabled={rcState === 'sending'}>
                  <Umbrella size={13} />
                  {rcState === 'sending' ? 'Sending…' : 'Rain Check?'}
                </button>
              )}
              <span
                className="ep-rc-info"
                tabIndex={0}
                onMouseEnter={showRcTip}
                onMouseLeave={hideRcTip}
                onFocus={showRcTip}
                onBlur={hideRcTip}
              >
                <Info size={13} />
              </span>
              {rcTip && (
                <span className="ep-rc-tip" role="tooltip" style={rcTip}>{RAINCHECK_TIP}</span>
              )}
            </div>
          )}

          {norm.canEdit && (
            delConfirm ? (
              <div className="ep-delete-confirm">
                <p className="ep-delete-msg">
                  {norm.source === 'loop'
                    ? 'Delete this event? All invitees will be notified.'
                    : 'Delete this event? Attendees will be notified of the cancellation.'}
                </p>
                <div className="ep-confirm-btns">
                  <button className="ep-btn-delete" onClick={deleteEvent} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete event'}
                  </button>
                  <button className="ep-btn-discard" onClick={() => setDelConfirm(false)} disabled={deleting}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="ep-delete-btn" onClick={() => setDelConfirm(true)}>
                <Trash2 size={13} /> Delete event
              </button>
            )
          )}
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
