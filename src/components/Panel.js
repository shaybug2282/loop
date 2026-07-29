import React from 'react';
import './Panel.css';

// Panel — the one card recipe shared by every dashboard widget. Before this,
// five widgets each rolled their own radius, padding, border, shadow and title
// size (UX_AUDIT.md §1.1); they now differ only where they legitimately must.
//
// Deliberately supplies NO height, padding or overflow. Those vary per widget
// for real reasons — Groups needs `overflow: visible`, In the Works needs
// `hidden`, Calendar and Friends carry their own bounded heights — so they
// stay in each widget's stylesheet, keyed off the class passed in here.
//
// out: <section class="panel {className}"> laid out as a flex column.
export const Panel = ({ className = '', children, ...rest }) => (
  <section className={`panel${className ? ` ${className}` : ''}`} {...rest}>
    {children}
  </section>
);

// PanelHeader — the shared title row: accent icon, <h2> title, optional count
// badge, then any children pinned right as actions.
//
// Pass `onActivate` to make the whole row activate something (Today's Schedule
// opens the calendar page); it wires click plus Enter/Space so the row stays
// keyboard-reachable. Clicks on the actions cluster are stopped so an action
// button never also fires the row.
//
// out: <div class="panel-header"> containing <h2 class="panel-title">.
export const PanelHeader = ({
  icon: Icon,
  title,
  badge = null,
  onActivate = null,
  activateLabel,
  children,
}) => {
  const interactive = typeof onActivate === 'function';

  return (
    <div
      className={`panel-header${interactive ? ' panel-header-link' : ''}`}
      {...(interactive && {
        role: 'button',
        tabIndex: 0,
        title: activateLabel,
        onClick: onActivate,
        onKeyDown: e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); }
        },
      })}
    >
      {Icon && <Icon size={16} className="panel-header-icon" />}
      <h2 className="panel-title">{title}</h2>
      {badge !== null && badge !== 0 && <span className="panel-badge">{badge}</span>}
      {children && (
        <div className="panel-actions" onClick={e => e.stopPropagation()}>{children}</div>
      )}
    </div>
  );
};
