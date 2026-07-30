import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  ArrowLeft, Send, MessageSquare, Lock, PenSquare,
} from 'lucide-react';
import { markRead, isUnread } from '../utils/unread';
import {
  getOrCreateKeyPair,
  importPublicKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
} from '../utils/messageCrypto';
import { formatMsgTime, hasGapBefore, isGroupedMsg } from '../utils/format';
import './ChatConversation.css';

const POLL_MS = 3000;

// Same sender, no gap → tighter visual grouping.
const isGrouped = (msgs, i) => isGroupedMsg(msgs, i, m => m.sender_id);

// ── Context Menu ─────────────────────────────────────────────────────────────

const CtxMenu = ({ menu, onUndoSend, onEdit, onClose }) => {
  const ref = useRef(null);

  useEffect(() => {
    const dismiss = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey   = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown',   onKey);
    };
  }, [onClose]);

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
        {!menu.canUndo && <span className="mp-ctx-note">· expired</span>}
      </button>
      <button
        className={`mp-ctx-item ${!menu.canEdit ? 'disabled' : ''}`}
        onClick={() => { if (menu.canEdit) { onEdit(); onClose(); } }}
      >
        Edit Message
        {!menu.canEdit && <span className="mp-ctx-note">· expired</span>}
      </button>
    </div>
  );
};

// ── Conversation ──────────────────────────────────────────────────────────────

