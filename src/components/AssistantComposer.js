import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Send, MessageSquare } from 'lucide-react';
import SchedulingAssistant from './SchedulingAssistant';
import './AssistantComposer.css';

// AssistantComposer — the dashboard's front door to the Scheduling Assistant.
//
// The assistant is the product's whole point, but it had no presence on the
// home screen (UX_AUDIT.md §2.1): it lived behind a Calendar-page button and
// inside three popups, and its persistent conversation list had no home
// anywhere. A user who signed in off the landing page's "say 'dinner with Sam
// next week'" promise landed somewhere with no way to say that.
//
// Typing here opens the assistant seeded with the text, reusing the existing
// `initialMessage` prop — no new AI logic. Open scheduling chats surface as
// chips beside the input so they are reachable in one click.
//
// out: a composer row, plus the assistant modal once opened.
const AssistantComposer = () => {
  const [text,   setText]   = useState('');
  const [seed,   setSeed]   = useState(null);  // message the assistant opens with
  const [open,   setOpen]   = useState(false);
  const [convos, setConvos] = useState([]);
  const googleId = localStorage.getItem('googleUserId');

  // loadConvos — open scheduling chats, newest first. The server retires a
  // conversation once its event is confirmed or declined, so this self-prunes.
  const loadConvos = useCallback(async () => {
    if (!googleId) return;
    try {
      const r = await fetch(`/api/ai?op=conversations&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setConvos((await r.json()).conversations ?? []);
    } catch {}
  }, [googleId]);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  const start = () => {
    const msg = text.trim();
    if (!msg) return;
    setSeed(msg);
    setOpen(true);
    setText('');
  };

  // Opening with no seed lands on the assistant's conversation list.
  const openList = () => { setSeed(null); setOpen(true); };

  const close = () => { setOpen(false); setSeed(null); loadConvos(); };

  return (
    <div className="ac-wrap">
      <div className="ac-bar">
        <Sparkles size={17} className="ac-spark" />
        <input
          className="ac-input"
          type="text"
          placeholder="Find a time — e.g. dinner with Sam next week…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') start(); }}
          aria-label="Ask the scheduling assistant"
        />
        <button className="ac-send" onClick={start} disabled={!text.trim()} title="Ask the assistant">
          <Send size={15} />
        </button>
      </div>

      {convos.length > 0 && (
        <div className="ac-chips">
          <span className="ac-chips-label">Open chats</span>
          {convos.slice(0, 4).map(c => (
            <button key={c.id} className="ac-chip" onClick={openList} title={c.title}>
              <MessageSquare size={12} />
              <span className="ac-chip-text">{c.title}</span>
              {c.pending_event_id && <span className="ac-chip-dot" title="Event pending" />}
            </button>
          ))}
          {convos.length > 4 && (
            <button className="ac-chip ac-chip-more" onClick={openList}>
              +{convos.length - 4} more
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="ac-backdrop" onClick={close}>
          <div className="ac-modal" onClick={e => e.stopPropagation()}>
            {/* SchedulingAssistant renders its own close control from onClose. */}
            <SchedulingAssistant initialMessage={seed} onClose={close} onBooked={loadConvos} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AssistantComposer;
