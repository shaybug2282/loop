import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Home, Sparkles } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import WeekView from '../components/WeekView';
import SchedulingAssistant from '../components/SchedulingAssistant';
import './PageLayout.css';

const CalendarPage = () => {
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <div className="page-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="page-header">
        <Link to="/dashboard" className="home-btn" title="Dashboard"><Home size={18} /></Link>
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Calendar</h1>
        {/* Persistent assistant entry: find a time without leaving the calendar */}
        <button className="page-assistant-btn" onClick={() => setAssistantOpen(true)}>
          <Sparkles size={14} /> Find a time
        </button>
      </div>

      <div className="page-content calendar-page-content">
        <WeekView />
      </div>

      {assistantOpen && (
        <div className="page-modal-backdrop" onClick={() => setAssistantOpen(false)}>
          <div className="page-modal" onClick={e => e.stopPropagation()}>
            <SchedulingAssistant onClose={() => setAssistantOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
