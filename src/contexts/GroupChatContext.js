import React, { createContext, useContext, useState, useCallback } from 'react';

const GroupChatCtx = createContext(null);

export const GroupChatProvider = ({ children }) => {
  const [chatGroup, setChatGroup] = useState(null); // { id, name, color, members }

  const openGroupChat  = useCallback(group => setChatGroup(group), []);
  const closeGroupChat = useCallback(() => setChatGroup(null), []);

  return (
    <GroupChatCtx.Provider value={{ chatGroup, openGroupChat, closeGroupChat }}>
      {children}
    </GroupChatCtx.Provider>
  );
};

export const useGroupChat = () => useContext(GroupChatCtx);
