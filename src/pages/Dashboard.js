import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';
import AssistantComposer from '../components/AssistantComposer';
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
          <h2 className="dash-hero-heading">Getting everyone together shouldn't take twelve texts.</h2>
          <p className="dash-hero-body">
            Tell Loop who you want to see and roughly when. It reads everyone's
            calendars, finds the times that actually work, and sends the invites.
          </p>
          <button className="dash-hero-cta" onClick={() => setShowSignIn(true)}>
            Get started — it's free
          </button>
          <p className="dash-hero-note">Free, and it only ever books plans you've confirmed.</p>

          {/* A look at the thing itself, rather than three numbered cards
              describing it. Static markup — no data, no interaction. */}
          <div className="dash-demo" aria-hidden="true">
            <div className="dash-demo-msg dash-demo-you">Dinner with Sam and Priya next week</div>
            <div className="dash-demo-msg dash-demo-loop">
              All three of you are free these times:
            </div>
            <div className="dash-demo-slots">
              <div className="dash-demo-slot">
                <span className="dash-demo-day">Tue</span>
                <span className="dash-demo-time">7:00 PM</span>
              </div>
              <div className="dash-demo-slot dash-demo-slot-pick">
                <span className="dash-demo-day">Thu</span>
                <span className="dash-demo-time">6:30 PM</span>
              </div>
              <div className="dash-demo-slot">
                <span className="dash-demo-day">Sat</span>
                <span className="dash-demo-time">1:00 PM</span>
              </div>
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

      <PageHeader title="Dashboard" onMenu={() => setSidebarOpen(true)} />

      {/* The assistant is the first thing on the page — it's what Loop is for. */}
      <AssistantComposer />

      <div className="dashboard-grid">
        <div className="dashboard-item dashboard-col-stack">
          <CalendarComponent />
          <TasksWidget />
        </div>
        {/* "In the Works" leads its column: it's the only time-sensitive
            widget, holding invites that are waiting on a reply. */}
        <div className="dashboard-item dashboard-col-stack">
          <PendingEventsWidget />
          <GroupsWidget />
        </div>
        <div className="dashboard-item">
          <FriendsWidget />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
