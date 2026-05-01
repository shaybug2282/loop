const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const TASKS_API_URL = 'https://tasks.googleapis.com/tasks/v1';

// Module-level references for token refresh management
let tokenClientRef = null;
let refreshTimer = null;

// Register the GIS token client; also re-schedules any pending refresh from stored expiry.
export const setTokenClient = (client) => {
  tokenClientRef = client;
  rescheduleRefresh();
};

// Re-schedule based on stored expiry — called after page reload to restore the refresh timer.
export const rescheduleRefresh = () => {
  const expiry = parseInt(localStorage.getItem('googleTokenExpiry') || '0', 10);
  const remainingSeconds = (expiry - Date.now()) / 1000;
  if (remainingSeconds > 30) {
    scheduleTokenRefresh(remainingSeconds);
  }
};

// Store token and expiry, then schedule a proactive refresh.
// Also syncs the refreshed token to Supabase so the AI agent always has a valid token per user.
// expiresIn: lifetime in seconds returned by GIS (default 3600).
export const initGoogleCalendar = (accessToken, expiresIn = 3600) => {
  const expiry = Date.now() + expiresIn * 1000;
  localStorage.setItem('googleAccessToken', accessToken);
  localStorage.setItem('googleTokenExpiry', String(expiry));
  scheduleTokenRefresh(expiresIn);

  // Sync refreshed token to Supabase via serverless function so it's encrypted server-side.
  // Fire-and-forget — a sync failure doesn't block calendar use.
  const googleId = localStorage.getItem('googleUserId');
  if (googleId) {
    fetch('/api/sync-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleId, accessToken, expiresIn }),
    }).catch(() => {});
  }
};

// Schedule a silent refresh 5 minutes before the token expires.
const scheduleTokenRefresh = (expiresIn) => {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max((expiresIn - 300) * 1000, 0);
  refreshTimer = setTimeout(silentRefresh, delay);
};

// Request a new token silently (no user prompt) using the stored GIS client.
const silentRefresh = () => {
  if (!tokenClientRef) return;
  tokenClientRef.callback = (response) => {
    if (response.access_token) {
      initGoogleCalendar(response.access_token, response.expires_in || 3600);
    }
  };
  tokenClientRef.requestAccessToken({ prompt: '' });
};

// Cancel the refresh timer and clear the client reference (call on logout).
export const clearTokenRefresh = () => {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  tokenClientRef = null;
};

// Returns a valid access token, silently refreshing if within 5 minutes of expiry.
// Rejects if no token is stored or the refresh fails.
export const getValidToken = async () => {
  const token = localStorage.getItem('googleAccessToken');
  const expiry = parseInt(localStorage.getItem('googleTokenExpiry') || '0', 10);

  if (!token) throw new Error('No access token found');

  // No stored expiry — token age unknown, use as-is
  if (expiry === 0) return token;

  // Token still valid for more than 5 minutes
  if (Date.now() < expiry - 5 * 60 * 1000) return token;

  // Token expired or expiring soon — attempt silent refresh
  if (!tokenClientRef) return token; // GIS client unavailable; fall back to existing token

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Token refresh timed out')),
      10000
    );
    tokenClientRef.callback = (response) => {
      clearTimeout(timeout);
      if (response.access_token) {
        initGoogleCalendar(response.access_token, response.expires_in || 3600);
        resolve(response.access_token);
      } else {
        // Silent refresh failed — fall back to the stored token
        resolve(token);
      }
    };
    tokenClientRef.requestAccessToken({ prompt: '' });
  });
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
        localStorage.removeItem('googleAccessToken');
        localStorage.removeItem('googleTokenExpiry');
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

// Fetch this week's events
export const fetchWeekEvents = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  startOfWeek.setDate(today.getDate() - dayOfWeek);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  return await fetchCalendarEvents(startOfWeek.toISOString(), endOfWeek.toISOString());
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
        localStorage.removeItem('googleAccessToken');
        localStorage.removeItem('googleTokenExpiry');
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
