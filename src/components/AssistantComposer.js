import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { useAssistant } from '../contexts/AssistantContext';
import './AssistantComposer.css';

// AssistantComposer — the dashboard's front door to the Scheduling Assistant.
//
// The assistant is the product's whole point, but it had no presence on the
// home screen (UX_AUDIT.md §2.1): it lived behind a Calendar-page button and
// inside three popups, and its open conversations had no home anywhere.
//
// Typing here opens the docked assistant window with the text as the first
// message, reusing SchedulingAssistant's existing `initialMessage` path. Open
// plans are summarised as a single link into that window rather than listed
// here — a chip row stops working the moment someone has more than a few.
const AssistantComposer = () => {
  const [text,  setText]  = useState('');
  const [count, setCount] = useState(0);
  const { startChat, openAssistant } = useAssistant();
  const googleId = localStorage.getItem('googleUserId');

  // How many plans are in flight — just the count; the window owns the list.
  const loadCount = useCallback(async () => {
    if (!googleId) return;
    try {
      const r = await fetch(`/api/ai?op=conversations&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setCount(((await r.json()).conversations ?? []).length);
    } catch {}
  }, [googleId]);

  useEffect(() => { loadCount(); }, [loadCount]);

  const start = () => {
    const msg = text.trim();
    if (!msg) return;
    startChat(msg);
    setText('');
  };

  return (
    <div className="ac-wrap">
      <div className="ac-bar">
        <Sparkles size={17} className="ac-spark" />
        <input
          className="ac-input"
          type="text"
          placeholder="What are you planning? Try “dinner with Sam next week”"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') start(); }}
          aria-label="Ask the scheduling assistant"
        />
        <button className="ac-send" onClick={start} disabled={!text.trim()} title="Start planning">
          <Send size={15} />
        </button>
      </div>

      {count > 0 && (
        <button className="ac-open-link" onClick={openAssistant}>
          {count === 1 ? "You have 1 plan in the works" : `You have ${count} plans in the works`}
        </button>
      )}
    </div>
  );
};

export default AssistantComposer;
