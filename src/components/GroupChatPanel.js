import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, ChevronDown } from 'lucide-react';
import { useGroupChat } from '../contexts/GroupChatContext';
import { useAuth } from '../contexts/AuthContext';
import './GroupChatPanel.css';

const POLL_MS = 8_000;

// Fixed-position group chat overlay, similar in style to MessagesPanel.
const GroupChatPanel = () => {
  const { chatGroup, closeGroupChat } = useGroupChat();
  const { isAuthenticated } = useAuth();
  const [messages,   setMessages]   = useState([]);
  const [text,       setText]       = useState('');
  const [sending,    setSending]    = useState(false);
  const [minimized,  setMinimized]  = useState(false);
  const [myId,       setMyId]       = useState(null);
  const bottomRef  = useRef(null);
  const googleId   = localStorage.getItem('googleUserId');

  // Close when user signs out
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
      setMessages((msgs ?? []).reverse()); // API returns newest first; reverse for display
    } catch {}
  }, [chatGroup, googleId]);

  // Load messages on open; poll while open
  useEffect(() => {
    if (!chatGroup) { setMessages([]); return; }
    setText('');
    fetchMessages();
    const t = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(t);
  }, [chatGroup, fetchMessages]);

  // Scroll to bottom on new messages
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
      setText(msg); // restore on failure
    } finally { setSending(false); }
  };

  if (!chatGroup) return null;

  const dot  = chatGroup.color ?? '#E8607A';
  const name = chatGroup.name;

  return (
    <div className={`gcp-panel${minimized ? ' gcp-minimized' : ''}`}>
      {/* Header */}
      <div className="gcp-header" style={{ borderTop: `3px solid ${dot}` }}>
        <div className="gcp-header-left">
          <span className="gcp-dot" style={{ background: dot }} />
          <span className="gcp-title">{name}</span>
        </div>
        <div className="gcp-header-actions">
          <button onClick={() => setMinimized(v => !v)} className="gcp-icon-btn" title="Minimize">
            <ChevronDown size={16} style={{ transform: minimized ? 'rotate(180deg)' : 'none' }} />
          </button>
          <button onClick={closeGroupChat} className="gcp-icon-btn" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div className="gcp-messages">
            {messages.length === 0 && (
              <p className="gcp-empty">No messages yet. Say hello!</p>
            )}
            {messages.map((m, i) => {
              const isMe = m.senderId === myId;
              return (
                <div key={m.id ?? i} className={`gcp-msg${isMe ? ' gcp-msg-me' : ''}`}>
                  {!isMe && (
                    <span className="gcp-sender">{m.senderName || 'Member'}</span>
                  )}
                  <div className="gcp-bubble">{m.content}</div>
                  <span className="gcp-time">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Compose */}
          <div className="gcp-compose">
            <input
              className="gcp-input"
              placeholder={`Message ${name}…`}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="gcp-send" onClick={send} disabled={!text.trim() || sending}>
              <Send size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default GroupChatPanel;
