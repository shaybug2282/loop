import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Loader, Calendar, Check, X } from 'lucide-react';
import './AISummary.css';

// AI scheduling chatbox — multi-turn conversational interface backed by Sonnet.
//
// Each turn sends the full conversation history so the model maintains context.
// When Sonnet returns plans, they render as clickable cards. Clicking a card
// calls /api/schedule op:create-event directly (same path as ScheduleWidget),
// sends invites to all participantIds, and adds the event to Google Calendar.
// The conversation continues freely after a card is booked.

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function durationHours(start, end) {
  if (!start || !end) return 1;
  return Math.max(0.5, +((new Date(end) - new Date(start)) / 3.6e6).toFixed(1));
}

// PlanCard — a single clickable time suggestion within the chat.
// booking: null | 'loading' | 'booked' | 'error'
const PlanCard = ({ plan, booking, onBook }) => {
  const done = booking === 'booked';
  const busy = booking === 'loading';
  const err  = booking === 'error';

  return (
    <button
      className={`ais-plan-card${done ? ' booked' : ''}${err ? ' errored' : ''}`}
      onClick={() => !done && !busy && onBook()}
      disabled={done || busy}
    >
      <span className="ais-plan-icon">
        {busy && <Loader size={13} className="ais-spinner" />}
        {done && <Check size={13} />}
        {!busy && !done && <Calendar size={13} />}
      </span>
      <span className="ais-plan-body">
        <span className="ais-plan-time">{fmt(plan.start)}</span>
        {plan.location && <span className="ais-plan-loc">{plan.location}</span>}
      </span>
      {done && <span className="ais-plan-status">Invited!</span>}
      {err  && <span className="ais-plan-status err">Failed</span>}
    </button>
  );
};

const AISummary = () => {
  // items — display list: { id, role:'user'|'ai'|'error', text, plans?, bookings? }
  // bookings is an array parallel to plans: null|'loading'|'booked'|'error'
  const [items,   setItems]   = useState([]);
  // history — what gets sent to the API each turn: [{role:'user'|'assistant', content}]
  const [history, setHistory] = useState([]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const googleId  = localStorage.getItem('googleUserId');

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [items]);

  // Invisibly refresh Haiku profile on mount so chat context is always fresh.
  useEffect(() => {
    if (!googleId) return;
    fetch('/api/ai', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'build-profile', googleId }),
    }).catch(() => {});
  }, [googleId]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !googleId) return;

    const userMsg = { role: 'user', content: text };
    const newHistory = [...history, userMsg];

    setItems(prev => [...prev, { id: Date.now(), role: 'user', text }]);
    setHistory(newHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'chat', googleId, messages: newHistory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI error');

      const { reply, plans = [] } = data;
      // Store the full JSON as the assistant history entry so Sonnet sees its
      // own prior responses as JSON and consistently continues in that format.
      const assistantMsg = { role: 'assistant', content: JSON.stringify({ reply, plans }) };

      setHistory(prev => [...prev, assistantMsg]);
      setItems(prev => [...prev, {
        id:       Date.now() + 1,
        role:     'ai',
        text:     reply,
        plans,
        bookings: plans.map(() => null),
      }]);
    } catch (err) {
      setItems(prev => [...prev, { id: Date.now() + 1, role: 'error', text: err.message }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, googleId, history]);

  // bookPlan — create the event via /api/schedule when a plan card is clicked.
  // Updates the card's booking state in place; adds a follow-up AI bubble on success.
  const bookPlan = useCallback(async (itemId, planIdx, plan) => {
    // Mark this card as loading.
    setItems(prev => prev.map(it =>
      it.id !== itemId ? it : {
        ...it,
        bookings: it.bookings.map((b, i) => i === planIdx ? 'loading' : b),
      }
    ));

    try {
      const r = await fetch('/api/schedule', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          op:              'create-event',
          creatorGoogleId: googleId,
          invitedUserIds:  plan.participantIds ?? [],
          eventTime:       plan.start,
          durationHours:   durationHours(plan.start, plan.end),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Error ${r.status}`);
      }

      // Mark card as booked.
      setItems(prev => prev.map(it =>
        it.id !== itemId ? it : {
          ...it,
          bookings: it.bookings.map((b, i) => i === planIdx ? 'booked' : b),
        }
      ));

      // Add a brief confirmation into the chat thread.
      const confirmText = `${fmt(plan.start)} is set${plan.participantIds?.length ? ' — invites sent!' : '!'}`;
      const confirmMsg  = { role: 'assistant', content: JSON.stringify({ reply: confirmText, plans: [] }) };
      setHistory(prev => [...prev, confirmMsg]);
      setItems(prev => [...prev, { id: Date.now(), role: 'ai', text: confirmText }]);
    } catch (err) {
      setItems(prev => prev.map(it =>
        it.id !== itemId ? it : {
          ...it,
          bookings: it.bookings.map((b, i) => i === planIdx ? 'error' : b),
        }
      ));
    }
  }, [googleId]);

  return (
    <div className="ais-wrap">
      <div className="ais-header">
        <Sparkles size={16} />
        <span className="ais-title">Scheduling Assistant</span>
      </div>

      <div className="ais-body">
        {items.length === 0 && (
          <p className="ais-hint">Tell me what to schedule — I'll find times that fit.</p>
        )}

        {items.map(item => {
          if (item.role === 'user') {
            return (
              <div key={item.id} className="ais-row user">
                <div className="ais-bubble user">{item.text}</div>
              </div>
            );
          }
          if (item.role === 'error') {
            return (
              <div key={item.id} className="ais-row ai">
                <div className="ais-bubble ai error">
                  <X size={13} style={{ flexShrink: 0 }} />
                  {item.text}
                </div>
              </div>
            );
          }
          // role === 'ai'
          return (
            <div key={item.id} className="ais-row ai">
              <div className="ais-bubble ai">
                {item.text}
                {item.plans?.length > 0 && (
                  <div className="ais-plans">
                    {item.plans.map((p, i) => (
                      <PlanCard
                        key={i}
                        plan={p}
                        booking={item.bookings?.[i] ?? null}
                        onBook={() => bookPlan(item.id, i, p)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="ais-row ai">
            <div className="ais-bubble ai typing">
              <Loader size={14} className="ais-spinner" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="ais-input-row">
        <input
          ref={inputRef}
          className="ais-input"
          type="text"
          placeholder="e.g. Dinner with Sam next week…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={loading}
        />
        <button
          className="ais-send"
          onClick={send}
          disabled={!input.trim() || loading}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
};

export default AISummary;
