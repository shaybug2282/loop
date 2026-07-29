import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Menu } from 'lucide-react';
import './PageHeader.css';

// PageHeader — the one piece of app chrome. There were four near-duplicate
// headers in two different visual treatments (UX_AUDIT.md §2.3): Dashboard and
// Calendar rendered a transparent bar that scrolled away, Friends and Profile a
// sticky white one, so the frame visibly changed shape as you navigated. This
// is the sticky treatment, which is what the long pages needed.
//
// `home` renders the dashboard link — omitted on the dashboard itself. It is
// deliberately kept for now: it only becomes redundant once the persistent
// desktop nav lands (§2.2), and removing it before then would leave Calendar,
// Friends and Profile reachable only through the drawer.
//
// Children are rendered as actions pinned to the right.
// out: <header class="page-header"> containing an <h1>.
const PageHeader = ({ title, onMenu, home = true, children }) => (
  <header className="page-header">
    {home && (
      <Link to="/dashboard" className="page-header-btn" title="Dashboard">
        <Home size={18} />
      </Link>
    )}
    <button className="page-header-btn" onClick={onMenu} title="Menu">
      <Menu size={20} />
    </button>
    <h1 className="page-header-title">{title}</h1>
    {children && <div className="page-header-actions">{children}</div>}
  </header>
);

export default PageHeader;
