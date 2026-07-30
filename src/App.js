import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { applyPrefsFromServer } from './utils/prefs';
import { ChatHubProvider }     from './contexts/ChatHubContext';
import ChatHub             from './components/ChatHub';
import ChatLauncher        from './components/ChatLauncher';
import MessageToast        from './components/MessageToast';
import DemoBanner          from './components/DemoBanner';
import { isDemo }          from './demo/demoStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/CalendarPage';
import FriendsPage from './pages/FriendsPage';
import ProfilePage from './pages/ProfilePage';
import PrivacyPage from './pages/PrivacyPage';
import Footer from './components/Footer';
import './App.css';

// PrefsSync — once per session, pull server-stored preferences (theme, accent,
// notification toggles) so settings changed on another device apply here.
const PrefsSync = () => {
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    const googleId = localStorage.getItem('googleUserId');
    if (!isAuthenticated || !googleId) return;
    fetch(`/api/user?op=profile&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.preferences) applyPrefsFromServer(d.preferences); })
      .catch(() => {});
  }, [isAuthenticated]);
  return null;
};

// AppShell — carries the `demo-on` class that offsets the sticky page header
// below the demo banner. It lives in its own component so it can subscribe to
// auth state: computed inline in App, the class would survive a sign-out
// (App itself never re-renders) and leave every page pushed down by a banner
// that is no longer there.
const AppShell = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const demo = isAuthenticated && isDemo();
  return <div className={`app-shell${demo ? ' demo-on' : ''}`}>{children}</div>;
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <ChatHubProvider>
        <Router>
            <PrefsSync />
            {/* Flex column so the footer sits at the true page bottom. Page
                roots are flex: 1 — previously every page was min-height: 100vh,
                which pushed the footer (and its Privacy Policy link) a full
                viewport below the fold on every route. */}
            <AppShell>
              <DemoBanner />
              <Routes>
                <Route path="/login" element={<Login />} />
                {/* Dashboard is publicly accessible; auth state handled inside the component */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route
                  path="/calendar"
                  element={<ProtectedRoute><CalendarPage /></ProtectedRoute>}
                />
                {/* To-Do page removed — old bookmarks land on the dashboard */}
                <Route path="/todos" element={<Navigate to="/dashboard" />} />
                <Route path="/contacts" element={<Navigate to="/friends" />} />
                <Route
                  path="/friends"
                  element={<ProtectedRoute><FriendsPage /></ProtectedRoute>}
                />
                <Route
                  path="/profile"
                  element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
                />
                {/* The schedule page was folded into the dashboard (Groups +
                    pending tiles + event popups); old links land there. */}
                <Route path="/schedule" element={<Navigate to="/dashboard" />} />
                {/* /messages redirects home; the panel handles all messaging */}
                <Route path="/messages" element={<Navigate to="/dashboard" />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/" element={<Navigate to="/dashboard" />} />
              </Routes>
              {/* Global footer — shown on every page, at the bottom of content */}
              <Footer />
            </AppShell>

            {/* One chat window for DMs, groups and scheduling, plus the
                launcher that opens it from any page. */}
            <ChatHub />
            <ChatLauncher />
            {/* Background message notifier — always rendered, shows toast for new messages */}
            <MessageToast />
        </Router>
      </ChatHubProvider>
    </AuthProvider>
  );
}

export default App;
