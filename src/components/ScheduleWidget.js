import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, ChevronLeft, Calendar, Clock } from 'lucide-react';
import './ScheduleWidget.css';

// Module-level singletons — survive re-mounts and are shared across every
// ScheduleWidget instance (dashboard + schedule page) without any sync.
const _dismissed = (() => {
  try { const s = localStorage.getItem('sw-dismissed'); return new Set(s ? JSON.parse(s) : []); }
  catch { return new Set(); }
})();
const _scheduled = new Set(); // event IDs that already have a 60-s auto-dismiss timer

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(hours) {
  if (!hours) return '';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours === 1) return '1 hr';
  return `${Number.isInteger(hours) ? hours : hours} hrs`;
}

// ── Sub-screens ───────────────────────────────────────────────────────────────

const StartScreen = ({ onSelect }) => (
  <div className="sw-screen">
    <p className="sw-prompt">What would you like to schedule?</p>
    <div className="sw-choices">
      <button className="sw-choice" onClick={() => onSelect('stub')}>Event</button>
      <button className="sw-choice primary" onClick={() => onSelect('friends')}>With a friend</button>
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

const TimingScreen = ({ onPick, onFind }) => (
  <div className="sw-screen">
    <p className="sw-sublabel">How would you like to choose a time?</p>
    <div className="sw-choices">
      <button className="sw-choice primary" onClick={onPick}>Pick a time</button>
      <button className="sw-choice" onClick={onFind}>Find a time</button>
    </div>
  </div>
);

const PickTimeScreen = ({ onSchedule, loading }) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [timeError, setTimeError] = useState('');
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  // Enforce minimum time when the selected date is today.
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

const FindTimeScreen = ({ onSearch, loading }) => {
  const [val, setVal] = useState('');
  const n = Number(val);
  return (
    <div className="sw-screen">
      <p className="sw-sublabel">How many hours should the event be?</p>
      <div className="sw-field">
        <input
          type="number" className="sw-input" placeholder="e.g. 2"
          min="0.5" max="12" step="0.5" value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && val && n > 0 && !loading) onSearch(n, 0); }}
        />
      </div>
      <button className="sw-btn-primary" disabled={!val || n <= 0 || loading} onClick={() => onSearch(n, 0)}>
        {loading ? 'Searching…' : 'Find times'}
      </button>
    </div>
  );
};

const SearchingScreen = () => (
  <div className="sw-screen sw-center">
    <div className="sw-spinner" />
    <p className="sw-sublabel">Searching schedules…</p>
  </div>
);

const ProposedScreen = ({ times, onSelect }) => (
  <div className="sw-screen">
    <p className="sw-sublabel">Choose a time that works:</p>
    <div className="sw-time-list">
      {times.map((t, i) => (
        <button key={i} className="sw-time-opt" onClick={() => onSelect(t)}>
          <Calendar size={14} />
          {formatTime(t)}
        </button>
      ))}
    </div>
  </div>
);

