import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Calendar, CheckSquare, Users, UserPlus, LogOut, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    onClose();
  };

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/todos', icon: CheckSquare, label: 'To-Do List' },
    { path: '/contacts', icon: Users, label: 'Contacts' },
    { path: '/friends', icon: UserPlus, label: 'Friends' },
  ];

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}
      
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
          
          {user && (
            <div className="user-info">
              <img src={user.picture} alt={user.name} className="user-avatar" />
              <div className="user-details">
                <h3>{user.name}</h3>
                <p>{user.email}</p>
              </div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
