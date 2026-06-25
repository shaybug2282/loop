import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Home } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import WeekView from '../components/WeekView';
import './PageLayout.css';

const CalendarPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="page-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="page-header">
        <Link to="/dashboard" className="home-btn" title="Dashboard"><Home size={18} /></Link>
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Calendar</h1>
      </div>

      <div className="page-content calendar-page-content">
        <WeekView />
      </div>
    </div>
  );
};

export default CalendarPage;