const NoTimeScreen = ({ onExtend, onReset }) => (
  <div className="sw-screen sw-center">
    <p className="sw-body-text">No time found. Extend search window to 2 weeks?</p>
    <div className="sw-choices">
      <button className="sw-choice primary" onClick={onExtend}>Yes</button>
      <button className="sw-choice" onClick={onReset}>No</button>
    </div>
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

const NotifCard = ({ event, myId, onRespond }) => {
  const [busy, setBusy] = useState(false);
  const handle = async (action) => {
    setBusy(true);
    await onRespond(event.id, action);
    setBusy(false);
  };
  const accepted  = event.acceptances?.includes(myId);
  const allDone   = event.status === 'accepted';
  const acceptedN = event.acceptances?.length ?? 0;
  const totalN    = event.invited_user_ids?.length ?? 0;

  return (
    <div className="sw-notif-card">
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
      {allDone ? (
        <p className="sw-notif-done">All accepted! Check Google Calendar.</p>
      ) : accepted ? (
        <p className="sw-notif-waiting">You accepted · waiting for others</p>
      ) : (
        <div className="sw-notif-actions">
          <button className="sw-notif-btn accept" disabled={busy} onClick={() => handle('accept')}>Accept</button>
          <button className="sw-notif-btn decline" disabled={busy} onClick={() => handle('decline')}>Decline</button>
        </div>
      )}
    </div>
  );
};

// ── Main widget ───────────────────────────────────────────────────────────────

const BACK = {
  friends:    'start',
  timing:     'friends',
  'pick-time':'timing',
  'find-time':'timing',
  proposed:   'find-time',
  'no-time':  'find-time',
};

export default function ScheduleWidget() {
  const [screen,        setScreen]        = useState('start');
  const [friends,       setFriends]       = useState([]);
  const [selected,      setSelected]      = useState(new Set());
  const [hours,         setHours]         = useState(1);
  const [times,         setTimes]         = useState([]);
  const [notifs,        setNotifs]        = useState([]);
  const [myId,          setMyId]          = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
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
        setNotifs((await r.json()).events ?? []);
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

  // Poll so invited users see incoming invites without refreshing.
  useEffect(() => {
    if (!googleId) return;
    const t = setInterval(loadNotifs, 15_000);
    return () => clearInterval(t);
  }, [googleId, loadNotifs]);

  // Fetch friends when entering friend-select screen
  useEffect(() => {
    if (screen !== 'friends' || !googleId) return;
    fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json()).then(d => setFriends(d.friends ?? [])).catch(() => {});
  }, [screen, googleId]);

  // If a group "Schedule" action pre-populated members, skip to timing screen.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sw-group-preset');
      if (!raw) return;
      sessionStorage.removeItem('sw-group-preset');
      const ids = JSON.parse(raw);
      if (Array.isArray(ids) && ids.length > 0) {
        setSelected(new Set(ids));
        setScreen('timing');
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add id to the module singleton and re-render this instance.
  const dismiss = useCallback(id => {
    if (_dismissed.has(id)) return;
    _dismissed.add(id);
    try { localStorage.setItem('sw-dismissed', JSON.stringify([..._dismissed])); } catch {}
    setDismissVersion(v => v + 1);
  }, []);

  // Auto-clear all notification types after 60 s. _scheduled is module-level so
  // timers are never duplicated even across re-mounts.
  useEffect(() => {
    if (!myId) return;
    notifs.forEach(e => {
      if (_dismissed.has(e.id)) return;
      const isInvite    = !e.isCreator && !(e.declines ?? []).includes(myId);
      const isDecline   = e.isCreator  && (e.declines ?? []).length > 0;
      const isConfirmed = e.isCreator  && e.status === 'accepted';
      if (!isInvite && !isDecline && !isConfirmed) return;
      if (_scheduled.has(e.id)) return;
      _scheduled.add(e.id);
      setTimeout(() => dismiss(e.id), 60_000);
    });
  }, [notifs, myId, dismiss]);

  const reset = () => {
    setScreen('start');
    setSelected(new Set());
    setTimes([]);
    setScheduleError(null);
    loadNotifs();
  };

  const toggle = id =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const search = async (durationHours, weekOffset) => {
    setHours(durationHours);
    setLoading(true);
    setScreen('searching');
    try {
      const r = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'find-times', googleId, invitedUserIds: [...selected], durationHours, weekOffset }),
      });
      if (!r.ok) throw new Error();
      const { proposedTimes } = await r.json();
      if (!proposedTimes?.length) {
        setScreen(weekOffset === 0 ? 'no-time' : 'no-time-final');
      } else {
        setTimes(proposedTimes);
        setScreen('proposed');
      }
    } catch { setScreen('start'); }
    finally { setLoading(false); }
  };

  const choose = async (time, dur = hours) => {
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

  const respond = async (eventId, action) => {
    await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'respond', googleId, eventId, action }),
    });
    loadNotifs();
  };

  const renderScreen = () => {
    switch (screen) {
      case 'start':      return <StartScreen onSelect={setScreen} />;
      case 'stub':       return <StubScreen onReset={reset} />;
      case 'friends':    return <FriendSelectScreen friends={friends} selected={selected} onToggle={toggle} onNext={() => setScreen('timing')} />;
      case 'timing':     return <TimingScreen onPick={() => setScreen('pick-time')} onFind={() => setScreen('find-time')} />;
      case 'pick-time':  return <PickTimeScreen onSchedule={choose} loading={loading} />;
      case 'find-time':  return <FindTimeScreen onSearch={search} loading={loading} />;
      case 'searching':  return <SearchingScreen />;
      case 'proposed':   return <ProposedScreen times={times} onSelect={choose} />;
      case 'no-time':    return <NoTimeScreen onExtend={() => search(hours, 1)} onReset={reset} />;
      case 'no-time-final': return (
        <div className="sw-screen sw-center">
          <p className="sw-body-text">No available time found in the next 2 weeks.</p>
          <button className="sw-btn-ghost" onClick={reset}>Start Over</button>
        </div>
      );
      case 'pending':    return <PendingScreen onReset={reset} />;
      default: return null;
    }
  };

  const canBack  = screen in BACK;
  const myInvites = notifs.filter(e => !e.isCreator && !(e.declines ?? []).includes(myId) && !_dismissed.has(e.id));
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

        {/* Accepted events the user created */}
        {myCreated.map(e => (
          <div key={e.id} className="sw-notif-wrap">
            <div className="sw-created-done">
              <Clock size={12} />
              <span>{formatTime(e.event_time)} · {formatDuration(e.duration_hours)} — all confirmed!</span>
            </div>
            <button className="sw-notif-x" onClick={() => dismiss(e.id)} title="Dismiss">✕</button>
          </div>
        ))}

        {/* Decline notifications — shown to the event creator */}
        {notifs
          .filter(e => e.isCreator && (e.declines ?? []).length > 0 && !_dismissed.has(e.id))
          .flatMap(e =>
            (e.declinedUsers ?? []).map(u => (
              <div key={`decline-${e.id}-${u.id}`} className="sw-decline-notif">
                <span className="sw-decline-name">{u.display_name || u.name || 'Someone'}</span>
                {' declined · '}
                <span className="sw-decline-time">{formatTime(e.event_time)} ({formatDuration(e.duration_hours)})</span>
                <button className="sw-notif-x" onClick={() => dismiss(e.id)} title="Dismiss">✕</button>
              </div>
            ))
          )
        }

        {/* Invites received */}
        {myInvites.length > 0 && (
          <div className="sw-invites">
            <p className="sw-invites-label">
              {myInvites.length === 1 ? '1 invite' : `${myInvites.length} invites`}
            </p>
            {myInvites.map(e => (
              <div key={e.id} className="sw-notif-wrap">
                <NotifCard event={e} myId={myId} onRespond={respond} />
                <button className="sw-notif-x" onClick={() => dismiss(e.id)} title="Dismiss">✕</button>
              </div>
            ))}
          </div>
        )}

        {renderScreen()}
      </div>
    </div>
  );
}
