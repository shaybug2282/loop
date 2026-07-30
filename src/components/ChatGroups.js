import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ShieldCheck, Users } from 'lucide-react';
import { formatMsgTime, hasGapBefore, isGroupedMsg as isGroupedBy } from '../utils/format';
import './ChatConversation.css';

const POLL_MS = 8_000;

// Same sender AND no time gap → visually grouped (no repeated name / tighter spacing)
const isGroupedMsg = (msgs, i) => isGroupedBy(msgs, i, m => m.senderId);

// ── List ──────────────────────────────────────────────────────────────────────

// GroupList — every group the user belongs to, newest activity first (the API
// already orders by last access). `activeId` highlights the open one.
const GroupList = ({ onSelect, activeId }) => {
  const [groups,  setGroups]  = useState([]);
  const [loading, setLoading] = useState(true);
  const googleId = localStorage.getItem('googleUserId');

  useEffect(() => {
    if (!googleId) { setLoading(false); return; }
    fetch(`/api/groups?op=list&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setGroups(d?.groups ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [googleId]);

  if (loading) return <p className="mp-status">Loading…</p>;

  if (!groups.length) return (
    <div className="mp-list-empty">
      <Users size={32} strokeWidth={1.2} />
      <p>No groups yet</p>
      <p className="mp-list-sub">Make one on the Friends page and it'll show up here.</p>
    </div>
  );

  return (
    <ul className="mp-convo-list">
      {groups.map(g => {
        const accepted = (g.members ?? []).filter(m => m.status === 'accepted').length;
        return (
          <li
            key={g.id}
            className={`mp-convo-item${g.id === activeId ? ' active' : ''}`}
            onClick={() => onSelect(g)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect(g)}
          >
            {g.icon_url
              ? <img src={g.icon_url} alt="" className="mp-convo-avatar" />
              : <div className="mp-convo-avatar placeholder">{g.name?.[0] ?? '?'}</div>}
            <div className="mp-convo-info">
              <span className="mp-convo-name">{g.name}</span>
              <span className="mp-convo-time">{accepted} member{accepted !== 1 ? 's' : ''}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

// ── Pane ──────────────────────────────────────────────────────────────────────

// GroupPane — one group thread. Server-side encrypted rather than end-to-end
// like DMs, and the shield icon says so; polls on a slower cycle than DMs
// because group chatter is less latency-sensitive.
const GroupPane = ({ group }) => {
  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);
  const [myId,     setMyId]     = useState(null);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const googleId  = localStorage.getItem('googleUserId');

  // Resolve own DB id once
  useEffect(() => {
    if (!googleId) return;
    fetch(`/api/user?op=my-id&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMyId(d.id); })
      .catch(() => {});
  }, [googleId]);

  const fetchMessages = useCallback(async () => {
    if (!group || !googleId) return;
    try {
      const r = await fetch(
        `/api/groups?op=messages&groupId=${group.id}&googleId=${encodeURIComponent(googleId)}`
      );
      if (!r.ok) return;
      const { messages: msgs } = await r.json();
      // API returns newest-first; reverse for chronological display
      setMessages((msgs ?? []).reverse());
    } catch {}
  }, [group, googleId]);

  useEffect(() => {
    setText('');
    fetchMessages();
    const t = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(t);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Opening the thread counts as accessing the group — keeps list ordering fresh.
  useEffect(() => {
    if (!group || !googleId) return;
    fetch('/api/groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'touch', googleId, groupId: group.id }),
    }).catch(() => {});
  }, [group, googleId]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || !group || !googleId || sending) return;
    setSending(true);
    setText('');
    try {
      await fetch('/api/groups', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'send-message', googleId, groupId: group.id, content: msg }),
      });
      await fetchMessages();
    } catch {
      setText(msg);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="mp-conv">
      <div className="mp-conv-body">
        {messages.length === 0 && (
          <p className="mp-status">No messages yet. Say hello!</p>
        )}

        {messages.map((m, i) => {
          const isMine  = m.senderId === myId;
          const gap     = hasGapBefore(messages, i);
          const grouped = isGroupedMsg(messages, i);
          // Show sender name for the first bubble in each "theirs" group
          const showSender = !isMine && !grouped;

          return (
            <React.Fragment key={m.id ?? i}>
              {gap && (
                <div className="mp-time-label">{formatMsgTime(m.created_at)}</div>
              )}
              {showSender && (
                <span className="gcp-sender-name">{m.senderName || 'Member'}</span>
              )}
              <div className={`mp-bubble-row ${isMine ? 'mine' : 'theirs'} ${grouped ? 'grouped' : ''}`}>
                <div className="mp-bubble">{m.content}</div>
              </div>
            </React.Fragment>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div className="mp-input-row">
        {/* Honest label: server-side encryption, unlike E2E DMs */}
        <span className="mp-e2e gcp-enc" title="Encrypted on Loop's servers — not end-to-end like direct messages">
          <ShieldCheck size={10} />
        </span>
        <input
          ref={inputRef}
          className="mp-input"
          placeholder={`Message ${group.name}…`}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button
          className="mp-send"
          onClick={send}
          disabled={!text.trim() || sending}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
};

export { GroupList, GroupPane };
