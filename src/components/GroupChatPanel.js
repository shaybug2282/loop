import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Minus, Send, ShieldCheck } from 'lucide-react';
import { useGroupChat } from '../contexts/GroupChatContext';
import { useAuth }      from '../contexts/AuthContext';
import { formatMsgTime, hasGapBefore, isGroupedMsg as isGroupedBy } from '../utils/format';
import './MessagesPanel.css';
import './GroupChatPanel.css';

const POLL_MS = 8_000;

// Same sender AND no time gap → visually grouped (no repeated name / tighter spacing)
const isGroupedMsg = (msgs, i) => isGroupedBy(msgs, i, m => m.senderId);

const GroupChatPanel = () => {
  const { chatGroup, closeGroupChat } = useGroupChat();
  const { isAuthenticated }           = useAuth();

  const [messages,  setMessages]  = useState([]);
  const [text,      setText]      = useState('');
  const [sending,   setSending]   = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [myId,      setMyId]      = useState(null);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const googleId  = localStorage.getItem('googleUserId');

  // Close when signed out
  useEffect(() => {
    if (!isAuthenticated && chatGroup) closeGroupChat();
  }, [isAuthenticated, chatGroup, closeGroupChat]);

  // Resolve own DB id once
  useEffect(() => {
    if (!googleId) return;
    fetch(`/api/user?op=my-id&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMyId(d.id); })
      .catch(() => {});
  }, [googleId]);

  const fetchMessages = useCallback(async () => {
    if (!chatGroup || !googleId) return;
    try {
      const r = await fetch(
        `/api/groups?op=messages&groupId=${chatGroup.id}&googleId=${encodeURIComponent(googleId)}`
      );
      if (!r.ok) return;
      const { messages: msgs } = await r.json();
      // API returns newest-first; reverse for chronological display
      setMessages((msgs ?? []).reverse());
    } catch {}
  }, [chatGroup, googleId]);

  useEffect(() => {
    if (!chatGroup) { setMessages([]); return; }
    setText('');
    fetchMessages();
    const t = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(t);
  }, [chatGroup, fetchMessages]);

  useEffect(() => {
    if (!minimized) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, minimized]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || !chatGroup || !googleId || sending) return;
    setSending(true);
    setText('');
    try {
      await fetch('/api/groups', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'send-message', googleId, groupId: chatGroup.id, content: msg }),
      });
      await fetchMessages();
    } catch {
      setText(msg);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  if (!chatGroup) return null;

  const acceptedCount = (chatGroup.members ?? []).filter(m => m.status === 'accepted').length;

  return (
    <div className={`mp-panel gcp-panel${minimized ? ' minimized' : ''}`}>
      {/* Header — same pink bar as DM panel, with group icon + member count */}
      <div className="mp-header">
        <div className="gcp-hd-icon">
          {chatGroup.icon_url
            ? <img src={chatGroup.icon_url} alt="" className="gcp-hd-icon-img" />
            : <span className="gcp-hd-icon-letter">{chatGroup.name?.[0] ?? '?'}</span>}
        </div>
        <div className="gcp-hd-info">
          <span className="mp-header-title">{chatGroup.name}</span>
          <span className="gcp-member-count">
            {acceptedCount} member{acceptedCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="mp-header-actions">
          <button
            className="mp-header-btn"
            onClick={() => setMinimized(v => !v)}
            title={minimized ? 'Expand' : 'Minimize'}
          >
            <Minus size={16} />
          </button>
          <button className="mp-header-btn" onClick={closeGroupChat} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="mp-body">
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
                placeholder={`Message ${chatGroup.name}…`}
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
        </div>
      )}
    </div>
  );
};

export default GroupChatPanel;
