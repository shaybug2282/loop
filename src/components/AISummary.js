import React, { useState } from 'react';
import { Sparkles, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchTodayEvents } from '../utils/googleCalendar';
import './AISummary.css';

const AISummary = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAuthError, setIsAuthError] = useState(false);

  const generateSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      setIsAuthError(false);
      setSummary('');

      // Fetch today's events from Google Calendar
      const events = await fetchTodayEvents();

      if (events.length === 0) {
        setSummary("You have no events scheduled for today. Enjoy your free time!");
        setLoading(false);
        return;
      }

      // Format events for Claude, including description when available
      const eventList = events.map(event => {
        const time = event.start.dateTime
          ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          : 'All day';
        const location = event.location ? ` at ${event.location}` : '';
        const description = event.description ? ` — ${event.description.slice(0, 120)}` : '';
        return `- ${time}: ${event.summary}${location}${description}`;
      }).join('\n');

      const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      // Call our serverless function instead of Anthropic API directly
      const response = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: eventList,
          date
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to generate summary');
      }

      const data = await response.json();
      setSummary(data.summary);

    } catch (err) {
      console.error('Error generating summary:', err);
      const authFailed = err.message.includes('Authentication expired') || err.message.includes('No access token');
      setIsAuthError(authFailed);
      setError(err.message || 'Failed to generate summary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-summary-component">
      <div className="component-header">
        <Sparkles size={24} />
        <h2>AI Day Summary</h2>
      </div>

      {!summary && !loading && !error && (
        <div className="summary-prompt">
          <p>Get an AI-powered summary of your day</p>
          <button onClick={generateSummary} className="generate-btn">
            <Sparkles size={18} />
            Generate Summary
          </button>
        </div>
      )}

      {loading && (
        <div className="summary-loading">
          <Loader size={24} className="spinner" />
          <p>Analyzing your schedule...</p>
        </div>
      )}

      {error && (
        <div className="summary-error">
          <p>{error}</p>
          {isAuthError
            ? <button onClick={() => navigate('/login')} className="retry-btn">Log in again</button>
            : <button onClick={generateSummary} className="retry-btn">Try Again</button>
          }
        </div>
      )}

      {summary && !loading && (
        <div className="summary-content">
          <div className="summary-text">{summary}</div>
          <button onClick={generateSummary} className="regenerate-btn">
            <Sparkles size={16} />
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
};

export default AISummary;
