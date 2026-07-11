import React, { useState, useEffect } from 'react';
import { ChevronLeft, ArrowRight, Calendar, Sparkles, Send } from 'lucide-react';
import { formatEventTime as formatTime } from '../utils/format';
import './NewEventPopup.css';

// Previous step for the header back button.
const BACK = { timing: 'friends', pick: 'timing', ai: 'timing', proposed: 'ai' };

// NewEventPopup — modal flow for scheduling a brand-new event (the old
// Schedule! widget's creation flow, popup-sized): select friends, then either
// pick a date/time/duration manually or describe the event and let the AI
// propose times. Creating posts op:'create-event', which sends every selected
// friend a pending invite; onCreated fires afterward so the parent (the
// In the Works widget) can refetch and show the new tile.
export default function NewEventPopup({ onClose, onCreated }) {
  const [step,      setStep]      = useState('friends'); // friends | timing | pick | ai | proposed | done
  const [friends,   setFriends]   = useState(null);      // null until fetched
  const [selected,  setSelected]  = useState(new Set());
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  // Manual pick
  const [date,     setDate]     = useState('');
  const [time,     setTime]     = useState('10:00');
  const [duration, setDuration] = useState(1);
  // AI find-a-time
  const [aiRequest, setAiRequest] = useState('');
  const [aiPlans,   setAiPlans]   = useState([]);

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
          op: 'create-event', creatorGoogleId: googleId,
          invitedUserIds: [...selected], eventTime, durationHours,
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

  // askAI — natural-language request → Sonnet proposes times for everyone.
  const askAI = async () => {
    if (!aiRequest.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'schedule', googleId, participantIds: [...selected], request: aiRequest }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'AI error');
      if (data.clarification_needed) {
        setError(data.clarification_needed);
      } else if (!data.plans?.length) {
        setError('No available time found — try a different request.');
      } else {
        setAiPlans(data.plans);
        setStep('proposed');
      }
    } catch (err) {
      setError(err.message || 'Could not find times. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // choosePlan — book an AI-proposed slot; duration derived from the plan.
  const choosePlan = (plan) => {
    const dur = plan.end && plan.start
      ? Math.max(0.5, +((new Date(plan.end) - new Date(plan.start)) / 3.6e6).toFixed(1))
      : 1;
    create(plan.start, dur);
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
                    {on && <span className="ne-tick">✓</span>}
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
            <button className="ne-choice primary" onClick={() => setStep('ai')}>
              <Sparkles size={13} /> Find a time
            </button>
          </div>
        </>
      );

      case 'pick': return (
        <>
          <p className="ne-sublabel">Choose a date and time:</p>
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

      case 'ai': return (
        <>
          <p className="ne-sublabel">Describe the event and I'll suggest times:</p>
          <div className="ne-ai-row">
            <input
              className="ne-input ne-ai-input"
              type="text"
              placeholder="e.g. Dinner next week, about 2 hours…"
              value={aiRequest}
              autoFocus
              onChange={e => setAiRequest(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && aiRequest.trim() && !loading) askAI(); }}
              disabled={loading}
            />
            <button className="ne-ai-send" onClick={askAI} disabled={!aiRequest.trim() || loading} title="Get suggestions">
              <Send size={14} />
            </button>
          </div>
          {loading && <p className="ne-hint">Finding the best times…</p>}
        </>
      );

      case 'proposed': return (
        <>
          <p className="ne-sublabel">Choose a time that works:</p>
          <div className="ne-plan-list">
            {aiPlans.map((p, i) => (
              <button key={i} className="ne-plan" disabled={loading} onClick={() => choosePlan(p)}>
                <Calendar size={14} style={{ flexShrink: 0 }} />
                <span className="ne-plan-body">
                  <span>{formatTime(p.start)}</span>
                  {p.location && <span className="ne-plan-loc">{p.location}</span>}
                </span>
              </button>
            ))}
          </div>
          {loading && <p className="ne-hint">Scheduling…</p>}
        </>
      );

      case 'done': return (
        <div className="ne-done">
          <div className="ne-done-icon">🗓</div>
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
          <button className="ne-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="ne-body">
          {error && <p className="ne-error">{error}</p>}
          {body()}
        </div>
      </div>
    </div>
  );
}
