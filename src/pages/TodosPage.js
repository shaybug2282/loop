import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Home } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import TodoList from '../components/TodoList';
import './PageLayout.css';

const TodosPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="page-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="page-header">
        <Link to="/dashboard" className="home-btn" title="Dashboard"><Home size={18} /></Link>
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>To-Do List</h1>
      </div>

      <div className="page-content">
        <div className="full-width-component">
          <TodoList />
        </div>
      </div>
    </div>
  );
};

export default TodosPage;
