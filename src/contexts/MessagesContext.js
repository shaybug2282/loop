import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const MessagesCtx = createContext(null);

export const MessagesProvider = ({ children }) => {
  const [isOpen,      setIsOpen]      = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [friend,      setFriend]      = useState(null);
  // Unread conversation count for the sidebar badge — computed by
  // MessageToast's background poll (the only place already polling
  // conversations), pushed here so any component can render it.
  const [unreadCount, setUnreadCount] = useState(0);
  const recalcRef = useRef(null);

  // Opens the panel. Pass a friend object to jump straight into that conversation.
  const openMessages = useCallback((f = null) => {
    setFriend(f ?? null);
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const closeMessages  = useCallback(() => { setIsOpen(false); setFriend(null); }, []);
  const toggleMinimize = useCallback(() => setIsMinimized(v => !v), []);
  const goToList       = useCallback(() => setFriend(null), []);

  // registerUnreadRecalc — MessageToast registers its recount here so opening
  // a conversation can clear the badge immediately instead of on the next poll.
  const registerUnreadRecalc = useCallback(fn => { recalcRef.current = fn; }, []);
  const recalcUnread         = useCallback(() => recalcRef.current?.(), []);

  return (
    <MessagesCtx.Provider value={{
      isOpen, isMinimized, friend,
      openMessages, closeMessages, toggleMinimize, goToList,
      unreadCount, setUnreadCount, registerUnreadRecalc, recalcUnread,
    }}>
      {children}
    </MessagesCtx.Provider>
  );
};

export const useMessages = () => useContext(MessagesCtx);
