import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
const favicon = require('serve-favicon');
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
App.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
