import React, { useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { initGoogleCalendar, setTokenClient } from '../utils/googleCalendar';
import './SignInModal.css';

// Prompt shown to unauthenticated users — handles its own GIS script load.
const SignInModal = ({ onClose }) => {
  const { login } = useAuth();

  const handleTokenResponse = useCallback(async (response) => {
    if (!response.access_token) return;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${response.access_token}` },
      });
      const userInfo = await res.json();
      localStorage.setItem('googleUserId', userInfo.id);
      initGoogleCalendar(response.access_token, response.expires_in || 3600);
      await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'sync',
          googleId: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          pictureUrl: userInfo.picture,
          accessToken: response.access_token,
          expiresIn: response.expires_in || 3600,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      login({ name: userInfo.name, email: userInfo.email, picture: userInfo.picture, accessToken: response.access_token });
      // isAuthenticated becomes true → Dashboard re-renders with full content; no navigate needed.
    } catch (err) {
      console.error('[SignInModal] sign-in error:', err);
    }
  }, [login]);

  useEffect(() => {
    let addedScript = null;

    const initClient = () => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
        scope: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks',
        callback: handleTokenResponse,
      });
      setTokenClient(client);
      const btn = document.getElementById('sim-google-btn');
      if (btn) btn.onclick = () => client.requestAccessToken();
    };

    if (window.google?.accounts?.oauth2) {
      initClient();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initClient;
      document.body.appendChild(script);
      addedScript = script;
    }

    return () => {
      if (addedScript && document.body.contains(addedScript)) {
        document.body.removeChild(addedScript);
      }
    };
  }, [handleTokenResponse]);

  return (
    <div className="sim-backdrop" onClick={onClose}>
      <div className="sim-card" onClick={e => e.stopPropagation()}>
        <button className="sim-close" onClick={onClose} title="Dismiss">✕</button>
        <h2 className="sim-title">Welcome to Loop</h2>
        <p className="sim-sub">Sign in to sync your calendar and schedule events with others.</p>
        <button id="sim-google-btn" className="sim-google-btn">
          <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );
};

export default SignInModal;
