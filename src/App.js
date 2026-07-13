import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MessagesProvider }     from './contexts/MessagesContext';
import { GroupChatProvider }    from './contexts/GroupChatContext';
import MessagesPanel       from './components/MessagesPanel';
import MessageToast        from './components/MessageToast';
import NotificationCenter  from './components/NotificationCenter';
import GroupChatPanel      from './components/GroupChatPanel';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/CalendarPage';
import FriendsPage from './pages/FriendsPage';
import ProfilePage from './pages/ProfilePage';
import PrivacyPage from './pages/PrivacyPage';
import Footer from './components/Footer';
import './App.css';

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
      <MessagesProvider>
        <GroupChatProvider>
          <Router>
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

            {/* Global floating messages panel — rendered on top of all pages */}
            <MessagesPanel />
            {/* Background message notifier — always rendered, shows toast for new messages */}
            <MessageToast />
            {/* Global notification bell — fixed top-right */}
            <NotificationCenter />
            {/* Global group chat panel */}
            <GroupChatPanel />
            {/* Global footer — shown on every page */}
            <Footer />
          </Router>
        </GroupChatProvider>
      </MessagesProvider>
    </AuthProvider>
  );
}

export default App;
