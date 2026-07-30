import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useChatHub } from '../contexts/ChatHubContext';
import { useAuth } from '../contexts/AuthContext';
import './ChatLauncher.css';

// ChatLauncher — the persistent way into ChatHub, bottom-right on every page.
//
// Messaging used to be a nav entry, which meant it was only reachable from the
// header (and only from the drawer below 1024px). A fixed launcher makes it
// reachable from anywhere, and lets the nav drop the entry entirely.
//
// The badge counts unread DMs only — MessageToast's poll is the sole unread
// signal in the app, and the API exposes nothing equivalent for groups or
// plans, so it under-reports rather than inventing a number.
const ChatLauncher = () => {
  const { isOpen, openChat, section, unreadCount } = useChatHub();
  const { isAuthenticated } = useAuth();

  // Hidden while the hub is open (the window has its own close button) and for
  // signed-out visitors, who have nothing to open.
  if (!isAuthenticated || isOpen) return null;

  const label = unreadCount > 0
    ? `Open chats (${unreadCount} unread)`
    : 'Open chats';

  return (
    <button
      className="cl-fab"
      onClick={() => openChat({ section })}
      title={label}
      aria-label={label}
    >
      <MessageCircle size={22} />
      {unreadCount > 0 && (
        <span className="cl-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
      )}
    </button>
  );
};

export default ChatLauncher;
