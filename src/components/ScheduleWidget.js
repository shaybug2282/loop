import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, ChevronLeft, Calendar, Clock, Sparkles, Send } from 'lucide-react';
import { formatEventTime as formatTime, formatDuration } from '../utils/format';
import './ScheduleWidget.css';

// Module-level singletons — survive re-mounts and are shared across every
// ScheduleWidget instance (dashboard + schedule page) without any sync.
const _dismissed = (() => {
  try { const s = localStorage.getItem('sw-dismissed'); return new Set(s ? JSON.parse(s) : []); }
  catch { return new Set(); }
})();
const _scheduled = new Set(); // event IDs that already have a 60-s auto-dismiss timer
const _listeners  = new Set(); // callbacks notified whenever _dismissed changes

const persistDismissed = () => {
  try { localStorage.setItem('sw-dismissed', JSON.stringify([..._dismissed])); } catch {}
};

// isDismissed / dismissEvent / restoreEvent / subscribeDismissed — the public
// surface for other components (e.g. the Schedule page's "View dismissed"
// panel) to read and mutate the shared dismiss set without duplicating its
// localStorage logic. subscribeDismissed lets any mounted consumer re-render
// when a dismissal happens elsewhere (another ScheduleWidget instance, or a
// restore from the dismissed-events panel).
export const isDismissed = (id) => _dismissed.has(id);

export const dismissEvent = (id) => {
  if (_dismissed.has(id)) return;
  _dismissed.add(id);
  persistDismissed();
  _listeners.forEach(fn => fn());
};

export const restoreEvent = (id) => {
  if (!_dismissed.has(id)) return;
  _dismissed.delete(id);
  persistDismissed();
  _listeners.forEach(fn => fn());
};

export const subscribeDismissed = (cb) => {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
};

// ── Sub-screens ───────────────────────────────────────────────────────────────

const StartScreen = ({ onSelect }) => (
  <div className="sw-screen">
    <p className="sw-prompt">What would you like to schedule?</p>
    <div className="sw-choices">
      <button className="sw-choice" onClick={() => onSelect('stub')}>Event</button>
      <button className="sw-choice primary" onClick={() => onSelect('friends')}>With a friend</button>
      <button className="sw-choice primary" onClick={() => onSelect('group-select')}>With a group</button>
      <button className="sw-choice" onClick={() => onSelect('stub')}>Other</button>
    </div>
  </div>
);

const StubScreen = ({ onReset }) => (
  <div className="sw-screen sw-center">
    <p className="sw-body-text">Nah, we didn't get to this yet.</p>
    <button className="sw-btn-ghost" onClick={onReset}>Start Over</button>
  </div>
);

const FriendSelectScreen = ({ friends, selected, onToggle, onNext }) => (
  <div className="sw-screen sw-friends">
    <p className="sw-sublabel">Select friends to invite:</p>
    <ul className="sw-friend-list">
      {friends.length === 0 && <li className="sw-empty">No friends yet.</li>}
      {friends.map(f => {
        const on = selected.has(f.id);
        return (
          <li
            key={f.id}
            className={`sw-friend-item ${on ? 'on' : ''}`}
            onClick={() => onToggle(f.id)}
          >
            {f.picture_url
              ? <img src={f.picture_url} alt="" className="sw-av" />
              : <div className="sw-av placeholder">{(f.display_name || f.name)?.[0]}</div>}
            <span className="sw-fname">{f.display_name || f.name}</span>
            {on && <span className="sw-tick">✓</span>}
          </li>
        );
      })}
    </ul>
    {selected.size > 0 && (
      <button className="sw-arrow" onClick={onNext} title="Next">
        <ArrowRight size={20} />
      </button>
    )}
  </div>
);

// GroupSelectScreen — "With a group" entry point: pick a group and all its
// accepted members land preselected on the friend screen (same flow as
// "With a friend", just pre-filled).
const GroupSelectScreen = ({ groups, onPick }) => (
  <div className="sw-screen sw-friends">
    <p className="sw-sublabel">Which group?</p>
    <ul className="sw-friend-list">
      {groups.length === 0 && <li className="sw-empty">No groups yet.</li>}
      {groups.map(g => {
        const count = (g.members ?? []).filter(m => m.status === 'accepted').length;
        return (
          <li key={g.id} className="sw-friend-item" onClick={() => onPick(g)}>
            {g.icon_url
              ? <img src={g.icon_url} alt="" className="sw-av" />
              : <div className="sw-av placeholder" style={{ background: g.color || '#E8607A' }}>{g.name?.[0]}</div>}
            <span className="sw-fname">{g.name}</span>
            <span className="sw-group-count">{count} {count === 1 ? 'member' : 'members'}</span>
          </li>
        );
      })}
    </ul>
  </div>
);

