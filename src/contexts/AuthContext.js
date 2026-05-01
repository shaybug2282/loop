import { createContext, useState, useContext, useEffect } from 'react';
import { setTokenClient, clearTokenRefresh } from '../utils/googleCalendar';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Re-initialize the GIS token client after a page reload so silent refresh still works.
// The callback is intentionally empty here — it gets overwritten per-refresh in getValidToken.
const rehydrateTokenClient = () => {
  const init = () => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      scope: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks',
      callback: () => {},
    });
    setTokenClient(client);
  };

  if (window.google?.accounts?.oauth2) {
    init();
  } else {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    document.body.appendChild(script);
    script.onload = init;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      setIsAuthenticated(true);
      // Restore GIS client so silent token refresh works after page reload
      rehydrateTokenClient();
    }
    setIsLoading(false);
  }, []);

  const login = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('user');
    localStorage.removeItem('googleAccessToken');
    localStorage.removeItem('googleTokenExpiry');
    localStorage.removeItem('googleUserId');
    clearTokenRefresh();
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
