import React, { createContext, useContext, useState, useCallback } from 'react';

const MessagesCtx = createContext(null);

export const MessagesProvider = ({ children }) => {
  const [isOpen,      setIsOpen]      = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [friend,      setFriend]      = useState(null);

  // Opens the panel. Pass a friend object to jump straight into that conversation.
  const openMessages = useCallback((f = null) => {
    setFriend(f ?? null);
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const closeMessages  = useCallback(() => { setIsOpen(false); setFriend(null); }, []);
  const toggleMinimize = useCallback(() => setIsMinimized(v => !v), []);
  const goToList       = useCallback(() => setFriend(null), []);

  return (
    <MessagesCtx.Provider value={{
      isOpen, isMinimized, friend,
      openMessages, closeMessages, toggleMinimize, goToList,
    }}>
      {children}
    </MessagesCtx.Provider>
  );
};

export const useMessages = () => useContext(MessagesCtx);
