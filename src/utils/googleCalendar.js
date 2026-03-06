const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';

export const initGoogleCalendar = (accessToken) => {
  localStorage.setItem('googleAccessToken', accessToken);
};

export const fetchCalendarEvents = async () => {
  const accessToken = localStorage.getItem('googleAccessToken');
  
  if (!accessToken) {
    throw new Error('No access token found');
  }

  try {
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days from now

    const response = await fetch(
      `${CALENDAR_API_URL}/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch calendar events');
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return [];
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
