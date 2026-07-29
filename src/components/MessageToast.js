import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useMessages } from '../contexts/MessagesContext';
import { useAuth } from '../contexts/AuthContext';
import { countUnread, getMutedSet } from '../utils/unread';
import { getPrefs } from '../utils/prefs';
import './MessageToast.css';

const POLL_MS = 15_000;
const TOAST_MS = 20_000;

// Polls for new messages in the background and shows a toast when a message
// arrives in a conversation that is not currently open. The same poll also
// keeps the shared unread-conversation count (sidebar badge) current.
const MessageToast = () => {
  const { isOpen, friend, openMessages, setUnreadCount, registerUnreadRecalc } = useMessages();
  const { isAuthenticated } = useAuth();
  const [toast, setToast] = useState(null);

  // Refs so the poll callback doesn't need to close over changing values.
  const friendRef  = useRef(friend);
  const isOpenRef  = useRef(isOpen);
  const lastSeenRef = useRef({}); // { userId: ISO timestamp of last known message }
  const seededRef  = useRef(false); // true after the first poll seeds timestamps
  const convosRef  = useRef([]);   // last fetched conversations, for instant recounts

  useEffect(() => { friendRef.current = friend; },  [friend]);
  useEffect(() => { isOpenRef.current = isOpen; },  [isOpen]);

  // Let the panel trigger an instant badge recount when a conversation is
  // opened (marked read) — no waiting for the next poll.
  useEffect(() => {
    registerUnreadRecalc(() => setUnreadCount(countUnread(convosRef.current)));
  }, [registerUnreadRecalc, setUnreadCount]);

  const poll = useCallback(async () => {
    const googleId = localStorage.getItem('googleUserId');
    if (!googleId) return;
    try {
      const res = await fetch(`/api/messages?op=conversations&googleId=${encodeURIComponent(googleId)}`);
      if (!res.ok) return;
      const { conversations } = await res.json();

      convosRef.current = conversations ?? [];
      setUnreadCount(countUnread(conversations));

      const muted = getMutedSet();
      let newest = null;
      for (const c of (conversations ?? [])) {
        const prev = lastSeenRef.current[c.userId];
        lastSeenRef.current[c.userId] = c.lastMessageAt;

        if (!seededRef.current) continue; // first pass: only seed, no toasts
        if (!prev) continue;
        if (new Date(c.lastMessageAt) <= new Date(prev)) continue;

        // New message — show toast only when this conversation isn't currently
        // open, the sender isn't muted, and DM toasts are enabled.
        const activeConvo = isOpenRef.current && friendRef.current?.id === c.userId;
        if (muted.has(c.userId) || !getPrefs().notifications.dmToasts) continue;
        if (!activeConvo) {
          // If multiple arrive in the same poll, show the most recently updated one.
          if (!newest || new Date(c.lastMessageAt) > new Date(newest.lastMessageAt)) {
            newest = c;
          }
        }
      }

      seededRef.current = true;
      if (newest) {
        setToast({ id: newest.userId, name: newest.name, display_name: newest.display_name, picture_url: newest.picture_url });
      }
    } catch { /* silent */ }
  }, [setUnreadCount]); // otherwise dep-free — uses refs for friend/isOpen

  useEffect(() => {
    if (!isAuthenticated) return;
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [isAuthenticated, poll]);

  // Auto-dismiss after 20 s; resets whenever a new toast replaces the old one.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const name = toast.display_name || toast.name || 'Someone';

  return (
    <div
      className="mt-toast"
      role="alert"
      onClick={() => {
        openMessages({ id: toast.id, name: toast.name, display_name: toast.display_name, picture_url: toast.picture_url });
        setToast(null);
      }}
    >
      {toast.picture_url
        ? <img src={toast.picture_url} alt={name} className="mt-avatar" />
        : <div className="mt-avatar mt-avatar-placeholder">{name[0]}</div>}
      <div className="mt-body">
        <p className="mt-name">{name}</p>
        <p className="mt-sub">sent you a message</p>
      </div>
      <button
        className="mt-close"
        title="Dismiss"
        onClick={e => { e.stopPropagation(); setToast(null); }}
      ><X size={14} /></button>
    </div>
  );
};

export default MessageToast;
