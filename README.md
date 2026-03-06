# React Dashboard App with Google Calendar Integration

A React application with Google OAuth authentication, calendar integration, to-do list, and contact management.

## Features

- 🔐 Google OAuth authentication
- 📅 Google Calendar integration
- ✅ To-do list with local storage
- 👥 Contact management
- 📱 Responsive design
- 🎨 Beautiful gradient UI

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Google Cloud Console account (for OAuth setup)

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized JavaScript origins:
     - `http://localhost:3000` (for development)
     - Your production URL (e.g., `https://your-app.vercel.app`)
   - Add authorized redirect URIs:
     - `http://localhost:3000`
     - Your production URL
   - Click "Create" and copy your Client ID

### Installation

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

### Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

## Deploy to Vercel

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
   - Add `REACT_APP_GOOGLE_CLIENT_ID` with your Client ID

### Option 2: Deploy via Vercel Dashboard

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your repository
5. Add environment variable:
   - Name: `REACT_APP_GOOGLE_CLIENT_ID`
   - Value: Your Google Client ID
6. Deploy

**Important:** After deploying, update your Google OAuth authorized origins and redirect URIs to include your Vercel URL.

## Project Structure

```
react-hello-world/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── CalendarComponent.js    # Calendar widget
│   │   ├── TodoList.js              # To-do list widget
│   │   ├── ContactList.js           # Contacts widget
│   │   └── Sidebar.js               # Navigation sidebar
│   ├── pages/
│   │   ├── Login.js                 # Login page
│   │   ├── Dashboard.js             # Main dashboard
│   │   ├── CalendarPage.js          # Full calendar view
│   │   ├── TodosPage.js             # Full todos view
│   │   └── ContactsPage.js          # Full contacts view
│   ├── contexts/
│   │   └── AuthContext.js           # Authentication state
│   ├── utils/
│   │   └── googleCalendar.js        # Google Calendar API
│   ├── App.js                       # Main app with routing
│   └── index.js                     # Entry point
├── .env.example                     # Environment variables template
├── package.json
├── README.md
└── vercel.json
```

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm run build` - Builds the app for production
- `npm test` - Runs the test suite
- `npm run eject` - Ejects from Create React App (one-way operation)

## How to Use

1. **Login**: Sign in with your Google account
2. **Dashboard**: View all three components (Calendar, To-Dos, Contacts) at once
3. **Navigation**: Click the menu button to access individual component pages
4. **Calendar**: Syncs with your Google Calendar (read-only in this version)
5. **To-Do List**: Add, complete, and delete tasks (stored locally)
6. **Contacts**: Manage contacts (stored locally)

## Technologies Used

- React 18
- React Router DOM (routing)
- Google OAuth (@react-oauth/google)
- Google Calendar API
- Lucide React (icons)
- CSS3 (styling)

## Learn More

- [React Documentation](https://reactjs.org/)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Calendar API](https://developers.google.com/calendar)
- [Vercel Documentation](https://vercel.com/docs)

