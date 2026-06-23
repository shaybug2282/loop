import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  X, Minus, ArrowLeft, Send, MessageSquare, Lock,
} from 'lucide-react';
import { useMessages } from '../contexts/MessagesContext';
import {
  getOrCreateKeyPair,
  importPublicKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
} from '../utils/messageCrypto';
import './MessagesPanel.css';

const POLL_MS  = 3000;
const GAP_MS   = 30_000; // 30 seconds — threshold for showing a new timestamp

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMsgTime(iso) {
  const d     = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// True when there is a 30s+ gap before this message (or it is the first one).
function hasGapBefore(msgs, i) {
  if (i === 0) return true;
  return new Date(msgs[i].created_at) - new Date(msgs[i - 1].created_at) >= GAP_MS;
}

// True when this message continues a run from the same sender with no gap.
function isGrouped(msgs, i) {
  if (i === 0) return false;
  if (hasGapBefore(msgs, i)) return false;
  return msgs[i].sender_id === msgs[i - 1].sender_id;
}

// ── Context Menu ─────────────────────────────────────────────────────────────

const CtxMenu = ({ menu, onUndoSend, onEdit, onClose }) => {
  const ref = useRef(null);

  useEffect(() => {
    const dismiss = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown',   onKey);
    };
  }, [onClose]);

  // Clamp so menu never overflows viewport
  const style = {
    top:  Math.min(menu.y, window.innerHeight - 110),
    left: Math.max(Math.min(menu.x, window.innerWidth - 160), 8),
  };

  return (
    <div className="mp-ctx" style={style} ref={ref}>
      <button
        className={`mp-ctx-item danger ${!menu.canUndo ? 'disabled' : ''}`}
        onClick={() => { if (menu.canUndo) { onUndoSend(); onClose(); } }}
      >
        Undo Send
        {!menu.canUndo && <span className="mp-ctx-note">· 30s expired</span>}
      </button>
      <button
        className={`mp-ctx-item ${!menu.canEdit ? 'disabled' : ''}`}
        onClick={() => { if (menu.canEdit) { onEdit(); onClose(); } }}
      >
        Edit Message
        {!menu.canEdit && <span className="mp-ctx-note">· 1 min expired</span>}
      </button>
    </div>
  );
};

// ── Conversation ──────────────────────────────────────────────────────────────

