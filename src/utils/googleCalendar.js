const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const TASKS_API_URL = 'https://tasks.googleapis.com/tasks/v1';

// Access tokens are minted server-side (/api/user?op=google-token refreshes
// them from the stored refresh token) and only cached here in module memory —
// never in localStorage. The session cookie authenticates the endpoint.
let tokenCache = { token: null, expiresAt: 0 };
let tokenInflight = null;

// getValidToken — a Google access token valid for at least the next minute.
// Deduplicates concurrent callers onto one in-flight fetch. Throws when the
// user is signed out or their Google authorization has been revoked.
export const getValidToken = async () => {
  if (tokenCache.token && tokenCache.expiresAt - 60_000 > Date.now()) return tokenCache.token;

  if (!tokenInflight) {
    tokenInflight = (async () => {
      const r = await fetch('/api/user?op=google-token');
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Authentication expired. Please log in again.');
      tokenCache = {
        token:     data.accessToken,
        expiresAt: data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 5 * 60 * 1000,
      };
      return tokenCache.token;
    })().finally(() => { tokenInflight = null; });
  }
  return tokenInflight;
};

// Drop the cached token (call on logout, or after a Google 401).
export const clearTokenCache = () => {
  tokenCache = { token: null, expiresAt: 0 };
};

// Fetch events for a specific date range
export const fetchCalendarEvents = async (timeMin = null, timeMax = null) => {
  const accessToken = await getValidToken();

  try {
    const startTime = timeMin || new Date().toISOString();
    const endTime = timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const response = await fetch(
      `${CALENDAR_API_URL}/calendars/primary/events?timeMin=${startTime}&timeMax=${endTime}&singleEvents=true&orderBy=startTime`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        clearTokenCache();
        throw new Error('Authentication expired. Please log in again.');
      }
      throw new Error('Failed to fetch calendar events');
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }
};

// Fetch today's events only
export const fetchTodayEvents = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return await fetchCalendarEvents(today.toISOString(), tomorrow.toISOString());
};

// Fetch Google Tasks
export const fetchGoogleTasks = async () => {
  const accessToken = await getValidToken();

  try {
    const listsResponse = await fetch(
      `${TASKS_API_URL}/users/@me/lists`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!listsResponse.ok) {
      if (listsResponse.status === 401) {
        clearTokenCache();
        throw new Error('Authentication expired. Please log in again.');
      }
      throw new Error('Failed to fetch task lists');
    }

    const listsData = await listsResponse.json();
    const taskLists = listsData.items || [];

    const allTasks = [];
    for (const list of taskLists) {
      const tasksResponse = await fetch(
        `${TASKS_API_URL}/lists/${list.id}/tasks`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        const tasks = (tasksData.items || []).map(task => ({
          id: task.id,
          text: task.title,
          completed: task.status === 'completed',
          listId: list.id,
          listName: list.title,
          due: task.due,
          notes: task.notes,
          fromGoogle: true
        }));
        allTasks.push(...tasks);
      }
    }

    return allTasks;
  } catch (error) {
    console.error('Error fetching Google Tasks:', error);
    return [];
  }
};

// Create a Google Task on the user's default list ('@default').
// in: title string. out: the created task mapped to the widget shape.
export const createGoogleTask = async (title) => {
  const accessToken = await getValidToken();

  const response = await fetch(
    `${TASKS_API_URL}/lists/@default/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to create Google Task');
  }

  const task = await response.json();
  return {
    id: task.id,
    text: task.title,
    completed: false,
    listId: '@default',
    listName: 'My Tasks',
    due: task.due,
    notes: task.notes,
    fromGoogle: true,
  };
};

// Update a Google Task
export const updateGoogleTask = async (listId, taskId, updates) => {
  const accessToken = await getValidToken();

  try {
    const response = await fetch(
      `${TASKS_API_URL}/lists/${listId}/tasks/${taskId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: updates.text,
          status: updates.completed ? 'completed' : 'needsAction'
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to update Google Task');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating Google Task:', error);
    throw error;
  }
};

// Delete a Google Task
export const deleteGoogleTask = async (listId, taskId) => {
  const accessToken = await getValidToken();

  try {
    const response = await fetch(
      `${TASKS_API_URL}/lists/${listId}/tasks/${taskId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete Google Task');
    }

    return true;
  } catch (error) {
    console.error('Error deleting Google Task:', error);
    throw error;
  }
};

// Patch an event on the primary calendar. sendUpdates=all makes Google email
// an updated invitation to every attendee. Returns the updated event object.
export const updateCalendarEvent = async (eventId, patch) => {
  const accessToken = await getValidToken();

  const response = await fetch(
    `${CALENDAR_API_URL}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to update calendar event');
  }

  return await response.json();
};

// Delete an event from the primary calendar. sendUpdates=all makes Google
// email every attendee that the event was cancelled. A 410 (already gone)
// is treated as success since the end state — the event no longer exists —
// is what the caller wants.
export const deleteCalendarEvent = async (eventId) => {
  const accessToken = await getValidToken();

  const response = await fetch(
    `${CALENDAR_API_URL}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok && response.status !== 410) {
    throw new Error('Failed to delete calendar event');
  }
};

export const createCalendarEvent = async (eventData) => {
  const accessToken = await getValidToken();

  try {
    const response = await fetch(
      `${CALENDAR_API_URL}/calendars/primary/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create calendar event');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
};
