import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, RefreshCw } from 'lucide-react';
import { fetchTodayEvents } from '../utils/googleCalendar';
import './CalendarComponent.css';

const CalendarComponent = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const todayEvents = await fetchTodayEvents();
      setEvents(todayEvents);
    } catch (error) {
      console.error('Error loading events:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getTodayDate = () => {
    const today = new Date();
    return today.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="calendar-component">
        <div className="component-header">
          <CalendarIcon size={24} />
          <h2>Today's Schedule</h2>
        </div>
        <div className="loading">Loading today's events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="calendar-component">
        <div className="component-header">
          <CalendarIcon size={24} />
          <h2>Today's Schedule</h2>
        </div>
        <div className="error-state">
          <p>{error}</p>
          <button onClick={loadEvents} className="retry-btn">
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="calendar-component">
      <div className="component-header">
        <CalendarIcon size={24} />
        <h2>Today's Schedule</h2>
        <button onClick={loadEvents} className="refresh-btn" title="Refresh">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="today-date">{getTodayDate()}</div>

      <div className="events-list">
        {events.length === 0 ? (
          <div className="empty-state">
            <CalendarIcon size={48} />
            <p>No events scheduled for today</p>
            <small>Enjoy your free time!</small>
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="event-item">
              <div className="event-time-badge">
                {event.start.dateTime ? (
                  <>
                    <Clock size={14} />
                    <span>{formatTime(event.start.dateTime)}</span>
                  </>
                ) : (
                  <span className="all-day">All Day</span>
                )}
              </div>
              <div className="event-details">
                <h3>{event.summary}</h3>
                {event.location && (
                  <p className="event-location">📍 {event.location}</p>
                )}
                {event.description && (
                  <p className="event-description">{event.description}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CalendarComponent;
