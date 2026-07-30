import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Calendar, UserPlus, Settings, LogOut, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    onClose();
  };

  // Groups was a second entry pointing at a tab of the Friends page, and
  // Messages opened a panel; the chat launcher (fixed bottom-right on every
  // page) now covers messaging, so neither earns a row here.
  const navItems = [
    { path: '/dashboard', icon: Home,     label: 'Dashboard' },
    { path: '/calendar',  icon: Calendar, label: 'Calendar' },
    { path: '/friends',   icon: UserPlus, label: 'Friends' },
    { path: '/profile',   icon: Settings, label: 'Profile & Settings' },
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
            <Link to="/profile" className="user-info" onClick={onClose}>
              <img src={user.picture} alt={user.name} className="user-avatar" />
              <div className="user-details">
                <h3>{user.name}</h3>
                <p>{user.email}</p>
              </div>
            </Link>
          )}
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            // /friends owns every tab of that page (?tab=groups, ?tab=requests).
            const isActive = item.path === '/friends'
              ? location.pathname === '/friends'
              : location.pathname + location.search === item.path;

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
