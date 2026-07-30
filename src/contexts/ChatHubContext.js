import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ChatHubCtx = createContext(null);

// One context for every conversation surface in the app.
//
// There used to be three — MessagesContext (DMs), GroupChatContext and
// AssistantContext — each driving its own window docked in the bottom-right
// rail, plus six places that rendered SchedulingAssistant in a modal of their
// own. Same idea three and a half times over, and no way to get from one to
// another. ChatHub is a single centred window with three sections, and this
// holds which section it's showing and what it's pointed at.
//
// section: 'direct' | 'groups' | 'plans'
// target:  direct → a friend { id, name, display_name, picture_url }
//          groups → a group  { id, name, members, … }
//          plans  → { id } to open a saved thread, { seed } to start a new one
//                   pre-filled with that first message, or null for the list
export const ChatHubProvider = ({ children }) => {
  const [isOpen,  setIsOpen]  = useState(false);
  const [section, setSection] = useState('direct');
  const [target,  setTarget]  = useState(null);

  // Unread DM count, computed by MessageToast's background poll (the only
  // thing already polling conversations) and pushed here for the launcher
  // badge. Groups and plans have no unread signal in the API yet, so this
  // deliberately counts direct messages only.
  const [unreadCount, setUnreadCount] = useState(0);
  const recalcRef = useRef(null);

  // openChat — the one entry point. Callers say where the click came from and
  // land in the matching section: the scheduler opens on plans, a group opens
  // on groups, a friend on direct.
  const openChat = useCallback(({ section: s = 'direct', target: t = null } = {}) => {
    setSection(s);
    setTarget(t);
    setIsOpen(true);
  }, []);

  const openDirect = useCallback(friend => openChat({ section: 'direct', target: friend }), [openChat]);
  const openGroup  = useCallback(group  => openChat({ section: 'groups', target: group  }), [openChat]);
  const openPlans  = useCallback(t      => openChat({ section: 'plans',  target: t ?? null }), [openChat]);

  // startPlan — open a brand-new scheduling chat seeded with a first message.
  const startPlan = useCallback(seed => openChat({ section: 'plans', target: { seed } }), [openChat]);

  const closeChat = useCallback(() => setIsOpen(false), []);

  // Switching sections drops the open conversation — the target belongs to the
  // section it was opened from and means nothing in another one.
  const goToSection = useCallback(s => { setSection(s); setTarget(null); }, []);
  const clearTarget = useCallback(() => setTarget(null), []);

  // registerUnreadRecalc — MessageToast registers its recount so opening a
  // conversation can clear the badge immediately instead of on the next poll.
  const registerUnreadRecalc = useCallback(fn => { recalcRef.current = fn; }, []);
  const recalcUnread         = useCallback(() => recalcRef.current?.(), []);

  return (
    <ChatHubCtx.Provider value={{
      isOpen, section, target,
      openChat, openDirect, openGroup, openPlans, startPlan,
      closeChat, goToSection, clearTarget, setTarget,
      unreadCount, setUnreadCount, registerUnreadRecalc, recalcUnread,
    }}>
      {children}
    </ChatHubCtx.Provider>
  );
};

export const useChatHub = () => useContext(ChatHubCtx);
