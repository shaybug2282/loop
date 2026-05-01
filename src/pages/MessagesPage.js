import React, { useState } from 'react';
import { Menu, MessageSquare } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import './MessagesPage.css';

// Placeholder page — messaging functionality to be implemented.
const MessagesPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="messages-page">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="messages-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Messages</h1>
      </div>

      <div className="messages-empty">
        <MessageSquare size={48} strokeWidth={1.2} />
        <p>Messages coming soon</p>
      </div>
    </div>
  );
};

export default MessagesPage;
