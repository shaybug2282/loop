import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchWeekEvents } from '../utils/googleCalendar';
import './WeekView.css';

const WeekView = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(new Date()));

  useEffect(() => {
    loadEvents();
  }, [currentWeekStart]);

  function getStartOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const endOfWeek = new Date(currentWeekStart);
      endOfWeek.setDate(currentWeekStart.getDate() + 7);
      
      const weekEvents = await fetchWeekEvents();
      setEvents(weekEvents);
    } catch (error) {
      console.error('Error loading events:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const previousWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(currentWeekStart.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(currentWeekStart.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  const goToToday = () => {
    setCurrentWeekStart(getStartOfWeek(new Date()));
  };

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const getEventsForDay = (date) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return events.filter(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      return eventStart >= dayStart && eventStart <= dayEnd;
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

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const weekDays = getWeekDays();
  const monthYear = currentWeekStart.toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  if (loading) {
    return (
      <div className="week-view">
        <div className="week-header">
          <h2>Week View</h2>
        </div>
        <div className="loading">Loading week events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="week-view">
        <div className="week-header">
          <h2>Week View</h2>
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
    <div className="week-view">
      <div className="week-header">
        <div className="week-nav">
          <button onClick={previousWeek} className="nav-btn">
            <ChevronLeft size={20} />
          </button>
          <h2>{monthYear}</h2>
          <button onClick={nextWeek} className="nav-btn">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="week-actions">
          <button onClick={goToToday} className="today-btn">Today</button>
          <button onClick={loadEvents} className="refresh-btn">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="week-grid">
        {weekDays.map((day, index) => {
          const dayEvents = getEventsForDay(day);
          const todayClass = isToday(day) ? 'today' : '';

          return (
            <div key={index} className={`day-column ${todayClass}`}>
              <div className="day-header">
                <div className="day-name">
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="day-number">
                  {day.getDate()}
                </div>
              </div>
              <div className="day-events">
                {dayEvents.length === 0 ? (
                  <div className="no-events">No events</div>
                ) : (
                  dayEvents.map(event => (
                    <div key={event.id} className="week-event">
                      {event.start.dateTime ? (
                        <div className="event-time">
                          <Clock size={12} />
                          {formatTime(event.start.dateTime)}
                        </div>
                      ) : (
                        <div className="event-time all-day">All Day</div>
                      )}
                      <div className="event-title">{event.summary}</div>
                      {event.location && (
                        <div className="event-location">📍 {event.location}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeekView;
