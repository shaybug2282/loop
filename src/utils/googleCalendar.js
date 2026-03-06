const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const TASKS_API_URL = 'https://tasks.googleapis.com/tasks/v1';

export const initGoogleCalendar = (accessToken) => {
  localStorage.setItem('googleAccessToken', accessToken);
};

// Fetch events for a specific date range
export const fetchCalendarEvents = async (timeMin = null, timeMax = null) => {
  const accessToken = localStorage.getItem('googleAccessToken');
  
  if (!accessToken) {
    throw new Error('No access token found');
  }

  try {
    // Default to today if no timeMin provided
    const startTime = timeMin || new Date().toISOString();
    // Default to 30 days from now if no timeMax provided
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
        // Token expired, need to re-authenticate
        localStorage.removeItem('googleAccessToken');
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
  
  // Get start of week (Sunday)
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  
  // Get end of week (Saturday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  return await fetchCalendarEvents(startOfWeek.toISOString(), endOfWeek.toISOString());
};

// Fetch Google Tasks
export const fetchGoogleTasks = async () => {
  const accessToken = localStorage.getItem('googleAccessToken');
  
  if (!accessToken) {
    throw new Error('No access token found');
  }

  try {
    // First, get all task lists
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
        throw new Error('Authentication expired. Please log in again.');
      }
      throw new Error('Failed to fetch task lists');
    }

    const listsData = await listsResponse.json();
    const taskLists = listsData.items || [];

    // Fetch tasks from all lists
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
  const accessToken = localStorage.getItem('googleAccessToken');
  
  if (!accessToken) {
    throw new Error('No access token found');
  }

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
  const accessToken = localStorage.getItem('googleAccessToken');
  
  if (!accessToken) {
    throw new Error('No access token found');
  }

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
  const accessToken = localStorage.getItem('googleAccessToken');
  
  if (!accessToken) {
    throw new Error('No access token found');
  }

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
