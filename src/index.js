import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme.css';
import './index.css';
import App from './App';
import { initTheme } from './utils/prefs';

// Theme before first paint — no light-mode flash for dark-theme users.
initTheme();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
