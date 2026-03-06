import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ContactList from '../components/ContactList';
import './PageLayout.css';

const ContactsPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="page-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="page-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Contacts</h1>
      </div>

      <div className="page-content">
        <div className="full-width-component">
          <ContactList />
        </div>
      </div>
    </div>
  );
};

export default ContactsPage;
