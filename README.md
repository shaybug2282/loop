# React Dashboard App with Google Calendar & Tasks Integration

A React application with Google OAuth authentication, full Google Calendar sync, Google Tasks integration, and contact management. yippee

## Features

- 🔐 Google OAuth authentication with proper scopes
- 📅 **Google Calendar sync** - View today's schedule on dashboard, full week view on calendar page
- ✅ **Google Tasks integration** - Tasks from Google Calendar automatically appear in to-do list
- ✏️ **Editable to-dos** - Edit both Google Tasks and local tasks directly in the app
- 👥 **Contact management** - Fully editable contact list with add, edit, delete
- 🔄 **Real-time sync** - Refresh buttons to sync latest data from Google
- 📱 Responsive design for mobile, tablet, and desktop
- 🎨 Beautiful gradient UI with smooth animations

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Google Cloud Console account (free)

---

## 🔑 Google API Setup (IMPORTANT - READ CAREFULLY)

This app requires proper Google API configuration to access Calendar and Tasks data. Follow these steps exactly:

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Name your project (e.g., "My Dashboard App")
4. Click **"Create"**

### Step 2: Enable Required APIs

You must enable TWO APIs for this app to work:

#### Enable Google Calendar API:
1. In the Google Cloud Console, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google Calendar API"**
3. Click on it and press **"Enable"**

#### Enable Google Tasks API:
1. Still in **"APIs & Services"** → **"Library"**
2. Search for **"Google Tasks API"** (or "Tasks API")
3. Click on it and press **"Enable"**

**⚠️ CRITICAL:** Both APIs must be enabled or the app won't be able to fetch your calendar events or tasks!

### Step 3: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Choose **"External"** (unless you have a Google Workspace account)
3. Click **"Create"**
4. Fill in required fields:
   - **App name**: Your app name (e.g., "My Dashboard")
   - **User support email**: Your email
   - **Developer contact email**: Your email
5. Click **"Save and Continue"**
6. On the **Scopes** page, click **"Add or Remove Scopes"**
7. **IMPORTANT:** Add these scopes (search for them):
   - `https://www.googleapis.com/auth/calendar` (Google Calendar API - Full access)
   - `https://www.googleapis.com/auth/calendar.events` (See and edit events)
   - `https://www.googleapis.com/auth/tasks` (Google Tasks API - Full access)
8. Click **"Update"** then **"Save and Continue"**
9. On **Test users** page, click **"Add Users"**
10. Add your Google email address (and any other emails you want to test with)
11. Click **"Save and Continue"**

**📝 Note:** While in "Testing" mode, only added test users can log in. To allow anyone to use your app, you'll need to publish it (under OAuth consent screen).

### Step 4: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Choose **"Web application"**
4. Name it (e.g., "Dashboard Web Client")
5. Under **"Authorized JavaScript origins"**, click **"Add URI"**:
   - Add: `http://localhost:3000` (for development)
   - Add your production URL when you deploy (e.g., `https://your-app.vercel.app`)
6. Under **"Authorized redirect URIs"**, click **"Add URI"**:
   - Add: `http://localhost:3000`
   - Add your production URL when you deploy
7. Click **"Create"**
8. **COPY YOUR CLIENT ID** - it looks like: `123456789-abcdefg.apps.googleusercontent.com`

### Step 5: Update Your Authorized URLs After Deployment

**IMPORTANT:** After deploying to Vercel (or any hosting platform):

1. Return to **"APIs & Services"** → **"Credentials"**
2. Click on your OAuth 2.0 Client ID
3. Under **"Authorized JavaScript origins"**, add your Vercel URL:
   - Example: `https://my-dashboard-abc123.vercel.app`
4. Under **"Authorized redirect URIs"**, add the same URL
5. Click **"Save"**
6. Wait 5-10 minutes for changes to take effect

### What This Enables

✅ **Google Calendar API** - Allows the app to:
- Read your calendar events
- Display today's schedule on the dashboard
- Show a full week view on the calendar page
- Create new events (future feature)

