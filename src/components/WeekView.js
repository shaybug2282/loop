import React, { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { fetchCalendarEvents } from '../utils/googleCalendar';
import EventPopup from './EventPopup';
import NewEventPopup from './NewEventPopup';
import './WeekView.css';

const SEEN_CONFIRMED_KEY = 'wv-confirmed-seen';

// readSeenConfirmed — returns the set of confirmed event ids the user has
// already seen highlighted (persisted so the highlight only fires once).
const readSeenConfirmed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_CONFIRMED_KEY) || '[]')); }
  catch { return new Set(); }
};

// GroupTag — the group marker on a tagged event block: the group's name in
// its color when it's short enough to fit the narrow day column, otherwise
// the group's picture (falling back to a truncated name pill if it has none).
const GroupTag = ({ group }) => {
  const fits = (group.name ?? '').length <= 12;
  if (!fits && group.icon_url) {
    return <img className="event-group-icon" src={group.icon_url} alt={group.name} title={group.name} />;
  }
  return (
    <span
      className="event-group-tag"
      style={{ borderColor: group.color, color: group.color }}
      title={group.name}
    >{group.name}</span>
  );
};

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// WeekView — the /calendar page body: a week grid or a month grid (toggle in
// the header) merging Google events with Loop app events. Clicking an event
// opens the universal EventPopup; clicking an empty day area opens the
// New event flow prefilled with that date.
const WeekView = () => {
  const [events,        setEvents]        = useState([]);
  const [pendingEvents, setPendingEvents] = useState([]);
  // Ids of app events confirmed since the user last looked — highlighted this session.
  const [newlyConfirmed, setNewlyConfirmed] = useState(new Set());
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [selected,      setSelected]      = useState(null); // display item open in the popup
  const [viewMode,      setViewMode]      = useState('week'); // 'week' | 'month'
  // Anchor date: the week's Sunday in week mode; any day inside the month in month mode.
  const [anchor,        setAnchor]        = useState(getStartOfWeek(new Date()));
  const [newEventDate,  setNewEventDate]  = useState(null); // 'YYYY-MM-DD' opens NewEventPopup prefilled
  const googleId = localStorage.getItem('googleUserId');

  function getStartOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  // visibleRange — [start, end) of days the current view shows. Month mode
  // covers a 6-week grid aligned to the week start, so leading/trailing days
  // from neighbor months render with their events too.
  const visibleRange = useCallback(() => {
    if (viewMode === 'week') {
      const start = getStartOfWeek(anchor);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return [start, end];
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = getStartOfWeek(first);
    const end = new Date(start);
    end.setDate(end.getDate() + 42);
    return [start, end];
  }, [viewMode, anchor]);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [rangeStart, rangeEnd] = visibleRange();

      const [weekEvents, pendingRes] = await Promise.all([
        fetchCalendarEvents(rangeStart.toISOString(), rangeEnd.toISOString()),
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
  }, [visibleRange, googleId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // navigate — move the anchor one step back/forward in the current view unit.
  const navigate = (dir) => {
    const d = new Date(anchor);
    if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir, 1);
    setAnchor(viewMode === 'week' ? getStartOfWeek(d) : d);
  };

  const goToToday = () => {
    setAnchor(viewMode === 'week' ? getStartOfWeek(new Date()) : new Date());
  };

  const getWeekDays = () => {
    const start = getStartOfWeek(anchor);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push(date);
    }
    return days;
  };

  // App events that belong on the calendar: declined/rescheduled plans are
  // removed entirely. A partial decline (someone dropped out but others are
  // still in) keeps the event live, so declines alone no longer hide it.
  const visibleAppEvents = pendingEvents.filter(
    e => !['declined', 'rescheduled'].includes(e.status)
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
        gEvent:   ev, // raw Google event for the universal popup
      }));

    // Calendar blocks stay minimal by design: time, title, and a
    // pending/confirmed flag. Participants and every other detail live in
    // the EventPopup, opened by clicking the block.
    const app = visibleAppEvents
      .filter(e => inDay(new Date(e.event_time)))
      .map(e => ({
        key:         `p-${e.id}`,
        start:       e.event_time,
        title:       e.title || 'Hangout',
        rainchecked: e.status === 'rainchecked',
        pending:     e.status === 'pending',
        confirmed:   e.status === 'accepted',
        isNew:       newlyConfirmed.has(e.id),
        group:       e.group ?? null, // group tag ({name,color,icon_url}) if the event is tagged
        appEvent:    e, // enriched Loop event for the universal popup
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

  // openNewEvent — empty-space click: schedule something on that day (past
  // days are ignored — you can't invite people to yesterday).
  const openNewEvent = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return;
    setNewEventDate(ymd(date));
  };

  const weekDays = getWeekDays();
  const headerLabel = (viewMode === 'week' ? getStartOfWeek(anchor) : anchor)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // monthCells — 6 weeks of days for the month grid.
  const monthCells = () => {
    const [start] = visibleRange();
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  if (loading) {
    return (
      <div className="week-view">
        <div className="week-header">
          <h2>Calendar</h2>
        </div>
        <div className="loading">Loading events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="week-view">
        <div className="week-header">
          <h2>Calendar</h2>
        </div>
        <div className="error-state">
          <p>{error}</p>
          <button onClick={loadEvents} className="retry-btn">
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
          <button onClick={() => navigate(-1)} className="nav-btn">
            <ChevronLeft size={20} />
          </button>
          <h2>{headerLabel}</h2>
          <button onClick={() => navigate(1)} className="nav-btn">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="week-actions">
          <div className="view-toggle">
            <button
              className={`view-toggle-btn${viewMode === 'week' ? ' active' : ''}`}
              onClick={() => setViewMode('week')}
            >Week</button>
            <button
              className={`view-toggle-btn${viewMode === 'month' ? ' active' : ''}`}
              onClick={() => setViewMode('month')}
            >Month</button>
          </div>
          <button onClick={goToToday} className="today-btn">Today</button>
          <button onClick={loadEvents} className="refresh-btn">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {viewMode === 'week' ? (
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
                <div
                  className="day-events"
                  onClick={e => { if (e.target === e.currentTarget) openNewEvent(day); }}
                  title="Click an empty spot to schedule something"
                >
                  {dayEvents.length === 0 ? (
                    <div
                      className="no-events"
                      onClick={() => openNewEvent(day)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') openNewEvent(day); }}
                    >No events<span className="no-events-add">+ Add</span></div>
                  ) : (
                    dayEvents.map(item => (
                      <div
                        key={item.key}
                        className={
                          'week-event' +
                          (item.pending ? ' week-event-pending' : '') +
                          (item.confirmed ? ' week-event-confirmed' : '') +
                          (item.rainchecked ? ' week-event-rainchecked' : '') +
                          (item.isNew ? ' week-event-new' : '')
                        }
                        onClick={() => setSelected(item)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(item); }}
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
                        {item.group && <GroupTag group={item.group} />}
                        {item.location && (
                          <div className="event-location"><MapPin size={11} /> {item.location}</div>
                        )}
                        {(item.pending || item.confirmed || item.rainchecked) && (
                          <div className={`event-badge ${item.rainchecked ? 'rainchecked' : item.pending ? 'pending' : 'confirmed'}`}>
                            {item.rainchecked ? 'Rain Checked' : item.pending ? 'Pending' : item.isNew ? 'Just confirmed' : 'Confirmed'}
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
      ) : (
        <div className="month-grid">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="month-dow">{d}</div>
          ))}
          {monthCells().map((day, i) => {
            const dayEvents = getEventsForDay(day);
            const inMonth   = day.getMonth() === anchor.getMonth();
            const shown     = dayEvents.slice(0, 3);
            return (
              <div
                key={i}
                className={`month-cell${inMonth ? '' : ' outside'}${isToday(day) ? ' today' : ''}`}
                onClick={e => { if (e.target === e.currentTarget) openNewEvent(day); }}
              >
                <span className="month-daynum" onClick={() => openNewEvent(day)}>{day.getDate()}</span>
                {shown.map(item => (
                  <button
                    key={item.key}
                    className={
                      'month-chip' +
                      (item.pending ? ' pending' : '') +
                      (item.confirmed ? ' confirmed' : '') +
                      (item.rainchecked ? ' rainchecked' : '')
                    }
                    title={`${item.allDay ? 'All day' : formatTime(item.start)} · ${item.title}`}
                    onClick={() => setSelected(item)}
                  >
                    {item.title || '(no title)'}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="month-more">+{dayEvents.length - 3} more</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <EventPopup
          googleEvent={selected.gEvent ?? null}
          loopEvent={selected.appEvent ?? null}
          onClose={() => setSelected(null)}
          onChanged={loadEvents}
        />
      )}

      {newEventDate && (
        <NewEventPopup
          initialDate={newEventDate}
          onClose={() => setNewEventDate(null)}
          onCreated={loadEvents}
        />
      )}
    </div>
  );
};

export default WeekView;
