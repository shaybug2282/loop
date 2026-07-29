import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';
import WeekView from '../components/WeekView';
import SchedulingAssistant from '../components/SchedulingAssistant';
import './PageLayout.css';

const CalendarPage = () => {
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <div className="page-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <PageHeader title="Calendar" onMenu={() => setSidebarOpen(true)}>
        {/* Persistent assistant entry: find a time without leaving the calendar */}
        <button className="page-assistant-btn" onClick={() => setAssistantOpen(true)}>
          <Sparkles size={14} /> Find a time
        </button>
      </PageHeader>

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
