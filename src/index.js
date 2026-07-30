import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme.css';
import './index.css';
import App from './App';
import { initTheme } from './utils/prefs';
import { isDemo } from './demo/demoStore';
import { installDemoFetch } from './demo/demoFetch';

// Theme before first paint — no light-mode flash for dark-theme users.
initTheme();

// Demo mode has to be wired up before React renders, not in an effect:
// AuthContext validates its session on mount and logs out on a 401, which
// would tear down the demo before the first paint.
//
// The flag is in localStorage but the world is in sessionStorage, so a second
// tab (or a reopened one) finds the flag with no world — demoStore just seeds
// a fresh one. Tearing the demo down here instead would clear the *shared*
// flag out from under the original tab, which would keep showing fake data
// with its "this is a demo" banner gone.
if (isDemo()) installDemoFetch();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
