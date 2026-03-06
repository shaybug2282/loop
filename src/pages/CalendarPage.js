import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import CalendarComponent from '../components/CalendarComponent';
import './PageLayout.css';

const CalendarPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="page-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="page-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Calendar</h1>
      </div>

      <div className="page-content">
        <div className="full-width-component">
          <CalendarComponent />
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
