import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader } from 'lucide-react';
import { fetchTodayEvents } from '../utils/googleCalendar';
import './AISummary.css';

// AI chat interface. User types any message; calendar events are injected as
// system context so the AI can answer schedule-aware questions naturally.
const AISummary = () => {
  const [messages,  setMessages]  = useState([]);   // { role: 'user'|'ai', text, id }
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [calCtx,    setCalCtx]    = useState(null); // cached calendar context string
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Lazily load today's calendar events as context (once per session)
  const getCalendarContext = async () => {
    if (calCtx !== null) return calCtx;
    try {
      const events = await fetchTodayEvents();
      if (!events.length) { setCalCtx(''); return ''; }
      const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const list = events.map(ev => {
        const time = ev.start.dateTime
          ? new Date(ev.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          : 'All day';
        const loc  = ev.location ? ` at ${ev.location}` : '';
        const desc = ev.description ? ` — ${ev.description.slice(0, 100)}` : '';
        return `- ${time}: ${ev.summary}${loc}${desc}`;
      }).join('\n');
      const ctx = `Today is ${date}.\n${list}`;
      setCalCtx(ctx);
      return ctx;
    } catch {
      setCalCtx('');
      return '';
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { id: Date.now(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const calendarContext = await getCalendarContext();
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, calendarContext: calendarContext || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI error');
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: data.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: `Sorry, something went wrong: ${err.message}`, isError: true }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="ai-summary-component">
      <div className="component-header">
        <Sparkles size={24} />
        <h2>AI Assistant</h2>
      </div>

      <div className="chat-body">
        {messages.length === 0 && (
          <p className="chat-hint">Ask me anything — I have access to your calendar.</p>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble-row ${msg.role}`}>
            <div className={`chat-bubble ${msg.isError ? 'error' : ''}`}>
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-bubble-row ai">
            <div className="chat-bubble typing">
              <Loader size={14} className="spinner" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          placeholder="Ask about your schedule, tasks, anything…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          disabled={loading}
        />
        <button className="chat-send" onClick={sendMessage} disabled={!input.trim() || loading}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

export default AISummary;
