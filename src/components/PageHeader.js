import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useMessages } from '../contexts/MessagesContext';
import NotificationCenter from './NotificationCenter';
import './PageHeader.css';

// Destinations shown in the desktop bar. Mirrors Sidebar's list — Messages is
// a panel, not a route, so it carries `panel: true` and opens in place.
// Profile sits last: at ≥1024px the drawer (and with it the avatar link) is
// hidden, so this bar is the only way to reach it.
const NAV = [
  { path: '/dashboard',          label: 'Dashboard' },
  { path: '/calendar',           label: 'Calendar' },
  { path: '/friends',            label: 'Friends' },
  { path: '/friends?tab=groups', label: 'Groups' },
  { path: null,                  label: 'Messages', panel: true },
  { path: '/profile',            label: 'Profile' },
];

// isActive — a nav entry matches when path+query match exactly. The two
// /friends entries are distinguished by the tab query, so plain /friends must
// not light up the Groups tab (and vice versa).
const isActive = (item, loc) => {
  if (!item.path) return false;
  const here = loc.pathname + loc.search;
  if (item.path === '/friends') {
    return loc.pathname === '/friends' && !loc.search.includes('tab=groups');
  }
  return here === item.path;
};

// PageHeader — the one piece of app chrome, and at ≥1024px the primary
// navigation too (UX_AUDIT.md §2.2: every destination used to sit behind a
// hamburger, with a redundant Home button beside it). The wordmark is now the
// home link, so the standalone Home button is gone.
//
// The notification bell lives here rather than floating (§ audit item 20) — as
// a fixed overlay it rendered on top of the header and clipped page actions.
//
// Below 1024px the nav collapses back to the drawer and the page title shows
// instead; above it, the highlighted nav entry is the "you are here" cue, and
// the title stays in the DOM for screen readers.
const PageHeader = ({ title, onMenu, children }) => {
  const location = useLocation();
  const { openMessages, unreadCount } = useMessages();

  return (
    <header className="page-header">
      <button className="page-header-menu" onClick={onMenu} title="Menu" aria-label="Open menu">
        <Menu size={20} />
      </button>

      <Link to="/dashboard" className="page-header-brand">Loop</Link>

      <h1 className="page-header-title">{title}</h1>

      <nav className="page-header-nav" aria-label="Primary">
        {NAV.map(item => {
          const active = isActive(item, location);

          if (item.panel) {
            return (
              <button key={item.label} className="page-nav-item" onClick={openMessages}>
                <span>{item.label}</span>
                {unreadCount > 0 && (
                  <span className="page-nav-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`page-nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="page-header-actions">
        {children}
        <NotificationCenter />
      </div>
    </header>
  );
};

export default PageHeader;
