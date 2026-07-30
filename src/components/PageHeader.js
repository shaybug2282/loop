import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import './PageHeader.css';

// Destinations shown in the desktop bar. Mirrors Sidebar's list.
//
// Groups used to be a second entry pointing at `/friends?tab=groups` — the same
// page, a tab along. One Friends entry covers all three of its tabs. Messages
// is gone too: the chat launcher is fixed bottom-right on every page, so a nav
// entry was a second door to the same room.
//
// Profile sits last: at ≥1024px the drawer (and with it the avatar link) is
// hidden, so this bar is the only way to reach it.
const NAV = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/calendar',  label: 'Calendar' },
  { path: '/friends',   label: 'Friends' },
  { path: '/profile',   label: 'Profile' },
];

// isActive — a nav entry matches when path+query match exactly, except
// /friends, which owns every tab of that page (`?tab=groups`, `?tab=requests`).
const isActive = (item, loc) => {
  if (item.path === '/friends') return loc.pathname === '/friends';
  return loc.pathname + loc.search === item.path;
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
