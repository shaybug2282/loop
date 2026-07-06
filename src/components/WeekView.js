import React, { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchCalendarEvents } from '../utils/googleCalendar';
import './WeekView.css';

const SEEN_CONFIRMED_KEY = 'wv-confirmed-seen';

// readSeenConfirmed — returns the set of confirmed event ids the user has
// already seen highlighted (persisted so the highlight only fires once).
const readSeenConfirmed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_CONFIRMED_KEY) || '[]')); }
  catch { return new Set(); }
};

const WeekView = () => {
  const [events,        setEvents]        = useState([]);
  const [pendingEvents, setPendingEvents] = useState([]);
  // Ids of app events confirmed since the user last looked — highlighted this session.
  const [newlyConfirmed, setNewlyConfirmed] = useState(new Set());
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(new Date()));
  const googleId = localStorage.getItem('googleUserId');

  function getStartOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const [weekEvents, pendingRes] = await Promise.all([
        fetchCalendarEvents(currentWeekStart.toISOString(), weekEnd.toISOString()),
        googleId
          ? fetch(`/api/schedule?op=pending-events&googleId=${encodeURIComponent(googleId)}`)
              .then(r => r.ok ? r.json() : { events: [] })
              .catch(() => ({ events: [] }))
          : { events: [] },
      ]);

      const appEvents = pendingRes.events ?? [];

      // Confirmed events the user hasn't seen confirmed yet get highlighted;
      // mark them seen immediately so the highlight lasts one session only.
      const seen  = readSeenConfirmed();
      const fresh = appEvents.filter(e => e.status === 'accepted' && !seen.has(e.id)).map(e => e.id);
      if (fresh.length) {
        fresh.forEach(id => seen.add(id));
        try { localStorage.setItem(SEEN_CONFIRMED_KEY, JSON.stringify([...seen])); } catch {}
        setNewlyConfirmed(prev => new Set([...prev, ...fresh]));
      }

      setEvents(weekEvents);
      setPendingEvents(appEvents);
    } catch (error) {
      console.error('Error loading events:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart, googleId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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

  // App events that belong on the calendar: declined plans are removed entirely.
  const visibleAppEvents = pendingEvents.filter(
    e => e.status !== 'declined' && !(e.declines ?? []).length
  );

  // isAppCopy — true when a Google Calendar event is the synced copy of one of
  // our own confirmed events, matched by stored google_event_id or (for rows
  // created before migration 006) by identical start time + "Hangout!" summary.
  const appGoogleIds = new Set(pendingEvents.map(e => e.google_event_id).filter(Boolean));
  const legacyConfirmedTimes = new Set(
    pendingEvents
      .filter(e => e.status === 'accepted' && !e.google_event_id)
      .map(e => new Date(e.event_time).getTime())
  );
  const isAppCopy = (gEvent) => {
    if (appGoogleIds.has(gEvent.id)) return true;
    if (!gEvent.start?.dateTime || !/Hangout!$/.test(gEvent.summary ?? '')) return false;
    return legacyConfirmedTimes.has(new Date(gEvent.start.dateTime).getTime());
  };

  // getEventsForDay — merge Google + app events for one day into a single
  // chronologically sorted list of uniform display items, with app copies
  // deduped out of the Google feed.
  const getEventsForDay = (date) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    const inDay = (d) => d >= dayStart && d <= dayEnd;

    const gcal = events
      .filter(ev => !isAppCopy(ev) && inDay(new Date(ev.start.dateTime || ev.start.date)))
      .map(ev => ({
        key:      `g-${ev.id}`,
        start:    ev.start.dateTime || ev.start.date,
        allDay:   !ev.start.dateTime,
        title:    ev.summary,
        location: ev.location,
      }));

    const app = visibleAppEvents
      .filter(e => inDay(new Date(e.event_time)))
      .map(e => ({
        key:       `p-${e.id}`,
        start:     e.event_time,
        title:     'Hangout',
        with:      e.isCreator
          ? (e.invitedUsers ?? []).map(u => u.display_name || u.name).filter(Boolean).join(', ')
          : e.creator?.display_name || e.creator?.name || '',
        pending:   e.status !== 'accepted',
        confirmed: e.status === 'accepted',
        isNew:     newlyConfirmed.has(e.id),
      }));

    return [...gcal, ...app].sort((a, b) => new Date(a.start) - new Date(b.start));
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
          const dayEvents  = getEventsForDay(day);
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
                  dayEvents.map(item => (
                    <div
                      key={item.key}
                      className={
                        'week-event' +
                        (item.pending ? ' week-event-pending' : '') +
                        (item.confirmed ? ' week-event-confirmed' : '') +
                        (item.isNew ? ' week-event-new' : '')
                      }
                    >
                      {item.allDay ? (
                        <div className="event-time all-day">All Day</div>
                      ) : (
                        <div className="event-time">
                          <Clock size={12} />
                          {formatTime(item.start)}
                        </div>
                      )}
                      <div className="event-title">{item.title}</div>
                      {item.location && (
                        <div className="event-location">📍 {item.location}</div>
                      )}
                      {item.with && (
                        <div className="event-location">with {item.with}</div>
                      )}
                      {(item.pending || item.confirmed) && (
                        <div className={`event-badge ${item.pending ? 'pending' : 'confirmed'}`}>
                          {item.pending ? 'Pending' : item.isNew ? 'Just confirmed' : 'Confirmed'}
                        </div>
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
