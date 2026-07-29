import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';
import CalendarComponent from '../components/CalendarComponent';
import TasksWidget from '../components/TasksWidget';
import PendingEventsWidget from '../components/PendingEventsWidget';
import GroupsWidget from '../components/GroupsWidget';
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
        <div className="dash-guest-header">
          <h1 className="dash-brand">Loop</h1>
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

          <div className="dash-how">
            <div className="dash-how-step">
              <span className="dash-how-num">1</span>
              <h3>Connect your calendar</h3>
              <p>Sign in with Google — Loop reads free/busy and books confirmed plans, nothing else.</p>
            </div>
            <div className="dash-how-step">
              <span className="dash-how-num">2</span>
              <h3>Add your people</h3>
              <p>Swap friend codes, make groups, and chat right where the plans happen.</p>
            </div>
            <div className="dash-how-step">
              <span className="dash-how-num">3</span>
              <h3>Let the assistant find the time</h3>
              <p>Say "dinner with Sam next week" — it checks everyone's calendars and proposes times that fit.</p>
            </div>
          </div>
        </div>
        {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <PageHeader title="Dashboard" onMenu={() => setSidebarOpen(true)} home={false} />

      <div className="dashboard-grid">
        <div className="dashboard-item dashboard-col-stack">
          <CalendarComponent />
          <TasksWidget />
        </div>
        <div className="dashboard-item dashboard-col-stack">
          <GroupsWidget />
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
