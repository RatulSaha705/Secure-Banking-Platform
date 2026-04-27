import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  setAccessTokenForApi,
  clearAccessTokenForApi,
} from '../services/api';

import {
  refreshSession,
  recordSessionActivity,
  logoutUser,
} from '../services/authService';

const AuthContext = createContext(null);

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVITY_SYNC_THROTTLE_MS = 30 * 1000;

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const idleTimerRef = useRef(null);
  const lastActivitySyncRef = useRef(0);
  const logoutInProgressRef = useRef(false);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearAuthState = useCallback(() => {
    setCurrentUser(null);
    setAccessToken(null);
    setIsAuthenticated(false);
    clearAccessTokenForApi();
    clearIdleTimer();
  }, [clearIdleTimer]);

  const logout = useCallback(
    async ({ redirectToLogin = false, reason = null } = {}) => {
      if (logoutInProgressRef.current) return;

      logoutInProgressRef.current = true;

      try {
        await logoutUser();
      } catch (_error) {
        // Even if the server session is already expired, clear the client state.
      } finally {
        clearAuthState();
        logoutInProgressRef.current = false;

        if (redirectToLogin) {
          const reasonQuery = reason ? `?reason=${encodeURIComponent(reason)}` : '';
          window.location.assign(`/login${reasonQuery}`);
        }
      }
    },
    [clearAuthState]
  );

  const forceIdleLogout = useCallback(() => {
    logout({
      redirectToLogin: true,
      reason: 'idle-timeout',
    });
  }, [logout]);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimer();

    idleTimerRef.current = setTimeout(() => {
      forceIdleLogout();
    }, IDLE_TIMEOUT_MS);
  }, [clearIdleTimer, forceIdleLogout]);

  const syncActivityWithServer = useCallback(async () => {
    const now = Date.now();

    if (now - lastActivitySyncRef.current < ACTIVITY_SYNC_THROTTLE_MS) {
      return;
    }

    lastActivitySyncRef.current = now;

    try {
      await recordSessionActivity();
    } catch (_error) {
      // If this fails, the next protected request or refresh will handle it.
    }
  }, []);

  const handleUserActivity = useCallback(() => {
    if (!isAuthenticated) return;

    resetIdleTimer();
    syncActivityWithServer();
  }, [isAuthenticated, resetIdleTimer, syncActivityWithServer]);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        const res = await refreshSession();
        const token = res.data?.accessToken;
        const user = res.data?.user;

        if (!mounted) return;

        if (token && user) {
          setCurrentUser(user);
          setAccessToken(token);
          setAccessTokenForApi(token);
          setIsAuthenticated(true);
        } else {
          clearAuthState();
        }
      } catch (_error) {
        if (mounted) clearAuthState();
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    restoreSession();

    return () => {
      mounted = false;
    };
  }, [clearAuthState]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearIdleTimer();
      return undefined;
    }

    resetIdleTimer();

    const activityEvents = [
      'click',
      'keydown',
      'scroll',
      'touchstart',
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleUserActivity, {
        passive: true,
      });
    });

    return () => {
      clearIdleTimer();

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserActivity);
      });
    };
  }, [isAuthenticated, handleUserActivity, resetIdleTimer, clearIdleTimer]);

  const login = useCallback(
    (userData, token) => {
      setCurrentUser(userData);
      setAccessToken(token);
      setIsAuthenticated(true);
      setAccessTokenForApi(token);
      lastActivitySyncRef.current = 0;
      resetIdleTimer();
    },
    [resetIdleTimer]
  );

  const value = useMemo(
    () => ({
      currentUser,
      accessToken,
      isAuthenticated,
      isLoading,
      login,
      logout,
    }),
    [currentUser, accessToken, isAuthenticated, isLoading, login, logout]
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