// TimingScreen — 2 options: pick a time manually, or let the AI find one.
// "Find a time" opens the AI scheduling chat (was two buttons — a calendar
// free/busy search and a separate "Ask AI" — now merged into this one).
const TimingScreen = ({ onPick, onFind }) => (
  <div className="sw-screen">
    <p className="sw-sublabel">How would you like to choose a time?</p>
    <div className="sw-choices">
      <button className="sw-choice" onClick={onPick}>Pick a time</button>
      <button className="sw-choice primary sw-choice-ai" onClick={onFind}>
        <Sparkles size={13} />
        Find a time
      </button>
    </div>
  </div>
);

const PickTimeScreen = ({ onSchedule, loading }) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [timeError, setTimeError] = useState('');
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const minTime = date === today
    ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    : undefined;
  const ready = date && time;

  const go = () => {
    if (!ready) return;
    const selected = new Date(`${date}T${time}`);
    if (selected <= new Date()) { setTimeError('Please choose a time in the future.'); return; }
    setTimeError('');
    onSchedule(selected.toISOString(), 1);
  };

  return (
    <div className="sw-screen">
      <p className="sw-sublabel">Choose a date and time:</p>
      <div className="sw-field">
        <label className="sw-label">Date</label>
        <input type="date" className="sw-input" min={today} value={date}
          onChange={e => { setDate(e.target.value); setTimeError(''); }}
          onKeyDown={e => { if (e.key === 'Enter' && ready && !loading) go(); }}
        />
      </div>
      <div className="sw-field">
        <label className="sw-label">Time</label>
        <input type="time" className="sw-input" value={time} min={minTime}
          onChange={e => { setTime(e.target.value); setTimeError(''); }}
          onKeyDown={e => { if (e.key === 'Enter' && ready && !loading) go(); }}
        />
      </div>
      {timeError && <p className="sw-time-error">{timeError}</p>}
      <button className="sw-btn-primary" disabled={!ready || loading} onClick={go}>
        {loading ? 'Scheduling…' : 'Schedule'}
      </button>
    </div>
  );
};

// AiAskScreen — natural language input that triggers Sonnet scheduling.
const AiAskScreen = ({ value, onChange, onSend, loading }) => (
  <div className="sw-screen">
    <p className="sw-sublabel">Describe the event and I'll suggest times:</p>
    <div className="sw-ai-input-row">
      <input
        className="sw-input sw-ai-input"
        type="text"
        placeholder="e.g. Dinner next week, about 2 hours…"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && value.trim() && !loading) onSend(); }}
        disabled={loading}
        autoFocus
      />
      <button
        className="sw-ai-send"
        onClick={onSend}
        disabled={!value.trim() || loading}
        title="Get suggestions"
      >
        <Send size={14} />
      </button>
    </div>
    {loading && <p className="sw-sublabel sw-ai-thinking">Finding the best times…</p>}
  </div>
);

// AiProposedScreen — Sonnet's suggested times as clickable cards, each with an
// optional location line beneath the time.
const AiProposedScreen = ({ plans, onSelect }) => (
  <div className="sw-screen">
    <p className="sw-sublabel">Choose a time that works:</p>
    <div className="sw-time-list">
      {plans.map((p, i) => (
        <button key={i} className="sw-time-opt" onClick={() => onSelect(p)}>
          <Calendar size={14} style={{ flexShrink: 0 }} />
          <div className="sw-time-opt-body">
            <span>{formatTime(p.start)}</span>
            {p.location && <span className="sw-time-opt-loc">{p.location}</span>}
          </div>
        </button>
      ))}
    </div>
  </div>
);

const SearchingScreen = () => (
  <div className="sw-screen sw-center">
    <div className="sw-spinner" />
    <p className="sw-sublabel">Searching schedules…</p>
  </div>
);

