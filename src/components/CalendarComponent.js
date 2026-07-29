import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Clock, RefreshCw, MapPin } from 'lucide-react';
import { fetchTodayEvents } from '../utils/googleCalendar';
import EventPopup from './EventPopup';
import { Panel, PanelHeader } from './Panel';
import './CalendarComponent.css';
const CalendarComponent = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // event open in the popup
  const navigate = useNavigate();
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
      <Panel className="calendar-component">
        <PanelHeader icon={CalendarIcon} title="Today's Schedule" subtitle="Confirmed on your calendar" />
        <div className="cc-body"><div className="loading">Loading today's events…</div></div>
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel className="calendar-component">
        <PanelHeader icon={CalendarIcon} title="Today's Schedule" subtitle="Confirmed on your calendar" />
        <div className="cc-body">
        <div className="error-state">
          <p>{error}</p>
          <button onClick={loadEvents} className="retry-btn">
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
        </div>
      </Panel>
    );
  }
  return (
    <Panel className="calendar-component">
      <PanelHeader
        icon={CalendarIcon}
        title="Today's Schedule"
        subtitle="Confirmed on your calendar"
        onActivate={() => navigate('/calendar')}
        activateLabel="Open calendar"
      >
        <button onClick={loadEvents} className="panel-icon-btn" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </PanelHeader>
      <div className="cc-body">
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
            <div
              key={event.id}
              className="event-item event-item-click"
              onClick={() => setSelected(event)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(event); }}
            >
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
                  <p className="event-location"><MapPin size={13} /> {event.location}</p>
                )}
                {event.description && (
                  <p className="event-description">
                    {event.description.length > 100
                      ? `${event.description.slice(0, 75)}…`
                      : event.description}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      </div>
      {selected && (
        <EventPopup
          googleEvent={selected}
          onClose={() => setSelected(null)}
          onChanged={loadEvents}
        />
      )}
    </Panel>
  );
};
export default CalendarComponent;
