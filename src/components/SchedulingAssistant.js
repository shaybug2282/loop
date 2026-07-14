import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Loader, Calendar, Check, X, Plus, ChevronLeft, MessageSquare } from 'lucide-react';
import './SchedulingAssistant.css';

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
//
// Group mode: when rendered with a `group` prop (inside GroupsWidget's
// schedule popup) the widget opens straight into a chat headed by a banner
// with the group name + members, greets the user, and sends `groupId` with
// every message so the server schedules for all group members automatically.

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
      id:         `s${i}`,
      role:       'ai',
      text:       typeof parsed?.reply === 'string' ? parsed.reply : m.content,
      plans,
      bookings:   plans.map(() => null),
      booked:     parsed?.booked ?? null,
      remembered: parsed?.remembered ?? null,
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
        {plan.description && <span className="ais-plan-desc">{plan.description}</span>}
      </span>
      {done && <span className="ais-plan-status">Invited!</span>}
      {err  && <span className="ais-plan-status err">Failed</span>}
    </button>
  );
};

// groupGreeting — client-side opening bubble for a group-mode chat (not
// persisted; the server learns the group from the groupId on each message).
const groupGreeting = () =>
  [{ id: 'greet', role: 'ai', text: 'What type of event would you like me to schedule?' }];

// initialMessage: when set, the assistant opens straight into a fresh chat
// and sends it as the first user turn (used by NewEventPopup's "Find a time"
// and the friend list's Schedule quick action to seed participants).
const SchedulingAssistant = ({ group = null, onClose = null, initialMessage = null, onBooked = null }) => {
  const [view,    setView]    = useState(group || initialMessage ? 'chat' : 'list');   // 'list' | 'chat'
  const [convos,  setConvos]  = useState([]);
  // active — the open conversation: { id, title, pendingEventId }; id null = new unsaved chat.
  const [active,  setActive]  = useState(null);
  // items — display list: { id, role:'user'|'ai'|'error', text, plans?, bookings?, booked? }
  const [items,   setItems]   = useState(group ? groupGreeting() : []);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);

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

  // Focus the composer right away when opening as a group popup.
  useEffect(() => {
    if (group) setTimeout(() => inputRef.current?.focus(), 0);
  }, [group]);

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
    setInput('');
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const backToList = () => {
    setView('list');
    setActive(null);
    setItems([]);
    setInput('');
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

  // sendMessage — post one user turn to the chat op and append the reply.
  // Shared by the composer (send) and the initialMessage auto-seed.
  const sendMessage = useCallback(async (text) => {
    if (!text || loading || !googleId) return;

    setItems(prev => [...prev, { id: Date.now(), role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          op: 'chat', googleId,
          conversationId: active?.id ?? undefined,
          message: text,
          // Group mode: the server resolves the group's members and schedules
          // for all of them — the user never has to list participants.
          groupId: group?.id ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI error');

      const { conversationId, reply, plans = [], remembered = null } = data;
      setActive(prev => prev?.id
        ? prev
        : { id: conversationId, title: text.slice(0, 60), pendingEventId: null });
      setItems(prev => [...prev, {
        id:         Date.now() + 1,
        role:       'ai',
        text:       reply,
        plans,
        bookings:   plans.map(() => null),
        remembered,
      }]);
    } catch (err) {
      setItems(prev => [...prev, { id: Date.now() + 1, role: 'error', text: err.message }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading, googleId, active, group]);

  const send = useCallback(() => sendMessage(input.trim()), [sendMessage, input]);

  // Seed the chat once when opened with an initialMessage (e.g. "Find a time"
  // from the New event flow, with the picked friends' names baked in).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!initialMessage || seededRef.current) return;
    seededRef.current = true;
    sendMessage(initialMessage);
  }, [initialMessage, sendMessage]);

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
          // Invite-only note: rides on the invite + event card, never on the
          // Google Calendar event.
          description:     plan.description,
          // Group-mode bookings carry the group so the event gets its tag.
          groupId:         group?.id ?? undefined,
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
      onBooked?.();
    } catch {
      setBooking('error');
    }
  }, [googleId, active, loadConvos, group, onBooked]);

  // undoRemember — the Undo on a "saved to your profile" pill: removes the
  // captured rule from the stored profile (op:'forget-constraint') and flips
  // the pill to its undone state. Idempotent server-side, so undoing from a
  // reopened old chat is safe even if the rule is already gone.
  const undoRemember = useCallback(async (itemId) => {
    let constraint = null;
    setItems(prev => prev.map(it => {
      if (it.id !== itemId || !it.remembered) return it;
      constraint = it.remembered.constraint;
      return { ...it, remembered: { ...it.remembered, undone: true } };
    }));
    if (!constraint) return;
    try {
      await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'forget-constraint', googleId, constraint }),
      });
    } catch {}
  }, [googleId]);

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
          {onClose && (
            <button className="ais-new-btn ais-close-btn" onClick={onClose} title="Close">
              <X size={15} />
            </button>
          )}
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
  const memberNames = group
    ? (group.members ?? [])
        .filter(m => m.status === 'accepted')
        .map(m => m.display_name || m.name)
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <div className="ais-wrap">
      {group ? (
        <div className="ais-header">
          <div className="ais-group-head">
            <span className="ais-title ais-title-ellipsis">{group.name}</span>
            {memberNames && <span className="ais-group-members">{memberNames}</span>}
          </div>
          {locked && <span className="ais-convo-badge">event pending</span>}
          {onClose && (
            <button className="ais-new-btn" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="ais-header">
          <button className="ais-back" onClick={backToList} title="All chats">
            <ChevronLeft size={16} />
          </button>
          <span className="ais-title ais-title-ellipsis">{active?.title || 'New chat'}</span>
          {locked && <span className="ais-convo-badge">event pending</span>}
          {onClose && (
            <button className="ais-new-btn" onClick={onClose} title="Close">
              <X size={15} />
            </button>
          )}
        </div>
      )}

      <div className="ais-body" ref={bodyRef}>
        {items.length === 0 && !loading && (
          <p className="ais-hint">Tell me what to schedule — I'll check everyone's calendars and find times that fit.</p>
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
                {item.remembered && (
                  <div className="ais-remember-pill">
                    {item.remembered.undone
                      ? <span>Removed from your profile.</span>
                      : <>
                          <span>Saved to your profile: “{item.remembered.constraint}”</span>
                          <button className="ais-remember-undo" onClick={() => undoRemember(item.id)}>Undo</button>
                        </>}
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

export default SchedulingAssistant;
