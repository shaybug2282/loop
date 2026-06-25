import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MessagesProvider } from './contexts/MessagesContext';
import MessagesPanel from './components/MessagesPanel';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/CalendarPage';
import TodosPage from './pages/TodosPage';
import FriendsPage from './pages/FriendsPage';
import ProfilePage from './pages/ProfilePage';
import SchedulePage from './pages/SchedulePage';
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
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
            />
            <Route
              path="/calendar"
              element={<ProtectedRoute><CalendarPage /></ProtectedRoute>}
            />
            <Route
              path="/todos"
              element={<ProtectedRoute><TodosPage /></ProtectedRoute>}
            />
            <Route path="/contacts" element={<Navigate to="/friends" />} />
            <Route
              path="/friends"
              element={<ProtectedRoute><FriendsPage /></ProtectedRoute>}
            />
            <Route
              path="/profile"
              element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
            />
            <Route
              path="/schedule"
              element={<ProtectedRoute><SchedulePage /></ProtectedRoute>}
            />
            {/* /messages redirects home; the panel handles all messaging */}
            <Route path="/messages" element={<Navigate to="/dashboard" />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>

          {/* Global floating messages panel — rendered on top of all pages */}
          <MessagesPanel />
          {/* Global footer — shown on every page */}
          <Footer />
        </Router>
      </MessagesProvider>
    </AuthProvider>
  );
}

export default App;
