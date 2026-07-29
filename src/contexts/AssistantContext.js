import React, { createContext, useContext, useState, useCallback } from 'react';

const AssistantCtx = createContext(null);

// Holds the docked assistant window's open/minimised state and which thread it
// is showing, so the dashboard composer, the chat list and anywhere else can
// drive one shared window instead of each opening its own modal.
export const AssistantProvider = ({ children }) => {
  const [isOpen,      setIsOpen]      = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  // Which thread the window shows: null = the list of open chats,
  // a string id = that conversation, { seed } = a new chat pre-filled.
  const [thread,      setThread]      = useState(null);

  // openAssistant — show the list of open chats.
  const openAssistant = useCallback(() => {
    setThread(null);
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  // openThread — jump straight into an existing conversation.
  const openThread = useCallback((id) => {
    setThread({ id });
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  // startChat — open a brand-new chat seeded with the user's first message.
  const startChat = useCallback((seed) => {
    setThread({ seed });
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const closeAssistant = useCallback(() => { setIsOpen(false); setThread(null); }, []);
  const backToChats    = useCallback(() => setThread(null), []);
  const toggleMinimize = useCallback(() => setIsMinimized(v => !v), []);

  return (
    <AssistantCtx.Provider value={{
      isOpen, isMinimized, thread,
      openAssistant, openThread, startChat, closeAssistant, backToChats, toggleMinimize,
    }}>
      {children}
    </AssistantCtx.Provider>
  );
};

export const useAssistant = () => useContext(AssistantCtx);