const PendingScreen = ({ onReset }) => (
  <div className="sw-screen sw-center">
    <div className="sw-big-icon">🗓</div>
    <p className="sw-heading">Event pending.</p>
    <p className="sw-sublabel">Waiting for friends to accept.</p>
    <button className="sw-btn-ghost" style={{ marginTop: 8 }} onClick={onReset}>Schedule another</button>
  </div>
);

// ── Notification card ─────────────────────────────────────────────────────────

// NotifCard — an invite card. "This doesn't work for me." expands into
// "Reschedule?" (opens the constraint popup via onReschedule) and "Decline.".
// A rescheduling event renders grayed out with a pending notice and no actions.
const NotifCard = ({ event, myId, onRespond, onReschedule }) => {
  const [busy,    setBusy]    = useState(false);
  const [noWork,  setNoWork]  = useState(false); // "doesn't work" expanded
  const handle = async (action) => {
    setBusy(true);
    await onRespond(event.id, action);
    setBusy(false);
  };
  const rescheduling = event.status === 'rescheduled';
  const accepted  = event.acceptances?.includes(myId);
  const allDone   = event.status === 'accepted';
  const acceptedN = event.acceptances?.length ?? 0;
  const totalN    = event.invited_user_ids?.length ?? 0;

  return (
    <div className={`sw-notif-card${rescheduling ? ' rescheduling' : ''}`}>
      <div className="sw-notif-time">
        <Clock size={12} />
        {formatTime(event.event_time)}
        {event.duration_hours ? <span className="sw-notif-dur"> · {formatDuration(event.duration_hours)}</span> : null}
      </div>
      <div className="sw-notif-people">
        <span className="sw-tag organizer">
          {event.creator?.display_name || event.creator?.name || 'Someone'} · organizer
        </span>
        {event.invitedUsers?.filter(u => u.id !== myId).map(u => (
          <span key={u.id} className="sw-tag invited">
            {u.display_name || u.name}
          </span>
        ))}
      </div>
      <p className="sw-notif-progress">{acceptedN}/{totalN} accepted</p>
      {rescheduling ? (
        <p className="sw-notif-resched-notice">Pending: Event is being rescheduled.</p>
      ) : allDone ? (
        <p className="sw-notif-done">All accepted! Check Google Calendar.</p>
      ) : accepted ? (
        <p className="sw-notif-waiting">You accepted · waiting for others</p>
      ) : (
        <div className="sw-notif-actions">
          <button className="sw-notif-btn accept" disabled={busy} onClick={() => handle('accept')}>Accept</button>
          {noWork ? (
            <>
              <button className="sw-notif-btn reschedule" disabled={busy} onClick={() => onReschedule(event)}>Reschedule?</button>
              <button className="sw-notif-btn decline" disabled={busy} onClick={() => handle('decline')}>Decline.</button>
            </>
          ) : (
            <button className="sw-notif-btn nowork" disabled={busy} onClick={() => setNoWork(true)}>This doesn't work for me.</button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Reschedule constraint popup ───────────────────────────────────────────────

// RescheduleDialog — chat-style popup opened from an invite's "Reschedule?".
// The assistant asks for constraints/preferred times; the user's single reply
// is sent with the reschedule request (onSend → /api/schedule respond), which
// notifies the event's creator. Ends on a confirmation bubble.
const RescheduleDialog = ({ event, onSend, onClose }) => {
  const [text,  setText]  = useState('');
  const [note,  setNote]  = useState(null);   // the sent user message
  const [phase, setPhase] = useState('ask');  // ask | sending | done | error
  const creator = event.creator?.display_name || event.creator?.name || 'the organizer';

  const send = async () => {
    const t = text.trim();
    if (!t || phase === 'sending' || phase === 'done') return;
    setNote(t);
    setPhase('sending');
    const ok = await onSend(t);
    setPhase(ok ? 'done' : 'error');
  };

  return (
    <div className="sw-modal-backdrop" onClick={onClose}>
      <div className="sw-resched-modal" onClick={e => e.stopPropagation()}>
        <div className="sw-rd-header">
          <Sparkles size={15} />
          <span className="sw-rd-title">Reschedule · {formatTime(event.event_time)}</span>
          <button className="sw-rd-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="sw-rd-body">
          <div className="sw-rd-bubble ai">
            Are there any other constraints or preferred times for this event?
          </div>
          {note && <div className="sw-rd-bubble user">{note}</div>}
          {phase === 'sending' && <div className="sw-rd-bubble ai">Sending your request…</div>}
          {phase === 'done' && (
            <div className="sw-rd-bubble ai">
              Got it — I've asked {creator} to reschedule and passed your note along. You'll get a new invite once they pick a time.
            </div>
          )}
          {phase === 'error' && (
            <div className="sw-rd-bubble ai error">
              Something went wrong sending your request. Please try again.
            </div>
          )}
        </div>
        {phase === 'done' ? (
          <div className="sw-rd-footer">
            <button className="sw-btn-primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <div className="sw-ai-input-row sw-rd-input-row">
            <input
              className="sw-input sw-ai-input"
              type="text"
              placeholder="e.g. Evenings after 6 work best…"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              disabled={phase === 'sending'}
              autoFocus
            />
            <button
              className="sw-ai-send"
              onClick={send}
              disabled={!text.trim() || phase === 'sending'}
              title="Send"
            >
              <Send size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main widget ───────────────────────────────────────────────────────────────

const BACK = {
  friends:        'start',
  'group-select': 'start',
  timing:         'friends',
  'pick-time':    'timing',
  'ai-ask':       'timing',
  'ai-proposed':  'ai-ask',
};

export default function ScheduleWidget() {
  const [screen,        setScreen]        = useState('start');
  const [friends,       setFriends]       = useState([]);
  const [groups,        setGroups]        = useState([]);
  const [selected,      setSelected]      = useState(new Set());
  const [notifs,        setNotifs]        = useState([]);
  const [myId,          setMyId]          = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const [reschedEvent,  setReschedEvent]  = useState(null); // invite being rescheduled via popup
  // AI ask state
  const [aiRequest,     setAiRequest]     = useState('');
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiPlans,       setAiPlans]       = useState([]);
  // Counter used only to force a re-render when _dismissed changes.
  const [, setDismissVersion] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();
  const onSchedulePage = location.pathname === '/schedule';

  const googleId = localStorage.getItem('googleUserId');

  const loadNotifs = useCallback(async () => {
    if (!googleId) return;
    try {
      const r = await fetch(`/api/schedule?op=pending-events&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) {
        const all = (await r.json()).events ?? [];
        setNotifs(all.filter(e => !_dismissed.has(e.id)));
      } else {
        const body = await r.json().catch(() => ({}));
        console.error('[ScheduleWidget] pending-events failed:', r.status, body);
      }
    } catch (err) {
      console.error('[ScheduleWidget] loadNotifs error:', err);
    }
  }, [googleId]);

  useEffect(() => {
    if (!googleId) return;
    (async () => {
      try {
        const r = await fetch(`/api/user?op=my-id&googleId=${encodeURIComponent(googleId)}`);
        if (r.ok) setMyId((await r.json()).id);
      } catch {}
      loadNotifs();
    })();
  }, [googleId, loadNotifs]);

  useEffect(() => {
    if (!googleId) return;
    const t = setInterval(loadNotifs, 15_000);
    return () => clearInterval(t);
  }, [googleId, loadNotifs]);

  useEffect(() => {
    if (screen !== 'friends' || !googleId) return;
    fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json()).then(d => setFriends(d.friends ?? [])).catch(() => {});
  }, [screen, googleId]);

  useEffect(() => {
    if (screen !== 'group-select' || !googleId) return;
    fetch(`/api/groups?op=list&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json()).then(d => setGroups(d.groups ?? [])).catch(() => {});
  }, [screen, googleId]);

  const dismiss = useCallback(id => dismissEvent(id), []);

  // Re-render whenever the shared dismiss set changes, including restores
  // triggered from the Schedule page's "View dismissed" panel.
  useEffect(() => subscribeDismissed(() => setDismissVersion(v => v + 1)), []);

  useEffect(() => {
    if (!myId) return;
    notifs.forEach(e => {
      if (_dismissed.has(e.id)) return;
      const isInvite     = !e.isCreator && !['declined', 'rescheduled'].includes(e.status) && !(e.declines ?? []).includes(myId);
      const isDecline    = e.isCreator  && (e.declines ?? []).length > 0;
      const isReschedule = e.isCreator  && e.status === 'rescheduled';
      const isConfirmed  = e.isCreator  && e.status === 'accepted';
      if (!isInvite && !isDecline && !isReschedule && !isConfirmed) return;
      if (_scheduled.has(e.id)) return;
      _scheduled.add(e.id);
      setTimeout(() => dismiss(e.id), 60_000);
    });
  }, [notifs, myId, dismiss]);

  const reset = () => {
    setScreen('start');
    setSelected(new Set());
    setAiRequest('');
    setAiPlans([]);
    setScheduleError(null);
    loadNotifs();
  };

  const toggle = id =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // pickGroup — preselect a group's accepted members (minus self) and hand off
  // to the friend screen, where they show checked and can be adjusted.
  const pickGroup = (g) => {
    const ids = (g.members ?? [])
      .filter(m => m.status === 'accepted' && m.id !== myId)
      .map(m => m.id);
    setSelected(new Set(ids));
    setScreen('friends');
  };

  // choose — create the event via /api/schedule and advance to pending screen.
  const choose = async (time, dur = 1) => {
    setScheduleError(null);
    setLoading(true);
    try {
      const r = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'create-event', creatorGoogleId: googleId,
          invitedUserIds: [...selected], eventTime: time, durationHours: dur,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${r.status})`);
      }
      setScreen('pending');
      loadNotifs();
    } catch (err) {
      setScheduleError(err.message || 'Could not create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // askAI — send the natural-language request to Sonnet with all selected friends
  // as participants. On success, advance to ai-proposed to show clickable plan cards.
  const askAI = async () => {
    if (!aiRequest.trim() || !googleId) return;
    setAiLoading(true);
    setScreen('searching');
    try {
      const r = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          op:             'schedule',
          googleId,
          participantIds: [...selected],  // Supabase UUIDs
          request:        aiRequest,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'AI error');
      if (data.clarification_needed) {
        setScheduleError(data.clarification_needed);
        setScreen('ai-ask');
      } else if (!data.plans?.length) {
        setScreen('no-time-final');
      } else {
        setAiPlans(data.plans);
        setScreen('ai-proposed');
      }
    } catch (err) {
      setScheduleError(err.message || 'Could not find times. Please try again.');
      setScreen('ai-ask');
    } finally {
      setAiLoading(false);
    }
  };

  // chooseAiPlan — convert a Sonnet plan to the same choose() call as manual scheduling.
  // Duration is derived from the plan's start/end; falls back to 1 hr.
  const chooseAiPlan = (plan) => {
    const dur = plan.end && plan.start
      ? Math.max(0.5, +((new Date(plan.end) - new Date(plan.start)) / 3.6e6).toFixed(1))
      : 1;
    choose(plan.start, dur);
  };

  const respond = async (eventId, action) => {
    await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'respond', googleId, eventId, action }),
    });
    loadNotifs();
  };

  // requestReschedule — send the popup's constraint note with the reschedule
  // request; the event is parked as 'rescheduled' for every invitee and the
  // creator is notified (with the note) via their Scheduling Assistant.
  // Returns true on success so the dialog can show its confirmation bubble.
  const requestReschedule = async (note) => {
    if (!reschedEvent) return false;
    try {
      const r = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'respond', googleId, eventId: reschedEvent.id, action: 'reschedule', note }),
      });
      if (!r.ok) return false;
      loadNotifs();
      return true;
    } catch {
      return false;
    }
  };

  const renderScreen = () => {
    switch (screen) {
      case 'start':        return <StartScreen onSelect={setScreen} />;
      case 'stub':         return <StubScreen onReset={reset} />;
      case 'group-select': return <GroupSelectScreen groups={groups} onPick={pickGroup} />;
      case 'friends':      return <FriendSelectScreen friends={friends} selected={selected} onToggle={toggle} onNext={() => setScreen('timing')} />;
      case 'timing':       return <TimingScreen onPick={() => setScreen('pick-time')} onFind={() => setScreen('ai-ask')} />;
      case 'pick-time':    return <PickTimeScreen onSchedule={choose} loading={loading} />;
      case 'ai-ask':       return <AiAskScreen value={aiRequest} onChange={setAiRequest} onSend={askAI} loading={aiLoading} />;
      case 'searching':    return <SearchingScreen />;
      case 'ai-proposed':  return <AiProposedScreen plans={aiPlans} onSelect={chooseAiPlan} />;
      case 'no-time-final': return (
        <div className="sw-screen sw-center">
          <p className="sw-body-text">No available time found in the next 2 weeks.</p>
          <button className="sw-btn-ghost" onClick={reset}>Start Over</button>
        </div>
      );
      case 'pending':      return <PendingScreen onReset={reset} />;
      default: return null;
    }
  };

  const canBack   = screen in BACK;
  // Declined events are closed for invitees. Rescheduling events stay visible
  // as grayed-out cards ("Pending: Event is being rescheduled.") so no one can
  // accept a time that is being moved. (A partial decliner is removed from
  // invited_user_ids server-side, so their copy disappears while the event
  // stays live for everyone else.)
  const myInvites = notifs.filter(e => !e.isCreator && e.status !== 'declined' && !(e.declines ?? []).includes(myId) && !_dismissed.has(e.id));
  const myCreated = notifs.filter(e => e.isCreator && e.status === 'accepted' && !_dismissed.has(e.id));

  return (
    <div className="sw-widget">
      <div className="sw-header">
        {canBack && (
          <button className="sw-back" onClick={() => { setScreen(BACK[screen]); setScheduleError(null); }}>
            <ChevronLeft size={16} />
          </button>
        )}
        <h2
          className={`sw-title${!onSchedulePage ? ' sw-title-link' : ''}`}
          onClick={!onSchedulePage ? () => navigate('/schedule') : undefined}
          title={!onSchedulePage ? 'Open Schedule page' : undefined}
        >Schedule!</h2>
      </div>

      <div className="sw-body">
        {scheduleError && (
          <div className="sw-error-banner">
            {scheduleError}
            <button className="sw-error-dismiss" onClick={() => setScheduleError(null)}>✕</button>
          </div>
        )}

        {myCreated.map(e => (
          <div key={e.id} className="sw-notif-wrap">
            <div className="sw-created-done">
              <Clock size={12} />
              <span>{formatTime(e.event_time)} · {formatDuration(e.duration_hours)} — all confirmed!</span>
            </div>
            <button className="sw-notif-x" onClick={() => dismiss(e.id)} title="Dismiss">✕</button>
          </div>
        ))}

        {notifs
          .filter(e => e.isCreator && (e.declines ?? []).length > 0 && !_dismissed.has(e.id))
          .flatMap(e =>
            (e.declinedUsers ?? []).map(u => (
              <div key={`decline-${e.id}-${u.id}`} className="sw-decline-notif">
                <span className="sw-decline-name">{u.display_name || u.name || 'Someone'}</span>
                {e.status === 'declined' ? ' declined · ' : ' declined (others still in) · '}
                <span className="sw-decline-time">{formatTime(e.event_time)} ({formatDuration(e.duration_hours)})</span>
                <button className="sw-notif-x" onClick={() => dismiss(e.id)} title="Dismiss">✕</button>
              </div>
            ))
          )
        }

        {notifs
          .filter(e => e.isCreator && e.status === 'rescheduled' && !_dismissed.has(e.id))
          .flatMap(e =>
            (e.rescheduleUsers ?? []).map(u => (
              <div key={`resched-${e.id}-${u.id}`} className="sw-resched-notif">
                <span className="sw-decline-name">{u.display_name || u.name || 'Someone'}</span>
                {' asked to reschedule · '}
                <span className="sw-decline-time">{formatTime(e.event_time)}</span>
                <span className="sw-resched-hint">Open the Scheduling Assistant to pick new times.</span>
                <button className="sw-notif-x" onClick={() => dismiss(e.id)} title="Dismiss">✕</button>
              </div>
            ))
          )
        }

        {myInvites.length > 0 && (
          <div className="sw-invites">
            <p className="sw-invites-label">
              {myInvites.length === 1 ? '1 invite' : `${myInvites.length} invites`}
            </p>
            {myInvites.map(e => (
              <div key={e.id} className="sw-notif-wrap">
                <NotifCard event={e} myId={myId} onRespond={respond} onReschedule={setReschedEvent} />
                <button className="sw-notif-x" onClick={() => dismiss(e.id)} title="Dismiss">✕</button>
              </div>
            ))}
          </div>
        )}

        {renderScreen()}
      </div>

      {reschedEvent && (
        <RescheduleDialog
          event={reschedEvent}
          onSend={requestReschedule}
          onClose={() => setReschedEvent(null)}
        />
      )}
    </div>
  );
}
