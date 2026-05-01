import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, ArrowLeft, Send, MessageSquare, Lock } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import {
  getOrCreateKeyPair,
  importPublicKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
} from '../utils/messageCrypto';
import './MessagesPage.css';

const POLL_INTERVAL = 3000; // ms

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Returns true if there is a >1-min gap before this message (triggers visual gap)
function hasGapBefore(messages, index) {
  if (index === 0) return false;
  const prev = new Date(messages[index - 1].created_at);
  const curr = new Date(messages[index].created_at);
  return (curr - prev) > 60 * 1000;
}

// ── Conversation View ─────────────────────────────────────────────────────────

const Conversation = ({ friend, myId, myPrivateKey, onBack }) => {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [sharedKey, setSharedKey] = useState(null);
  const [keyReady,  setKeyReady]  = useState(false);
  const [keyError,  setKeyError]  = useState(null);
  const bottomRef    = useRef(null);
  const lastSeenRef  = useRef(null);
  const googleId     = localStorage.getItem('googleUserId');

  // Derive shared key from friend's public key
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`/api/get-public-key?userId=${friend.id}`);
        if (!res.ok) throw new Error('Friend has not set up messaging yet');
        const { publicKeyJwk } = await res.json();
        const theirPubKey = await importPublicKey(publicKeyJwk);
        const key = await deriveSharedKey(myPrivateKey, theirPubKey);
        setSharedKey(key);
        setKeyReady(true);
      } catch (err) {
        setKeyError(err.message);
      }
    }
    init();
  }, [friend.id, myPrivateKey]);

  // Fetch + decrypt messages, called on mount and every POLL_INTERVAL
  const fetchMessages = useCallback(async () => {
    if (!sharedKey) return;
    const since = lastSeenRef.current
      ? `&since=${encodeURIComponent(lastSeenRef.current)}`
      : '';
    const res = await fetch(`/api/get-conversation?googleId=${encodeURIComponent(googleId)}&friendId=${friend.id}${since}`);
    if (!res.ok) return;
    const { messages: raw } = await res.json();
    if (!raw.length) return;

    const decrypted = await Promise.all(
      raw.map(async m => {
        try {
          const text = await decryptMessage(sharedKey, m.ciphertext, m.iv);
          return { ...m, text };
        } catch {
          return { ...m, text: '[encrypted]' };
        }
      })
    );

    lastSeenRef.current = raw[raw.length - 1].created_at;
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id));
      const newMsgs = decrypted.filter(m => !existingIds.has(m.id));
      return newMsgs.length ? [...prev, ...newMsgs] : prev;
    });
  }, [sharedKey, googleId, friend.id]);

  // Initial load (no since filter needed)
  useEffect(() => {
    if (!keyReady) return;
    lastSeenRef.current = null;
    setMessages([]);
    fetchMessages();
  }, [keyReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling
  useEffect(() => {
    if (!keyReady) return;
    const timer = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [keyReady, fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !sharedKey || sending) return;
    setSending(true);
    setInput('');
    try {
      const { ciphertext, iv } = await encryptMessage(sharedKey, text);
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderGoogleId: googleId, receiverId: friend.id, ciphertext, iv }),
      });
      if (res.ok) {
        const saved = await res.json();
        setMessages(prev => [...prev, { ...saved, sender_id: myId, text }]);
        lastSeenRef.current = saved.created_at;
      }
    } finally {
      setSending(false);
    }
  };

  const friendName = friend.display_name || friend.name;

  return (
    <div className="conversation">
      <div className="conv-header">
        <button className="back-btn" onClick={onBack}><ArrowLeft size={20} /></button>
        {friend.picture_url && <img src={friend.picture_url} alt={friendName} className="conv-avatar" />}
        <div className="conv-title">
          <span className="conv-name">{friendName}</span>
          <span className="conv-e2e"><Lock size={10} /> End-to-end encrypted</span>
        </div>
      </div>

      <div className="conv-body">
        {keyError && <p className="conv-key-error">{keyError}</p>}
        {!keyReady && !keyError && <p className="conv-loading">Setting up secure channel…</p>}

        {keyReady && messages.length === 0 && (
          <p className="conv-empty">No messages yet. Say hello!</p>
        )}

        {messages.map((msg, i) => {
          const isMine = msg.sender_id === myId;
          const gap    = hasGapBefore(messages, i);
          return (
            <React.Fragment key={msg.id}>
              {gap && <div className="time-gap" />}
              <div className={`bubble-row ${isMine ? 'mine' : 'theirs'}`}>
                <div className="bubble">{msg.text}</div>
                <span className="bubble-time">{formatTime(msg.created_at)}</span>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="conv-input-row">
        <input
          className="conv-input"
          placeholder="Message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={!keyReady || !!keyError}
        />
        <button className="conv-send" onClick={handleSend} disabled={!input.trim() || !keyReady || sending}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

// ── Conversation List ─────────────────────────────────────────────────────────

const ConversationList = ({ onSelect }) => {
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(true);
  const googleId = localStorage.getItem('googleUserId');

  useEffect(() => {
    fetch(`/api/get-conversations?googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json())
      .then(d => { setConvos(d.conversations ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [googleId]);

  if (loading) return <p className="list-loading">Loading…</p>;

  if (!convos.length) return (
    <div className="list-empty">
      <MessageSquare size={40} strokeWidth={1.2} />
      <p>No conversations yet</p>
      <p className="list-empty-sub">Open a friend's contact card and tap Message</p>
    </div>
  );

  return (
    <ul className="convo-list">
      {convos.map(c => (
        <li key={c.userId} className="convo-item" onClick={() => onSelect(c)} role="button" tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect(c)}>
          {c.picture_url
            ? <img src={c.picture_url} alt={c.display_name || c.name} className="convo-avatar" />
            : <div className="convo-avatar placeholder">{(c.display_name || c.name)?.[0]}</div>}
          <div className="convo-info">
            <span className="convo-name">{c.display_name || c.name}</span>
            <span className="convo-time">{formatTime(c.lastMessageAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
};

// ── Page Shell ────────────────────────────────────────────────────────────────

const MessagesPage = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeFriend, setActiveFriend] = useState(location.state?.friend ?? null);
  const [myId,       setMyId]       = useState(null);
  const [myPrivKey,  setMyPrivKey]  = useState(null);
  const googleId = localStorage.getItem('googleUserId');

  // Set up ECDH keypair, upload public key, and resolve own UUID — all on mount
  useEffect(() => {
    async function setup() {
      const { privateKey, publicKeyJwk } = await getOrCreateKeyPair();
      setMyPrivKey(privateKey);

      // Upload public key and resolve UUID in parallel
      const [, idRes] = await Promise.all([
        fetch('/api/store-public-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleId, publicKeyJwk }),
        }),
        fetch(`/api/get-my-id?googleId=${encodeURIComponent(googleId)}`),
      ]);

      if (idRes.ok) {
        const { id } = await idRes.json();
        setMyId(id);
      }
    }
    setup();
  }, [googleId]);

  const handleSelect = (convo) => {
    setActiveFriend({
      id:           convo.userId,
      name:         convo.name,
      display_name: convo.display_name,
      picture_url:  convo.picture_url,
    });
    // Clear router state so back doesn't re-select
    navigate('/messages', { replace: true, state: null });
  };

  return (
    <div className="messages-page">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {!activeFriend && (
        <>
          <div className="messages-header">
            <button className="menu-btn" onClick={() => setSidebarOpen(true)}><Menu size={24} /></button>
            <h1>Messages</h1>
          </div>
          <ConversationList onSelect={handleSelect} />
        </>
      )}

      {activeFriend && myPrivKey && (
        <Conversation
          friend={activeFriend}
          myId={myId}
          myPrivateKey={myPrivKey}
          onBack={() => setActiveFriend(null)}
        />
      )}
    </div>
  );
};

export default MessagesPage;
