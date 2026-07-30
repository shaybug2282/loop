import React, { useState, useEffect } from 'react';
import { ChevronLeft, ArrowRight, Sparkles, X, Check, CalendarCheck } from 'lucide-react';
import { useChatHub } from '../contexts/ChatHubContext';
import './NewEventPopup.css';

// Previous step for the header back button.
const BACK = { timing: 'friends', pick: 'timing' };

// NewEventPopup — modal flow for scheduling a brand-new event: select
// friends, then either pick a date/time/duration manually or hand off to the
// chat hub's Plans section, pre-seeded with the selected friends. Manual
// creation posts op:'create-event'; the assistant books through its own plan
// cards. onCreated fires after the manual path books, so the parent can
// refetch — the hub outlives this popup, so its bookings don't report back
// here (the dashboard's own refresh picks them up).
//
// The assistant used to be a step *inside* this modal. It now closes the
// popup and opens the hub, so there is one scheduling chat in the app rather
// than a copy embedded in every flow that wants one.
export default function NewEventPopup({ onClose, onCreated, initialDate = null }) {
  const [step,      setStep]      = useState('friends'); // friends | timing | pick | done
  const { startPlan } = useChatHub();
  const [friends,   setFriends]   = useState(null);      // null until fetched
  const [selected,  setSelected]  = useState(new Set());
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  // Manual pick — initialDate (from a calendar empty-slot click) prefills it.
  const [date,     setDate]     = useState(initialDate ?? '');
  const [time,     setTime]     = useState('10:00');
  const [duration, setDuration] = useState(1);
  const [title,    setTitle]    = useState('');

  const googleId = localStorage.getItem('googleUserId');
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!googleId) { setFriends([]); return; }
    fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json()).then(d => setFriends(d.friends ?? [])).catch(() => setFriends([]));
  }, [googleId]);

  const toggle = id =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // create — POST the pending event; every selected friend is invited.
  const create = async (eventTime, durationHours) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/schedule', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          op: 'create-event',
          invitedUserIds: [...selected], eventTime, durationHours,
          // Untitled events fall back to "Hangout" on every surface.
          ...(title.trim() ? { title: title.trim() } : {}),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${r.status})`);
      }
      onCreated?.();
      setStep('done');
    } catch (err) {
      setError(err.message || 'Could not create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // schedulePicked — validate the manual date/time is in the future, then create.
  const schedulePicked = () => {
    if (!date || !time) return;
    const when = new Date(`${date}T${time}`);
    if (when <= new Date()) { setError('Please choose a time in the future.'); return; }
    setError(null);
    create(when.toISOString(), Number(duration) || 1);
  };

  // seedMessage — the first chat turn for the assistant hand-off: names the
  // selected friends (and the clicked date, if any) so the roster resolves
  // them and availability checks start immediately.
  const seedMessage = () => {
    const names = (friends ?? [])
      .filter(f => selected.has(f.id))
      .map(f => f.display_name || f.name)
      .filter(Boolean);
    const datePart = date ? ` on ${date}` : '';
    return `I'd like to schedule something with ${names.join(', ')}${datePart}. Can you find times that work for all of us?`;
  };

  const body = () => {
    switch (step) {
      case 'friends': return (
        <>
          <p className="ne-sublabel">Who's it with?</p>
          {friends === null ? (
            <p className="ne-hint">Loading friends…</p>
          ) : friends.length === 0 ? (
            <p className="ne-hint">No friends yet — add some from the Friends page first.</p>
          ) : (
            <ul className="ne-friend-list">
              {friends.map(f => {
                const on = selected.has(f.id);
                return (
                  <li key={f.id} className={`ne-friend${on ? ' on' : ''}`} onClick={() => toggle(f.id)}>
                    {f.picture_url
                      ? <img src={f.picture_url} alt="" className="ne-av" />
                      : <div className="ne-av ne-av-ph">{(f.display_name || f.name)?.[0]}</div>}
                    <span className="ne-fname">{f.display_name || f.name}</span>
                    {on && <Check size={14} className="ne-tick" />}
                  </li>
                );
              })}
            </ul>
          )}
          {selected.size > 0 && (
            <button className="ne-next" onClick={() => setStep('timing')} title="Next">
              <ArrowRight size={18} />
            </button>
          )}
        </>
      );

      case 'timing': return (
        <>
          <p className="ne-sublabel">How would you like to choose a time?</p>
          <div className="ne-choices">
            <button className="ne-choice" onClick={() => setStep('pick')}>Pick a time</button>
            <button className="ne-choice primary" onClick={() => { onClose(); startPlan(seedMessage()); }}>
              <Sparkles size={13} /> Find a time
            </button>
          </div>
        </>
      );

      case 'pick': return (
        <>
          <p className="ne-sublabel">Choose a date and time:</p>
          <div className="ne-field">
            <label className="ne-label">Event name</label>
            <input type="text" className="ne-input" placeholder="e.g. Dinner (optional)"
              maxLength={80} value={title}
              onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="ne-field">
            <label className="ne-label">Date</label>
            <input type="date" className="ne-input" min={today} value={date}
              onChange={e => { setDate(e.target.value); setError(null); }} />
          </div>
          <div className="ne-field">
            <label className="ne-label">Time</label>
            <input type="time" className="ne-input" value={time}
              onChange={e => { setTime(e.target.value); setError(null); }} />
          </div>
          <div className="ne-field">
            <label className="ne-label">Duration (hours)</label>
            <input type="number" className="ne-input ne-input-dur" min="0.5" step="0.5" value={duration}
              onChange={e => setDuration(e.target.value)} />
          </div>
          <button className="ne-primary" disabled={!date || !time || loading} onClick={schedulePicked}>
            {loading ? 'Scheduling…' : 'Schedule'}
          </button>
        </>
      );

      case 'done': return (
        <div className="ne-done">
          <div className="ne-done-icon"><CalendarCheck size={30} strokeWidth={1.6} /></div>
          <p className="ne-done-head">Event pending.</p>
          <p className="ne-hint">Invites are out — it lands in "In the Works" until everyone accepts.</p>
          <button className="ne-primary" onClick={onClose}>Done</button>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="ne-backdrop" onClick={onClose}>
      <div className="ne-modal" onClick={e => e.stopPropagation()}>
        <div className="ne-header">
          {step in BACK && (
            <button className="ne-back" onClick={() => { setStep(BACK[step]); setError(null); }} title="Back">
              <ChevronLeft size={16} />
            </button>
          )}
          <span className="ne-title">New event</span>
          <button className="ne-close" onClick={onClose} title="Close"><X size={14} /></button>
        </div>
        <div className="ne-body">
          {error && <p className="ne-error">{error}</p>}
          {body()}
        </div>
      </div>
    </div>
  );
}
