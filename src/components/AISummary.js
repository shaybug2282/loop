import React, { useState } from 'react';
import { Sparkles, Loader } from 'lucide-react';
import { fetchTodayEvents } from '../utils/googleCalendar';
import './AISummary.css';

const AISummary = () => {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      setSummary('');

      // Fetch today's events from Google Calendar
      const events = await fetchTodayEvents();

      if (events.length === 0) {
        setSummary("You have no events scheduled for today. Enjoy your free time!");
        setLoading(false);
        return;
      }

      // Format events for Claude
      const eventList = events.map(event => {
        const time = event.start.dateTime 
          ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          : 'All day';
        return `- ${time}: ${event.summary}${event.location ? ` at ${event.location}` : ''}`;
      }).join('\n');

      // Call Claude API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.REACT_APP_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Summarize this daily schedule in a friendly, helpful way. Keep it concise (2-3 sentences). Here's what's scheduled for today:\n\n${eventList}`
          }]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      const aiSummary = data.content[0].text;
      setSummary(aiSummary);

    } catch (err) {
      console.error('Error generating summary:', err);
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
          <button onClick={generateSummary} className="retry-btn">
            Try Again
          </button>
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