const Conversation = ({ friend, myId, myPrivateKey, isMinimized }) => {
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState('');
  const [sending,    setSending]    = useState(false);
  const [sharedKey,  setSharedKey]  = useState(null);
  const [keyReady,   setKeyReady]   = useState(false);
  const [keyError,   setKeyError]   = useState(null);
  const [editingId,  setEditingId]  = useState(null);
  const [editDraft,  setEditDraft]  = useState('');
  const [ctxMenu,    setCtxMenu]    = useState(null);

  const bottomRef   = useRef(null);
  const lastSeenRef = useRef(null);
  const inputRef    = useRef(null);
  const googleId    = localStorage.getItem('googleUserId');

  // Derive shared ECDH key on mount (once per friend)
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const res = await fetch(`/api/messages?op=public-key&userId=${friend.id}`);
        if (!res.ok) throw new Error('Friend has not set up messaging yet');
        const { publicKeyJwk } = await res.json();
        const theirPub = await importPublicKey(publicKeyJwk);
        const key = await deriveSharedKey(myPrivateKey, theirPub);
        if (!cancelled) { setSharedKey(key); setKeyReady(true); }
      } catch (err) {
        if (!cancelled) setKeyError(err.message);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [friend.id, myPrivateKey]);

  const fetchMessages = useCallback(async () => {
    if (!sharedKey || document.visibilityState === 'hidden') return;
    const since = lastSeenRef.current
      ? `&since=${encodeURIComponent(lastSeenRef.current)}`
      : '';
    const res = await fetch(
      `/api/messages?op=conversation&googleId=${encodeURIComponent(googleId)}&friendId=${friend.id}${since}`
    );
    if (!res.ok) return;
    const { messages: raw } = await res.json();
    if (!raw.length) return;

    const decrypted = await Promise.all(
      raw.map(async m => {
        try {
          // Support both new `payload` and legacy `ciphertext + iv`
          const text = m.payload
            ? await decryptMessage(sharedKey, m.payload)
            : await decryptMessage(sharedKey, m.ciphertext, m.iv);
          return { ...m, text };
        } catch {
          return { ...m, text: '[encrypted]' };
        }
      })
    );

    lastSeenRef.current = raw[raw.length - 1].created_at;
    setMessages(prev => {
      const ids = new Set(prev.map(m => m.id));
      const added = decrypted.filter(m => !ids.has(m.id));
      // Apply edits/deletes from server side (handle deleted messages)
      const updated = prev.map(m => {
        const serverVer = decrypted.find(d => d.id === m.id);
        return serverVer ?? m;
      });
      return added.length ? [...updated, ...added] : updated;
    });
  }, [sharedKey, googleId, friend.id]);

  // Initial load
  useEffect(() => {
    if (!keyReady) return;
    lastSeenRef.current = null;
    setMessages([]);
    fetchMessages();
  }, [keyReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling — pause when minimized or tab hidden
  useEffect(() => {
    if (!keyReady || isMinimized) return;
    const t = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(t);
  }, [keyReady, isMinimized, fetchMessages]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !sharedKey || sending) return;
    setSending(true);
    setInput('');
    try {
      const { payload } = await encryptMessage(sharedKey, text);
      const res = await fetch('/api/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'send', senderGoogleId: googleId, receiverId: friend.id, payload }),
      });
      if (res.ok) {
        const saved = await res.json();
        setMessages(prev => [...prev, { ...saved, sender_id: myId, payload, text }]);
        lastSeenRef.current = saved.created_at;
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleUndoSend = async (messageId) => {
    const res = await fetch('/api/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'delete', googleId, messageId }),
    });
    if (res.ok) setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const handleEditSave = async () => {
    const newText = editDraft.trim();
    if (!newText || !sharedKey) return;
    const { payload } = await encryptMessage(sharedKey, newText);
    const res = await fetch('/api/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'edit', googleId, messageId: editingId, payload }),
    });
    if (res.ok) {
      setMessages(prev => prev.map(m =>
        m.id === editingId
          ? { ...m, text: newText, payload, edited_at: new Date().toISOString() }
          : m
      ));
      setEditingId(null);
    }
  };

  const openCtxMenu = (e, msg) => {
    e.preventDefault();
    if (msg.sender_id !== myId) return;
    const age = Date.now() - new Date(msg.created_at).getTime();
    setCtxMenu({ x: e.clientX, y: e.clientY, msg, canUndo: age < 30_000, canEdit: age < 60_000 });
  };

  const friendName = friend.display_name || friend.name;

  return (
    <div className="mp-conv">
      {ctxMenu && (
        <CtxMenu
          menu={ctxMenu}
          onUndoSend={() => handleUndoSend(ctxMenu.msg.id)}
          onEdit={() => { setEditingId(ctxMenu.msg.id); setEditDraft(ctxMenu.msg.text); }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div className="mp-conv-body">
        {keyError && <p className="mp-status error">{keyError}</p>}
        {!keyReady && !keyError && <p className="mp-status">Setting up secure channel…</p>}
        {keyReady && messages.length === 0 && (
          <p className="mp-status">No messages yet. Say hello!</p>
        )}

        {messages.map((msg, i) => {
          const isMine  = msg.sender_id === myId;
          const grouped = isGrouped(messages, i);
          const gap     = hasGapBefore(messages, i);

          return (
            <React.Fragment key={msg.id}>
              {gap && (
                <div className="mp-time-label">{formatMsgTime(msg.created_at)}</div>
              )}
              <div
                className={`mp-bubble-row ${isMine ? 'mine' : 'theirs'} ${grouped ? 'grouped' : ''}`}
                onContextMenu={isMine ? e => openCtxMenu(e, msg) : undefined}
              >
                <div className="mp-bubble">
                  {editingId === msg.id ? (
                    <div className="mp-edit-wrap">
                      <input
                        className="mp-edit-input"
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) handleEditSave();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                      <div className="mp-edit-actions">
                        <button className="mp-edit-save" onClick={handleEditSave}>Save</button>
                        <button className="mp-edit-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.text}
                      {msg.edited_at && <em className="mp-edited"> · edited</em>}
                    </>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mp-input-row">
        <span className="mp-e2e"><Lock size={10} /></span>
        <input
          ref={inputRef}
          className="mp-input"
          placeholder={`Message ${friendName}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={!keyReady || !!keyError}
        />
        <button
          className="mp-send"
          onClick={handleSend}
          disabled={!input.trim() || !keyReady || sending}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
};

// ── Conversation List ─────────────────────────────────────────────────────────

const ConversationList = ({ onSelect }) => {
  const [convos,  setConvos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const googleId = localStorage.getItem('googleUserId');

  useEffect(() => {
    fetch(`/api/messages?op=conversations&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json())
      .then(d => { setConvos(d.conversations ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [googleId]);

  if (loading) return <p className="mp-status">Loading…</p>;

  if (!convos.length) return (
    <div className="mp-list-empty">
      <MessageSquare size={32} strokeWidth={1.2} />
      <p>No conversations yet</p>
      <p className="mp-list-sub">Open a friend's card and tap Message</p>
    </div>
  );

  return (
    <ul className="mp-convo-list">
      {convos.map(c => (
        <li
          key={c.userId}
          className="mp-convo-item"
          onClick={() => onSelect(c)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onSelect(c)}
        >
          {c.picture_url
            ? <img src={c.picture_url} alt={c.display_name || c.name} className="mp-convo-avatar" />
            : <div className="mp-convo-avatar placeholder">{(c.display_name || c.name)?.[0]}</div>}
          <div className="mp-convo-info">
            <span className="mp-convo-name">{c.display_name || c.name}</span>
            <span className="mp-convo-time">{formatMsgTime(c.lastMessageAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
};

// ── Panel Shell ───────────────────────────────────────────────────────────────

const MessagesPanel = () => {
  const { isOpen, isMinimized, friend, openMessages, closeMessages, toggleMinimize, goToList } =
    useMessages();

  const [myId,     setMyId]     = useState(null);
  const [myPrivKey, setMyPrivKey] = useState(null);

  const googleId = localStorage.getItem('googleUserId');

  // Set up ECDH keypair + upload public key + resolve own UUID on first open
  useEffect(() => {
    if (!isOpen || !googleId) return;
    async function setup() {
      const { privateKey, publicKeyJwk } = await getOrCreateKeyPair();
      setMyPrivKey(privateKey);
      const [, idRes] = await Promise.all([
        fetch('/api/messages', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ op: 'store-key', googleId, publicKeyJwk }),
        }),
        fetch(`/api/user?op=my-id&googleId=${encodeURIComponent(googleId)}`),
      ]);
      if (idRes.ok) {
        const { id } = await idRes.json();
        setMyId(id);
      }
    }
    setup();
  }, [isOpen, googleId]);

  if (!isOpen) return null;

  const title = friend ? (friend.display_name || friend.name) : 'Messages';

  return (
    <div className={`mp-panel ${isMinimized ? 'minimized' : ''}`}>
      {/* Header */}
      <div className="mp-header">
        {friend && !isMinimized && (
          <button className="mp-header-btn" onClick={goToList} title="Back">
            <ArrowLeft size={16} />
          </button>
        )}
        <span className="mp-header-title">{title}</span>
        <div className="mp-header-actions">
          <button className="mp-header-btn" onClick={toggleMinimize} title={isMinimized ? 'Expand' : 'Minimize'}>
            <Minus size={16} />
          </button>
          <button className="mp-header-btn" onClick={closeMessages} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body — hidden when minimized */}
      {!isMinimized && (
        <div className="mp-body">
          {friend && myPrivKey ? (
            <Conversation
              key={friend.id}
              friend={friend}
              myId={myId}
              myPrivateKey={myPrivKey}
              isMinimized={isMinimized}
            />
          ) : (
            <ConversationList
              onSelect={c => openMessages({
                id:           c.userId,
                name:         c.name,
                display_name: c.display_name,
                picture_url:  c.picture_url,
              })}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default MessagesPanel;