// DirectConversation — one end-to-end encrypted thread with a friend. Derives
// the shared ECDH key on mount, then polls the full conversation (a full fetch
// rather than a `since` window, so edits and deletes land correctly).
const DirectConversation = ({ friend, myId, myPrivateKey, onRead }) => {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [sharedKey, setSharedKey] = useState(null);
  const [keyReady,  setKeyReady]  = useState(false);
  const [keyError,  setKeyError]  = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [ctxMenu,   setCtxMenu]   = useState(null);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const googleId  = localStorage.getItem('googleUserId');

  // Derive shared ECDH key once per friend
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const res = await fetch(`/api/messages?op=public-key&userId=${friend.id}`);
        if (!res.ok) throw new Error("Friend hasn't set up messaging yet");
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
    const res = await fetch(
      `/api/messages?op=conversation&googleId=${encodeURIComponent(googleId)}&friendId=${friend.id}`
    );
    if (!res.ok) return;
    const { messages: raw } = await res.json();
    if (!raw) return;

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

    // Preserve client-side `edited_at` for messages the sender edited locally
    setMessages(prev => {
      const localEdits = new Map(prev.filter(m => m.local_edited).map(m => [m.id, m.edited_at]));
      return decrypted.map(m => ({
        ...m,
        edited_at: m.edited_at ?? localEdits.get(m.id) ?? null,
      }));
    });

    // Viewing the conversation reads it — clears the unread dot/badge.
    markRead(friend.id);
    onRead?.();
  }, [sharedKey, googleId, friend.id, onRead]);

  // Initial load
  useEffect(() => {
    if (keyReady) fetchMessages();
  }, [keyReady, fetchMessages]);

  useEffect(() => {
    if (!keyReady) return;
    const t = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(t);
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
      const res = await fetch('/api/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          op: 'send', senderGoogleId: googleId,
          receiverId: friend.id, ciphertext, iv,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setMessages(prev => [...prev, { ...saved, sender_id: myId, ciphertext, iv, text }]);
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleUndoSend = async messageId => {
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
    const { ciphertext, iv } = await encryptMessage(sharedKey, newText);
    const res = await fetch('/api/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'edit', googleId, messageId: editingId, ciphertext, iv }),
    });
    if (res.ok) {
      const now = new Date().toISOString();
      setMessages(prev => prev.map(m =>
        m.id === editingId
          ? { ...m, ciphertext, iv, text: newText, edited_at: now, local_edited: true }
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
        {keyError   && <p className="mp-status error">{keyError}</p>}
        {!keyReady  && !keyError && <p className="mp-status">Setting up secure channel…</p>}
        {keyReady   && messages.length === 0 && <p className="mp-status">No messages yet. Say hello!</p>}

        {messages.map((msg, i) => {
          const isMine  = msg.sender_id === myId;
          const gap     = hasGapBefore(messages, i);
          const grouped = isGrouped(messages, i);

          return (
            <React.Fragment key={msg.id}>
              {gap && <div className="mp-time-label">{formatMsgTime(msg.created_at)}</div>}
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
                        <button className="mp-edit-save"   onClick={handleEditSave}>Save</button>
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
        <span className="mp-e2e" title="End-to-end encrypted"><Lock size={10} /></span>
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

// ── Conversation list ─────────────────────────────────────────────────────────

// DirectList — existing DM threads, plus a compose view that lazy-loads the
// friend list so a conversation can start with any friend, not only someone
// who has already written. `activeId` highlights the open thread.
const DirectList = ({ onSelect, activeId }) => {
  const [convos,    setConvos]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [composing, setComposing] = useState(false);
  const [friends,   setFriends]   = useState(null); // null = not fetched yet
  const googleId = localStorage.getItem('googleUserId');

  useEffect(() => {
    fetch(`/api/messages?op=conversations&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json())
      .then(d => { setConvos(d.conversations ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [googleId]);

  useEffect(() => {
    if (!composing || friends !== null || !googleId) return;
    fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json())
      .then(d => setFriends(d.friends ?? []))
      .catch(() => setFriends([]));
  }, [composing, friends, googleId]);

  if (loading) return <p className="mp-status">Loading…</p>;

  if (composing) {
    return (
      <div className="mp-compose">
        <div className="mp-compose-head">
          <span>New message</span>
          <button className="ch-icon-btn" onClick={() => setComposing(false)} title="Back">
            <ArrowLeft size={14} />
          </button>
        </div>
        {friends === null ? (
          <p className="mp-status">Loading friends…</p>
        ) : friends.length === 0 ? (
          <p className="mp-status">No friends yet — add some from the Friends page first.</p>
        ) : (
          <ul className="mp-convo-list">
            {friends.map(f => (
              <li key={f.id} className="mp-convo-item" onClick={() => onSelect({ userId: f.id, ...f })}
                role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onSelect({ userId: f.id, ...f })}>
                {f.picture_url
                  ? <img src={f.picture_url} alt={f.display_name || f.name} className="mp-convo-avatar" />
                  : <div className="mp-convo-avatar placeholder">{(f.display_name || f.name)?.[0]}</div>}
                <div className="mp-convo-info">
                  <span className="mp-convo-name">{f.display_name || f.name}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!convos.length) return (
    <div className="mp-list-empty">
      <MessageSquare size={32} strokeWidth={1.2} />
      <p>No conversations yet</p>
      <button className="mp-compose-btn" onClick={() => setComposing(true)}>
        <PenSquare size={13} /> New message
      </button>
    </div>
  );

  return (
    <>
      <div className="mp-list-toolbar">
        <button className="mp-compose-btn" onClick={() => setComposing(true)} title="Start a new conversation">
          <PenSquare size={13} /> New message
        </button>
      </div>
      <ul className="mp-convo-list">
        {convos.map(c => (
          <li
            key={c.userId}
            className={`mp-convo-item${c.userId === activeId ? ' active' : ''}`}
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
            {isUnread(c) && <span className="mp-unread-dot" title="New messages" />}
          </li>
        ))}
      </ul>
    </>
  );
};

// ── Pane ──────────────────────────────────────────────────────────────────────

// DirectPane — resolves the identity a DM thread needs (own ECDH keypair, own
// DB id) and then renders the conversation. This runs only once a friend is
// actually selected: the old panel did it whenever the window opened, so
// someone opening the hub to look at plans still paid for keypair generation
// and a `store-key` round trip.
const DirectPane = ({ friend, onRead }) => {
  const [myId,      setMyId]      = useState(null);
  const [myPrivKey, setMyPrivKey] = useState(null);
  const googleId = localStorage.getItem('googleUserId');

  useEffect(() => {
    if (!googleId) return;
    let cancelled = false;
    async function setup() {
      const { privateKey, publicKeyJwk } = await getOrCreateKeyPair();
      if (cancelled) return;
      setMyPrivKey(privateKey);
      // Always send the current public key — the server ignores it if one is
      // already stored, so this is safe and ensures the key is always present.
      const [, idRes] = await Promise.all([
        fetch('/api/messages', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ op: 'store-key', googleId, publicKeyJwk }),
        }),
        fetch(`/api/user?op=my-id&googleId=${encodeURIComponent(googleId)}`),
      ]);
      if (idRes.ok && !cancelled) {
        const { id } = await idRes.json();
        setMyId(id);
      }
    }
    setup();
    return () => { cancelled = true; };
  }, [googleId]);

  if (!myPrivKey) return <p className="mp-status">Setting up secure channel…</p>;

  return (
    <DirectConversation
      key={friend.id}
      friend={friend}
      myId={myId}
      myPrivateKey={myPrivKey}
      onRead={onRead}
    />
  );
};

export { DirectList, DirectPane };
