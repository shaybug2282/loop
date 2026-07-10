import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Loader, Calendar, Check, X, Plus, ChevronLeft, MessageSquare } from 'lucide-react';
import './AISummary.css';

// Scheduling Assistant — persistent conversational scheduling backed by Sonnet.
//
// Two views:
//   list — every open scheduling conversation (one per pending/draft event),
//          loaded from the server so chats survive reloads and devices.
//   chat — a resumable thread; the server keeps the history and gives the
//          model context each turn. Plan cards are clickable: booking creates
//          the pending event (title + location included) and links it to the
//          conversation. The server deletes the conversation once that event
//          is confirmed or declined, so the list is always "pending only".

// fmt — short human timestamp for a plan's start time.
// out: e.g. "Sat, Jul 11, 6:30 PM".
function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ago — compact relative time for the conversation list. out: "now"|"5m"|"3h"|"Jul 2".
function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 60_000) return 'now';
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// durationHours — plan start/end → hours (min 0.5, default 1).
function durationHours(start, end) {
  if (!start || !end) return 1;
  return Math.max(0.5, +((new Date(end) - new Date(start)) / 3.6e6).toFixed(1));
}

// itemsFromMessages — stored conversation → display items. Assistant entries
// are JSON contract strings ({ reply, plans, booked? }); fall back to raw text.
// A booked marker re-marks the matching plan card so reopened chats show
// which suggestion was taken.
function itemsFromMessages(messages) {
  const items = (messages ?? []).map((m, i) => {
    if (m.role === 'user') return { id: `s${i}`, role: 'user', text: m.content };
    let parsed = null;
    try { parsed = JSON.parse(m.content); } catch {}
    const plans = Array.isArray(parsed?.plans) ? parsed.plans : [];
    return {
      id:       `s${i}`,
      role:     'ai',
      text:     typeof parsed?.reply === 'string' ? parsed.reply : m.content,
      plans,
      bookings: plans.map(() => null),
      booked:   parsed?.booked ?? null,
    };
  });

  const bookedStarts = new Set(items.map(it => it.booked?.start).filter(Boolean));
  if (bookedStarts.size) {
    for (const it of items) {
      if (!it.plans?.length) continue;
      it.bookings = it.plans.map(p => bookedStarts.has(p.start) ? 'booked' : null);
    }
  }
  return items;
}

// PlanCard — a single clickable time/location suggestion within the chat.
// booking: null | 'loading' | 'booked' | 'error'; locked = event already booked.
const PlanCard = ({ plan, booking, locked, onBook }) => {
  const done = booking === 'booked';
  const busy = booking === 'loading';
  const err  = booking === 'error';

  return (
    <button
      className={`ais-plan-card${done ? ' booked' : ''}${err ? ' errored' : ''}`}
      onClick={() => !done && !busy && !locked && onBook()}
      disabled={done || busy || locked}
    >
      <span className="ais-plan-icon">
        {busy && <Loader size={13} className="ais-spinner" />}
        {done && <Check size={13} />}
        {!busy && !done && <Calendar size={13} />}
      </span>
      <span className="ais-plan-body">
        {plan.title && <span className="ais-plan-title">{plan.title}</span>}
        <span className="ais-plan-time">{fmt(plan.start)}</span>
        {plan.location && <span className="ais-plan-loc">{plan.location}</span>}
      </span>
      {done && <span className="ais-plan-status">Invited!</span>}
      {err  && <span className="ais-plan-status err">Failed</span>}
    </button>
  );
};

