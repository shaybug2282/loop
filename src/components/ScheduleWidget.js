import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, ChevronLeft, Calendar, Clock } from 'lucide-react';
import './ScheduleWidget.css';

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
  const today = new Date().toISOString().split('T')[0];
  const ready = date && time;

  const go = () => {
    if (!ready) return;
    onSchedule(new Date(`${date}T${time}`).toISOString(), 1);
  };

  return (
    <div className="sw-screen">
      <p className="sw-sublabel">Choose a date and time:</p>
      <div className="sw-field">
        <label className="sw-label">Date</label>
        <input type="date" className="sw-input" min={today} value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="sw-field">
        <label className="sw-label">Time</label>
        <input type="time" className="sw-input" value={time} onChange={e => setTime(e.target.value)} />
      </div>
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
  const [screen,   setScreen]   = useState('start');
  const [friends,  setFriends]  = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [hours,    setHours]    = useState(1);
  const [times,    setTimes]    = useState([]);
  const [notifs,   setNotifs]   = useState([]);
  const [myId,     setMyId]     = useState(null);
  const [loading,  setLoading]  = useState(false);

  const googleId = localStorage.getItem('googleUserId');

  const loadNotifs = useCallback(async () => {
    if (!googleId) return;
    try {
      const r = await fetch(`/api/schedule?op=pending-events&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setNotifs((await r.json()).events ?? []);
    } catch {}
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

  // Fetch friends when entering friend-select screen
  useEffect(() => {
    if (screen !== 'friends' || !googleId) return;
    fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json()).then(d => setFriends(d.friends ?? [])).catch(() => {});
  }, [screen, googleId]);

  const reset = () => {
    setScreen('start');
    setSelected(new Set());
    setTimes([]);
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
      if (!r.ok) throw new Error();
      setScreen('pending');
      loadNotifs();
    } catch { setScreen('start'); }
    finally { setLoading(false); }
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
  const myInvites = notifs.filter(e => !e.isCreator && e.status !== 'declined');
  const myCreated = notifs.filter(e => e.isCreator && e.status === 'accepted');

  return (
    <div className="sw-widget">
      <div className="sw-header">
        {canBack && (
          <button className="sw-back" onClick={() => setScreen(BACK[screen])}>
            <ChevronLeft size={16} />
          </button>
        )}
        <h2 className="sw-title">Schedule!</h2>
      </div>

      <div className="sw-body">
        {/* Accepted events the user created */}
        {myCreated.map(e => (
          <div key={e.id} className="sw-created-done">
            <Clock size={12} />
            <span>{formatTime(e.event_time)} — all accepted! Check Google Calendar.</span>
          </div>
        ))}

        {/* Invites received */}
        {myInvites.length > 0 && (
          <div className="sw-invites">
            <p className="sw-invites-label">
              {myInvites.length === 1 ? '1 invite' : `${myInvites.length} invites`}
            </p>
            {myInvites.map(e => (
              <NotifCard key={e.id} event={e} myId={myId} onRespond={respond} />
            ))}
          </div>
        )}

        {renderScreen()}
      </div>
    </div>
  );
}
