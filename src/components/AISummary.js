import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader, CalendarPlus } from 'lucide-react';
import './AISummary.css';

// Scheduling assistant — front end for the two-model apparatus in /api/ai.
//   • On mount it invisibly refreshes the user's Haiku profile (op:'build-profile')
//     so the scheduler always has fresh context. No UI for this step by design.
//   • A natural-language request is sent to the Sonnet scheduler (op:'schedule'),
//     which returns candidate event plans rendered as cards.
//
// Participant selection (scheduling WITH other people) is future UI work; for now
// the request is profiled against the signed-in user only. The API already accepts
// `participantGoogleIds`, so wiring a picker later needs no backend change.
const AISummary = () => {
  const [items,   setItems]   = useState([]);   // { id, role:'user'|'plans'|'error', text?, plans? }
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const googleId = localStorage.getItem('googleUserId');

  // Auto-scroll on new content.
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [items]);

  // Invisible profile refresh — fire-and-forget on mount so Haiku context is ready
  // before the user ever asks to schedule. Failures are silent (assistant degrades
  // gracefully to scheduling without a profile).
  useEffect(() => {
    if (!googleId) return;
    fetch('/api/ai', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'build-profile', googleId }),
    }).catch(() => {});
  }, [googleId]);

  // requestSchedule — send the natural-language ask to the Sonnet scheduler and
  // render the returned plans. Output: appends a 'plans' (or 'error') item.
  const requestSchedule = async () => {
    const text = input.trim();
    if (!text || loading || !googleId) return;

    setItems(prev => [...prev, { id: Date.now(), role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'schedule', googleId, participantGoogleIds: [], request: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scheduling failed');
      setItems(prev => [...prev, { id: Date.now() + 1, role: 'plans', plans: data.plans ?? [] }]);
    } catch (err) {
      setItems(prev => [...prev, { id: Date.now() + 1, role: 'error', text: `Sorry, something went wrong: ${err.message}` }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // fmt — compact ISO → human time for plan cards.
  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="ai-summary-component">
      <div className="component-header">
        <Sparkles size={24} />
        <h2>Scheduling Assistant</h2>
      </div>

      <div className="chat-body">
        {items.length === 0 && (
          <p className="chat-hint">Tell me what to schedule — I'll find times that fit.</p>
        )}

        {items.map(item => {
          if (item.role === 'user') {
            return (
              <div key={item.id} className="chat-bubble-row user">
                <div className="chat-bubble">{item.text}</div>
              </div>
            );
          }
          if (item.role === 'error') {
            return (
              <div key={item.id} className="chat-bubble-row ai">
                <div className="chat-bubble error">{item.text}</div>
              </div>
            );
          }
          // role === 'plans'
          return (
            <div key={item.id} className="chat-bubble-row ai">
              <div className="chat-bubble">
                {item.plans.length === 0
                  ? "I couldn't find a good time for that yet."
                  : item.plans.map((p, i) => (
                      <div key={i} className="sa-plan">
                        <div className="sa-plan-head">
                          <CalendarPlus size={14} />
                          <strong>{p.title || 'Event'}</strong>
                        </div>
                        <div className="sa-plan-time">{fmt(p.start)}{p.end ? ` – ${fmt(p.end)}` : ''}</div>
                        {p.rationale && <div className="sa-plan-why">{p.rationale}</div>}
                        {Array.isArray(p.warnings) && p.warnings.length > 0 && (
                          <div className="sa-plan-warn">⚠ {p.warnings.join('; ')}</div>
                        )}
                      </div>
                    ))}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="chat-bubble-row ai">
            <div className="chat-bubble typing"><Loader size={14} className="spinner" /></div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          placeholder="e.g. Coffee with Sam sometime next week…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && requestSchedule()}
          disabled={loading}
        />
        <button className="chat-send" onClick={requestSchedule} disabled={!input.trim() || loading}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

export default AISummary;
