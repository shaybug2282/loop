import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import CalendarComponent from '../components/CalendarComponent';
import PendingEventsWidget from '../components/PendingEventsWidget';
import ScheduleWidget from '../components/ScheduleWidget';
import FriendsWidget from '../components/FriendsWidget';
import SignInModal from '../components/SignInModal';
import { useAuth } from '../contexts/AuthContext';
import './Dashboard.css';

const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSignIn,  setShowSignIn]  = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  // Land at the top of the page on entry, and stop the browser from restoring a
  // previous scroll position (which could jump the tall dashboard to the bottom
  // on login). There should never be an automatic downward scroll here.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }, []);

  // Show sign-in prompt after 30 s if the user is still unauthenticated.
  useEffect(() => {
    if (isAuthenticated || isLoading) return;
    const t = setTimeout(() => setShowSignIn(true), 30_000);
    return () => clearTimeout(t);
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="dashboard dashboard-guest">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="dashboard-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <h1>Dashboard</h1>
          <button className="dash-signin-btn" onClick={() => setShowSignIn(true)}>
            Sign in
          </button>
        </div>
        <div className="dash-hero">
          <p className="dash-hero-eyebrow">Welcome</p>
          <h2 className="dash-hero-heading">So, you want to hang out with your friends?</h2>
          <p className="dash-hero-body">Let us help! Loop is the AI social calendar that makes scheduling events easy.</p>
          <button className="dash-hero-cta" onClick={() => setShowSignIn(true)}>
            Get started — it's free
          </button>
        </div>
        {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="dashboard-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Dashboard</h1>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-item">
          <CalendarComponent />
        </div>
        <div className="dashboard-item dashboard-col-stack">
          <ScheduleWidget />
          <PendingEventsWidget />
        </div>
        <div className="dashboard-item">
          <FriendsWidget />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