✅ **Google Tasks API** - Allows the app to:
- Fetch tasks from your Google Calendar/Tasks
- Display them in the to-do list with a "Google" badge
- Mark tasks as complete
- Edit task names
- Delete tasks

---

## 💻 Local Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

4. Edit `.env` and add your Google Client ID:
```
REACT_APP_GOOGLE_CLIENT_ID=your_actual_client_id_here.apps.googleusercontent.com
```

5. Run the development server:
```bash
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000)

---

## 🚀 Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

---

## 📦 Deploy to Vercel

### Option 1: Deploy via Vercel CLI

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel
```

3. Add environment variable in Vercel dashboard:
   - Go to your project settings
   - Navigate to "Environment Variables"
   - Add `REACT_APP_GOOGLE_CLIENT_ID` with your Client ID value

### Option 2: Deploy via Vercel Dashboard (Recommended)

1. Push your code to GitHub (see GitHub setup above)
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click **"Add New..."** → **"Project"**
4. Import your GitHub repository
5. In project configuration:
   - Framework Preset: **Create React App** (auto-detected)
   - Build Command: `npm run build` (default)
   - Output Directory: `build` (default)
6. Click on **"Environment Variables"**:
   - Name: `REACT_APP_GOOGLE_CLIENT_ID`
   - Value: Your Google Client ID (from Step 4 above)
   - Environment: Check all (Production, Preview, Development)
7. Click **"Deploy"**
8. Wait 1-2 minutes for build to complete
9. **CRITICAL NEXT STEP:** Update Google OAuth settings with your Vercel URL (see Step 5 above)

### After Deployment Checklist

✅ Update Google Cloud Console with your Vercel URL  
✅ Wait 5-10 minutes for OAuth changes to propagate  
✅ Test login on your live site  
✅ Check that calendar and tasks are syncing  

---

## 📖 How to Use

### First Time Setup

1. Visit your app URL
2. Click **"Sign in with Google"**
3. Approve the requested permissions:
   - View and manage your calendars
   - View and manage your tasks
4. You'll be redirected to the dashboard

### Dashboard Features

**Today's Schedule (Calendar Component)**
- Shows all events for today from your Google Calendar
- Displays event times, titles, locations, and descriptions
- Click refresh icon to sync latest changes
- All-day events are clearly marked

**To-Do List**
- Automatically imports tasks from Google Tasks (marked with blue "Google" badge)
- Add new local tasks (stored in browser)
- Edit any task by clicking the edit icon
- Complete tasks by clicking the checkbox
- Delete tasks with the trash icon
- Both Google Tasks and local tasks are fully editable

**Contacts**
- Add contacts with name, email, and phone
- Edit existing contacts by clicking the edit icon
- Search through contacts
- Delete contacts with confirmation
- All data stored locally in browser

### Navigation

- Click the **menu icon** (☰) in top-left to open sidebar
- Sidebar shows your profile and navigation links:
  - **Dashboard** - All three components at once
  - **Calendar** - Full week view of your schedule
  - **To-Do List** - Expanded task management
  - **Contacts** - Full contact management
- Click **Logout** to sign out

### Calendar Page (Week View)

- Shows full week of events (Sunday - Saturday)
- Navigate between weeks with arrow buttons
- Click **"Today"** to jump back to current week
- Each day shows all events with times and locations
- Current day is highlighted
- Click refresh to sync latest Google Calendar data

---

## 🛠 Troubleshooting

### "Error 400: redirect_uri_mismatch"
**Problem:** Google OAuth can't redirect back to your app  
**Solution:** 
1. Go to Google Cloud Console → Credentials
2. Edit your OAuth Client ID
3. Add your exact app URL to both "Authorized JavaScript origins" AND "Authorized redirect URIs"
4. Make sure URLs match exactly (no trailing slashes, correct http/https)
5. Wait 5-10 minutes

### "Error 403: Access Denied"
**Problem:** Required APIs are not enabled  
**Solution:**
1. Go to Google Cloud Console → APIs & Services → Library
2. Search for and enable both:
   - Google Calendar API
   - Google Tasks API (or "Tasks API")

