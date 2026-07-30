import { createContext, useState, useContext, useEffect } from 'react';
import { clearTokenCache } from '../utils/googleCalendar';
import { DEMO_STORAGE_KEYS } from '../demo/demoStore';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      // Optimistic restore from localStorage (no network wait), then validate
      // the session cookie in the background — an expired/invalid session
      // forces a clean local logout instead of a page of failing 401 fetches.
      setUser(JSON.parse(storedUser));
      setIsAuthenticated(true);
      fetch('/api/user?op=session')
        .then(r => { if (r.status === 401) logout(); })
        .catch(() => {}); // network hiccup: keep the optimistic state
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    localStorage.removeItem('googleUserId');
    // Legacy keys from the pre-session token flow — clear so old storage
    // can't linger on upgraded clients.
    localStorage.removeItem('googleAccessToken');
    localStorage.removeItem('googleTokenExpiry');
    // Demo mode borrows the same identity keys, so signing out of one must
    // never leave the app half in the other.
    DEMO_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    clearTokenCache();
    // Invalidate the httpOnly session cookie server-side (fire-and-forget).
    fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'logout' }),
    }).catch(() => {});
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
