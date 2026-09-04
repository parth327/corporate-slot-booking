/**
 * Session state and route guarding.
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi, getStoredAuth, setStoredAuth, clearStoredAuth, setAuthToken } from './api.js';
import Spinner from '../components/ui/Spinner.jsx';

const AuthContext = createContext(null);

export function roleHome(role) {
  if (role === 'ADMIN') return '/admin';
  if (role === 'AUTHORITY') return '/authority';
  if (role === 'GUARD') return '/guard';
  return '/login';
}

export function AuthProvider({ children }) {
  // Hydrate synchronously so an authenticated reload never flashes the login page.
  const [auth, setAuth] = useState(() => {
    const stored = getStoredAuth();
    if (stored?.token) setAuthToken(stored.token);
    return stored;
  });
  const [loading, setLoading] = useState(Boolean(auth?.token));
  const navigate = useNavigate();

  // Confirm the stored token is still good, without blocking first paint.
  // Runs once for whatever token was present at mount — not on every token
  // change, since login()/logout() already manage `loading` themselves.
  //
  // Deliberately no "have we already run" ref guard here: under StrictMode's
  // dev-only mount -> cleanup -> mount, a ref would survive the fake unmount
  // and block the real second run, while the *cancelled* flag from the first
  // (deliberately torn-down) run would suppress its own setLoading(false) —
  // net result, `loading` stuck true forever and the app stuck on a spinner.
  // The plain `cancelled` closure per-invocation already does the right thing
  // on its own: the torn-down first run's result is discarded, and the real
  // second run resolves normally.
  useEffect(() => {
    const token = auth?.token;
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    authApi
      .me()
      .then((data) => {
        if (cancelled) return;
        setAuth((prev) => {
          const next = { token: prev?.token, user: data.user };
          setStoredAuth(next);
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredAuth();
        setAuth(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password });
    const next = { token: data.token, user: data.user };
    setAuthToken(data.token);
    setStoredAuth(next);
    setAuth(next);
    setLoading(false);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setAuthToken(null);
    setAuth(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({
      user: auth?.user ?? null,
      token: auth?.token ?? null,
      loading,
      login,
      logout,
      isRole: (role) => auth?.user?.role === role,
    }),
    [auth, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }
  return children;
}