const AISummary = () => {
  const [view,    setView]    = useState('list');   // 'list' | 'chat'
  const [convos,  setConvos]  = useState([]);
  // active — the open conversation: { id, title, pendingEventId }; id null = new unsaved chat.
  const [active,  setActive]  = useState(null);
  // items — display list: { id, role:'user'|'ai'|'error', text, plans?, bookings?, booked? }
  const [items,   setItems]   = useState([]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  // Group-seeded first message: member names pre-loaded into the composer plus
  // an event-name field, planted when the user hits "Schedule" on a group card
  // (see GroupsWidget.handleSchedule). Cleared once sent or the chat changes.
  const [seedMembers, setSeedMembers] = useState(null);
  const [eventName,   setEventName]   = useState('');

  const bodyRef   = useRef(null);
  const inputRef  = useRef(null);
  const googleId  = localStorage.getItem('googleUserId');

  // Keep the chat pinned to the latest message by scrolling the message list
  // itself — never scrollIntoView, which would also scroll the whole page down.
  useEffect(() => {
    if (view === 'chat' && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [items, view]);

  // Refresh the Haiku profile on mount (server skips the call if it's <24h old).
  useEffect(() => {
    if (!googleId) return;
    fetch('/api/ai', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'build-profile', googleId }),
    }).catch(() => {});
  }, [googleId]);

  // consumeSeed — if a group "Schedule" planted a seed, open a fresh chat with
  // the member list pre-loaded into the composer and the event-name field
  // revealed. Reads the seed once, then clears it.
  const consumeSeed = useCallback(() => {
    let raw = null;
    try { raw = sessionStorage.getItem('ais-group-seed'); } catch {}
    if (!raw) return;
    try { sessionStorage.removeItem('ais-group-seed'); } catch {}
    let members = [];
    try { members = (JSON.parse(raw)?.members ?? []).filter(Boolean); } catch { return; }
    if (!members.length) return;
    setActive(null);
    setItems([]);
    setEventName('');
    setSeedMembers(members);
    setInput(`with ${members.join(', ')}`);
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Pick up a seed on mount (arriving via cross-page navigation) and on the
  // same-page custom event (assistant already mounted on the dashboard).
  useEffect(() => {
    consumeSeed();
    window.addEventListener('ais-seed', consumeSeed);
    return () => window.removeEventListener('ais-seed', consumeSeed);
  }, [consumeSeed]);

  const loadConvos = useCallback(async () => {
    if (!googleId) return;
    try {
      const r = await fetch(`/api/ai?op=conversations&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setConvos((await r.json()).conversations ?? []);
    } catch {}
  }, [googleId]);

  // Load on mount and poll while the list is visible — confirmed/declined
  // events delete their conversation server-side, so the list self-prunes.
  useEffect(() => { loadConvos(); }, [loadConvos]);
  useEffect(() => {
    if (view !== 'list' || !googleId) return;
    const t = setInterval(loadConvos, 30_000);
    return () => clearInterval(t);
  }, [view, googleId, loadConvos]);

  // openConvo — fetch full history and enter the chat view.
  const openConvo = useCallback(async (c) => {
    setSeedMembers(null);
    setEventName('');
    setInput('');
    setActive({ id: c.id, title: c.title, pendingEventId: c.pending_event_id ?? null });
    setItems([]);
    setView('chat');
    try {
      const r = await fetch(`/api/ai?op=conversation&googleId=${encodeURIComponent(googleId)}&id=${encodeURIComponent(c.id)}`);
      if (!r.ok) throw new Error('Could not load conversation');
      const { conversation } = await r.json();
      setItems(itemsFromMessages(conversation.messages));
      setActive({ id: conversation.id, title: conversation.title, pendingEventId: conversation.pending_event_id ?? null });
    } catch (err) {
      setItems([{ id: 'err', role: 'error', text: err.message }]);
    }
  }, [googleId]);

  const newChat = () => {
    setActive(null);
    setItems([]);
    setSeedMembers(null);
    setEventName('');
    setInput('');
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const backToList = () => {
    setView('list');
    setActive(null);
    setItems([]);
    setInput('');
    setSeedMembers(null);
    setEventName('');
    loadConvos();
  };

  const deleteConvo = useCallback(async (e, id) => {
    e.stopPropagation();
    setConvos(prev => prev.filter(c => c.id !== id));
    try {
      await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'delete-conversation', googleId, conversationId: id }),
      });
    } catch {}
  }, [googleId]);

  const send = useCallback(async () => {
    const base = input.trim();
    if (!base || loading || !googleId) return;

    // A group-seeded first message folds the event name + member list into one
    // request; afterwards the chat is an ordinary free-text thread.
    const name = eventName.trim();
    const text = seedMembers
      ? `${name ? `Schedule "${name}"` : 'Schedule an event'} ${base}. Please find times that work for everyone.`
      : base;
    if (seedMembers) { setSeedMembers(null); setEventName(''); }

    setItems(prev => [...prev, { id: Date.now(), role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'chat', googleId, conversationId: active?.id ?? undefined, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI error');

      const { conversationId, reply, plans = [] } = data;
      setActive(prev => prev?.id
        ? prev
        : { id: conversationId, title: text.slice(0, 60), pendingEventId: null });
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
  }, [input, loading, googleId, active, seedMembers, eventName]);

  // bookPlan — create the pending event, then link it to this conversation so
  // the server can retire the chat once the event is confirmed or declined.
  const bookPlan = useCallback(async (itemId, planIdx, plan) => {
    const setBooking = (state) => setItems(prev => prev.map(it =>
      it.id !== itemId ? it : {
        ...it,
        bookings: it.bookings.map((b, i) => i === planIdx ? state : b),
      }
    ));
    setBooking('loading');

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
          title:           plan.title,
          location:        plan.location,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Error ${r.status}`);

      setBooking('booked');

      // Link the conversation to the event + persist the confirmation bubble.
      let confirmText = `${fmt(plan.start)} is booked${plan.participantIds?.length ? ' — invites sent!' : '!'}`;
      if (active?.id && body.id) {
        try {
          const lr = await fetch('/api/ai', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ op: 'record-booking', googleId, conversationId: active.id, eventId: body.id, plan }),
          });
          const ld = await lr.json().catch(() => ({}));
          if (lr.ok && ld.reply) confirmText = ld.reply;
        } catch {}
      }

      setActive(prev => prev ? { ...prev, pendingEventId: body.id ?? true } : prev);
      setItems(prev => [...prev, { id: Date.now(), role: 'ai', text: confirmText }]);
      loadConvos();
    } catch {
      setBooking('error');
    }
  }, [googleId, active, loadConvos]);

  const locked = Boolean(active?.pendingEventId);

  // ── List view ───────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="ais-wrap">
        <div className="ais-header">
          <Sparkles size={16} />
          <span className="ais-title">Scheduling Assistant</span>
          <button className="ais-new-btn" onClick={newChat} title="New scheduling chat">
            <Plus size={15} />
          </button>
        </div>

        <div className="ais-body">
          {convos.length === 0 ? (
            <p className="ais-hint">
              No open scheduling chats.<br />
              Start one — I'll check everyone's calendars and find times that fit.
            </p>
          ) : (
            <div className="ais-convo-list">
              {convos.map(c => (
                <div key={c.id} className="ais-convo-item" onClick={() => openConvo(c)}>
                  <MessageSquare size={14} className="ais-convo-ic" />
                  <div className="ais-convo-main">
                    <span className="ais-convo-title">{c.title}</span>
                    <span className="ais-convo-meta">
                      {ago(c.updated_at)}
                      {c.pending_event_id && <span className="ais-convo-badge">event pending</span>}
                    </span>
                  </div>
                  <button className="ais-convo-x" onClick={e => deleteConvo(e, c.id)} title="Delete chat">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ais-input-row">
          <button className="ais-start-btn" onClick={newChat}>
            <Plus size={14} /> New scheduling chat
          </button>
        </div>
      </div>
    );
  }

  // ── Chat view ───────────────────────────────────────────────────────────────
  return (
    <div className="ais-wrap">
      <div className="ais-header">
        <button className="ais-back" onClick={backToList} title="All chats">
          <ChevronLeft size={16} />
        </button>
        <span className="ais-title ais-title-ellipsis">{active?.title || 'New chat'}</span>
        {locked && <span className="ais-convo-badge">event pending</span>}
      </div>

      <div className="ais-body" ref={bodyRef}>
        {items.length === 0 && !loading && (
          seedMembers ? (
            <div className="ais-seed-banner">
              <span className="ais-seed-label">Scheduling with</span>
              <span className="ais-seed-members">{seedMembers.join(', ')}</span>
              <span className="ais-seed-hint">Name your event below, then send and I'll find times that fit everyone.</span>
            </div>
          ) : (
            <p className="ais-hint">Tell me what to schedule — I'll check everyone's calendars and find times that fit.</p>
          )
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
                        locked={locked}
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
      </div>

      {seedMembers && (
        <div className="ais-eventname-row">
          <input
            className="ais-eventname-input"
            type="text"
            placeholder="Event name (e.g. Dinner)"
            value={eventName}
            onChange={e => setEventName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={loading}
          />
        </div>
      )}

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
