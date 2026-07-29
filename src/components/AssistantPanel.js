import React, { useState, useEffect, useCallback } from 'react';
import { X, Minus, ArrowLeft } from 'lucide-react';
import { useAssistant } from '../contexts/AssistantContext';
import { useAuth } from '../contexts/AuthContext';
import SchedulingAssistant from './SchedulingAssistant';
import { formatMsgTime } from '../utils/format';
import './AssistantPanel.css';

// AssistantPanel — the docked scheduling window, alongside the DM and group
// panels rather than a modal.
//
// Open scheduling chats used to be either a chip row on the dashboard or a
// list inside a modal; both break down once a user has more than a handful,
// and clicking one landed on a list with nothing to type into. Here the chats
// are a scrollable list, and picking one enters a real conversation with the
// composer — SchedulingAssistant handles the thread itself once given an id.
const AssistantPanel = () => {
  const {
    isOpen, isMinimized, thread,
    openThread, backToChats, closeAssistant, toggleMinimize, startChat,
  } = useAssistant();
  const { isAuthenticated } = useAuth();

  const [convos,  setConvos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const googleId = localStorage.getItem('googleUserId');

  const loadConvos = useCallback(async () => {
    if (!googleId) { setLoading(false); return; }
    try {
      const r = await fetch(`/api/ai?op=conversations&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setConvos((await r.json()).conversations ?? []);
    } catch {}
    setLoading(false);
  }, [googleId]);

  // Refresh whenever the window returns to the chat list.
  useEffect(() => {
    if (isOpen && !thread) loadConvos();
  }, [isOpen, thread, loadConvos]);

  useEffect(() => {
    if (!isAuthenticated && isOpen) closeAssistant();
  }, [isAuthenticated, isOpen, closeAssistant]);

  if (!isOpen) return null;

  const inThread = Boolean(thread);
  const title = inThread ? 'Scheduling' : 'Your plans';

  return (
    <div className={`ap-panel${isMinimized ? ' minimized' : ''}`}>
      <div className="ap-header">
        {inThread && (
          <button className="ap-header-btn" onClick={backToChats} title="All chats">
            <ArrowLeft size={16} />
          </button>
        )}
        <span className="ap-header-title">{title}</span>
        <div className="ap-header-actions">
          <button
            className="ap-header-btn"
            onClick={toggleMinimize}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            <Minus size={16} />
          </button>
          <button className="ap-header-btn" onClick={closeAssistant} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="ap-body">
          {inThread ? (
            <SchedulingAssistant
              openConversationId={thread.id ?? null}
              initialMessage={thread.seed ?? null}
              startNew={!thread.id && !thread.seed}
              embedded
              onBack={backToChats}
              onBooked={loadConvos}
            />
          ) : (
            <div className="ap-list-wrap">
              {loading ? (
                <p className="ap-empty">Loading…</p>
              ) : convos.length === 0 ? (
                <p className="ap-empty">
                  Nothing being planned right now.<br />
                  Start one and I'll look at everyone's calendars.
                </p>
              ) : (
                <ul className="ap-list">
                  {convos.map(c => (
                    <li key={c.id}>
                      <button className="ap-item" onClick={() => openThread(c.id)}>
                        <span className="ap-item-main">
                          <span className="ap-item-title">{c.title}</span>
                          <span className="ap-item-time">{formatMsgTime(c.updated_at)}</span>
                        </span>
                        {c.pending_event_id && (
                          <span className="ap-item-note">Waiting on replies</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button className="ap-new" onClick={() => startChat(null)}>
                Plan something new
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AssistantPanel;