### Tasks Not Showing
**Problem:** Google Tasks API not enabled or no tasks in Google account  
**Solution:**
1. Verify Tasks API is enabled in Google Cloud Console
2. Check you have tasks in Google Tasks (tasks.google.com)
3. Click refresh button in To-Do List component
4. Check browser console for errors

### Calendar Events Not Showing
**Problem:** Missing scopes or API not enabled  
**Solution:**
1. Verify Google Calendar API is enabled
2. Check OAuth consent screen has correct scopes
3. Log out and log back in to re-authorize
4. Click refresh button in Calendar component

### "Access blocked: This app's request is invalid"
**Problem:** OAuth consent screen not configured  
**Solution:**
1. Complete OAuth consent screen setup (Step 3 above)
2. Add yourself as a test user
3. Add required scopes to consent screen

---

## 📁 Project Structure

```
react-hello-world/
├── public/
│   └── index.html                  # HTML template
├── src/
│   ├── components/
│   │   ├── CalendarComponent.js    # Today's schedule widget
│   │   ├── WeekView.js             # Full week calendar view
│   │   ├── TodoList.js             # Task management (Google + local)
│   │   ├── ContactList.js          # Contact management (editable)
│   │   └── Sidebar.js              # Navigation sidebar
│   ├── pages/
│   │   ├── Login.js                # Google OAuth login page
│   │   ├── Dashboard.js            # Main dashboard view
│   │   ├── CalendarPage.js         # Full calendar page
│   │   ├── TodosPage.js            # Full to-do page
│   │   └── ContactsPage.js         # Full contacts page
│   ├── contexts/
│   │   └── AuthContext.js          # Authentication state management
│   ├── utils/
│   │   └── googleCalendar.js       # Google Calendar & Tasks API calls
│   ├── App.js                      # Main app with routing
│   ├── App.css                     # Global styles
│   ├── index.js                    # Entry point
│   └── index.css                   # Base styles
├── .env.example                    # Environment variables template
├── .env                            # Your environment variables (don't commit!)
├── package.json                    # Dependencies
├── README.md                       # This file
└── vercel.json                     # Vercel deployment config
```

---

## 🔒 Privacy & Data

- **Google Calendar & Tasks**: Read and write access to sync your data
- **Local Storage**: Contacts and local tasks stored in your browser
- **No Server**: All data stays between your browser and Google APIs
- **No Tracking**: This app doesn't collect or share your personal data

---

## 🧪 Technologies Used

- **React 18** - UI framework
- **React Router DOM** - Client-side routing
- **@react-oauth/google** - Google OAuth integration
- **Google Calendar API** - Calendar event sync
- **Google Tasks API** - Task management sync
- **Lucide React** - Beautiful icons
- **CSS3** - Styling and animations
- **LocalStorage** - Browser-based data persistence

---

## 📚 Learn More

- [React Documentation](https://reactjs.org/)
- [Google Calendar API Docs](https://developers.google.com/calendar/api/v3/reference)
- [Google Tasks API Docs](https://developers.google.com/tasks/reference/rest)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Vercel Documentation](https://vercel.com/docs)

---

## 🐛 Known Issues & Limitations

1. **OAuth Access Token**: The current implementation uses ID tokens. For production, you should implement a backend to exchange auth codes for access tokens with proper refresh token handling.

2. **Token Expiration**: Access tokens expire after 1 hour. The app will ask you to log in again when tokens expire.

3. **Test Mode**: While OAuth consent screen is in "Testing" mode, only added test users can sign in. Publish your app for public access.

4. **Read-Only Tasks**: Currently only reads and modifies tasks. Creating new Google Tasks not yet implemented.

---

## 💡 Future Enhancements

- [ ] Create new Google Calendar events from the app
- [ ] Create new Google Tasks from to-do list
- [ ] Sync contacts with Google Contacts API
- [ ] Month view for calendar
- [ ] Event details modal
- [ ] Task due dates and reminders
- [ ] Dark mode
- [ ] Email notifications
- [ ] Mobile app version

---

## 📄 License

This project is open source and available for personal and educational use.

---

**Questions?** Check the Troubleshooting section above or review the Google API setup steps carefully.
