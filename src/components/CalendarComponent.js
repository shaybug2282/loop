import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import { fetchCalendarEvents } from '../utils/googleCalendar';
import './CalendarComponent.css';

const CalendarComponent = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const calendarEvents = await fetchCalendarEvents();
      setEvents(calendarEvents);
    } catch (error) {
      console.error('Error loading events:', error);
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

  if (loading) {
    return (
      <div className="calendar-component">
        <div className="component-header">
          <CalendarIcon size={24} />
          <h2>Calendar</h2>
        </div>
        <div className="loading">Loading events...</div>
      </div>
    );
  }

  return (
    <div className="calendar-component">
      <div className="component-header">
        <CalendarIcon size={24} />
        <h2>Calendar</h2>
      </div>

      <div className="events-list">
        {events.length === 0 ? (
          <div className="empty-state">
            <CalendarIcon size={48} />
            <p>No upcoming events</p>
          </div>
        ) : (
          events.slice(0, 5).map((event) => (
            <div key={event.id} className="event-item">
              <div className="event-date">
                {formatDate(event.start.dateTime || event.start.date)}
              </div>
              <div className="event-details">
                <h3>{event.summary}</h3>
                {event.start.dateTime && (
                  <div className="event-time">
                    <Clock size={14} />
                    <span>
                      {formatTime(event.start.dateTime)} - {formatTime(event.end.dateTime)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {events.length > 5 && (
        <div className="view-more">
          <button>View All Events ({events.length})</button>
        </div>
      )}
    </div>
  );
};

export default CalendarComponent;
