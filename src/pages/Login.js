import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { initGoogleCalendar } from '../utils/googleCalendar';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSuccess = async (credentialResponse) => {
    try {
      // Decode the JWT token to get user info
      const decoded = JSON.parse(atob(credentialResponse.credential.split('.')[1]));
      
      const userData = {
        name: decoded.name,
        email: decoded.email,
        picture: decoded.picture,
        accessToken: credentialResponse.credential
      };

      // Initialize Google Calendar with the access token
      initGoogleCalendar(credentialResponse.credential);

      // Log the user in
      login(userData);

      // Navigate to dashboard
      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      alert('Failed to log in. Please try again.');
    }
  };

  const handleError = () => {
    console.error('Login Failed');
    alert('Login failed. Please try again.');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Welcome</h1>
          <p>Sign in with your Google account to continue</p>
        </div>
        
        <div className="login-content">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            useOneTap
            scope="https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events"
          />
        </div>

        <div className="login-footer">
          <p>By signing in, you agree to sync your Google Calendar</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
