import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { initGoogleCalendar } from '../utils/googleCalendar';
import './Login.css';


  const initializeGoogleSignIn = () => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      scope: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks',
      callback: handleTokenResponse,
    });

    // Attach click handler to button
    const signInButton = document.getElementById('google-sign-in-button');
    if (signInButton) {
      signInButton.onclick = () => {
        client.requestAccessToken();
      };
    }
  };

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    // Load Google Identity Services
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      initializeGoogleSignIn(handleTokenResponse, process.env.REACT_APP_GOOGLE_CLIENT_ID);
    };

    return () => {
      document.body.removeChild(script);
    };
  }, [handleTokenResponse]);


  const handleTokenResponse = useCallback(async (response) => {
    if (response.access_token) {
      try {
        // Get user info using the access token
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${response.access_token}`,
          },
        });

        const userInfo = await userInfoResponse.json();

        const userData = {
          name: userInfo.name,
          email: userInfo.email,
          picture: userInfo.picture,
          accessToken: response.access_token,
        };

        // Initialize Google Calendar with the access token
        initGoogleCalendar(response.access_token);

        // Log the user in
        login(userData);

        // Navigate to dashboard
        navigate('/dashboard');
      } catch (error) {
        console.error('Error fetching user info:', error);
        alert('Failed to get user information. Please try again.');
      }
    } else {
      console.error('No access token received');
      alert('Failed to log in. Please try again.');
    }
  }, [login, navigate]);

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Welcome</h1>
          <p>Sign in with your Google account to continue</p>
        </div>
        
        <div className="login-content">
          <button id="google-sign-in-button" className="google-sign-in-btn">
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

        <div className="login-footer">
          <p>This app will access your:</p>
          <ul>
            <li>Google Calendar (read & write)</li>
            <li>Google Tasks (read & write)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Login;
