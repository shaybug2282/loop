import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { useChatHub } from '../contexts/ChatHubContext';
import { useAuth } from '../contexts/AuthContext';
import { DirectList, DirectPane } from './ChatDirect';
import { GroupList, GroupPane }   from './ChatGroups';
import { PlansList }              from './ChatPlans';
import SchedulingAssistant        from './SchedulingAssistant';
import './ChatHub.css';

const SECTIONS = [
  { key: 'direct', label: 'Direct' },
  { key: 'groups', label: 'Groups' },
  { key: 'plans',  label: 'Plans'  },
];

// ChatHub — every conversation in the app in one centred window.
//
// This replaces three separate docked panels (DMs, group chat, scheduling) that
// shared a bottom-right rail, plus six one-off SchedulingAssistant modals. They
// were the same interaction three and a half times over, each too narrow to
// read comfortably and each with its own way in. Here the section rail is the
// only navigation, and every entry point in the app lands on the right section
// with the right thread already open.
//
// Only the active section mounts: the DM section derives an ECDH key and polls
// every 3s, groups poll every 8s, and paying for all of that to look at one of
// them was the main cost of the old three-window arrangement.
const ChatHub = () => {
  const {
    isOpen, section, target,
    closeChat, goToSection, setTarget, clearTarget, recalcUnread,
  } = useChatHub();
  const { isAuthenticated } = useAuth();

  // Bumped after a booking so the plans list refreshes in place.
  const [plansVersion, setPlansVersion] = useState(0);
  const onBooked = useCallback(() => setPlansVersion(v => v + 1), []);

  // Close on sign-out and on Escape.
  useEffect(() => {
    if (!isAuthenticated && isOpen) closeChat();
  }, [isAuthenticated, isOpen, closeChat]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = e => {
      if (e.key !== 'Escape') return;
      // The message context menu binds Escape too, and both listeners sit on
      // document, so stopPropagation between them does nothing. Yield to it:
      // Escape should dismiss the menu, not the whole window underneath it.
      if (document.querySelector('.mp-ctx')) return;
      closeChat();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, closeChat]);

  if (!isOpen) return null;

  // The pane title doubles as the "which thread" cue, so it names the thread
  // when one is open and the section otherwise.
  const paneTitle = (() => {
    if (section === 'direct') return target ? (target.display_name || target.name) : 'Messages';
    if (section === 'groups') return target ? target.name : 'Groups';
    if (!target) return 'Your plans';
    return target.group ? `Scheduling ${target.group.name}` : 'Scheduling';
  })();

  const list = (() => {
    if (section === 'direct') {
      return (
        <DirectList
          activeId={target?.id}
          onSelect={c => setTarget({
            id:           c.userId ?? c.id,
            name:         c.name,
            display_name: c.display_name,
            picture_url:  c.picture_url,
          })}
        />
      );
    }
    if (section === 'groups') {
      return <GroupList activeId={target?.id} onSelect={g => setTarget(g)} />;
    }
    return (
      <PlansList
        activeId={target?.id}
        reloadKey={plansVersion}
        onSelect={id => setTarget({ id })}
        onNew={() => setTarget({ newChat: true })}
      />
    );
  })();

  const pane = (() => {
    if (section === 'direct') {
      return target
        ? <DirectPane friend={target} onRead={recalcUnread} />
        : <p className="ch-pane-empty">Pick a conversation, or start a new one.</p>;
    }
    if (section === 'groups') {
      return target
        ? <GroupPane key={target.id} group={target} />
        : <p className="ch-pane-empty">Pick a group to open its chat.</p>;
    }
    if (!target) return <p className="ch-pane-empty">Pick a plan, or start something new.</p>;
    // `group` is its own mode in SchedulingAssistant: the backend gets the
    // groupId with every message and schedules for all accepted members.
    return (
      <SchedulingAssistant
        key={target.id ?? target.group?.id ?? target.seed ?? 'new'}
        group={target.group ?? null}
        openConversationId={target.id ?? null}
        initialMessage={target.seed ?? null}
        startNew={!target.id && !target.seed && !target.group}
        embedded
        onBack={clearTarget}
        onBooked={onBooked}
      />
    );
  })();

  return (
    <div className="ch-backdrop" onClick={closeChat}>
      {/* `inThread` drives the small-screen single-pane view: the list is the
          whole sheet until a thread is picked, then the thread is. */}
      <div
        className={`ch-window${target ? ' in-thread' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Chats"
        onClick={e => e.stopPropagation()}
      >
        <aside className="ch-side">
          <div className="ch-side-head">
            <span className="ch-side-title">Chats</span>
            {/* Small screens hide the pane (and its close button) while the
                list is showing, so the rail carries its own way out. */}
            <button className="ch-icon-btn ch-side-close" onClick={closeChat} title="Close" aria-label="Close chats">
              <X size={18} />
            </button>
          </div>
          <div className="ch-sections" role="tablist" aria-label="Chat sections">
            {SECTIONS.map(s => (
              <button
                key={s.key}
                role="tab"
                aria-selected={section === s.key}
                className={`ch-section-btn${section === s.key ? ' active' : ''}`}
                onClick={() => goToSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="ch-list">{list}</div>
        </aside>

        <section className="ch-pane">
          <div className="ch-pane-head">
            {target && (
              <button className="ch-icon-btn ch-back" onClick={clearTarget} title="Back to list">
                <ArrowLeft size={16} />
              </button>
            )}
            <span className="ch-pane-title">{paneTitle}</span>
            <button className="ch-icon-btn" onClick={closeChat} title="Close" aria-label="Close chats">
              <X size={18} />
            </button>
          </div>
          <div className="ch-pane-body">{pane}</div>
        </section>
      </div>
    </div>
  );
};

export default ChatHub;
