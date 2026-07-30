import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';
import WeekView from '../components/WeekView';
import { useChatHub } from '../contexts/ChatHubContext';
import './PageLayout.css';

const CalendarPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { openPlans } = useChatHub();

  return (
    <div className="page-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <PageHeader title="Calendar" onMenu={() => setSidebarOpen(true)}>
        {/* Persistent assistant entry: find a time without leaving the calendar.
            Opens the chat hub's Plans section rather than a modal of its own. */}
        <button className="page-assistant-btn" onClick={() => openPlans(null)}>
          <Sparkles size={14} /> Find a time
        </button>
      </PageHeader>

      <div className="page-content calendar-page-content">
        <WeekView />
      </div>
    </div>
  );
};

export default CalendarPage;
