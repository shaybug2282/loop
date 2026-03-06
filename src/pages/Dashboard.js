import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import CalendarComponent from '../components/CalendarComponent';
import TodoList from '../components/TodoList';
import ContactList from '../components/ContactList';
import './Dashboard.css';

const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        <div className="dashboard-item">
          <TodoList />
        </div>
        <div className="dashboard-item">
          <ContactList />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
