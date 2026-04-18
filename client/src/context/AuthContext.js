import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { setAccessTokenForApi, clearAccessTokenForApi } from '../services/api';

const AuthContext = createContext(null);

const STORAGE_KEY = 'securebank_auth';

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved);

        if (parsed?.accessToken && parsed?.user) {
          setCurrentUser(parsed.user);
          setAccessToken(parsed.accessToken);
          setAccessTokenForApi(parsed.accessToken);
          setIsAuthenticated(true);
        }
      }
    } catch (error) {
      console.error('Failed to restore auth state:', error);
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (userData, token) => {
    setCurrentUser(userData);
    setAccessToken(token);
    setIsAuthenticated(true);
    setAccessTokenForApi(token);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: userData,
        accessToken: token,
      })
    );
  };

  const logout = () => {
    setCurrentUser(null);
    setAccessToken(null);
    setIsAuthenticated(false);
    clearAccessTokenForApi();
    localStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      currentUser,
      accessToken,
      isAuthenticated,
      isLoading,
      login,
      logout,
    }),
    [currentUser, accessToken, isAuthenticated, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return ctx;
};