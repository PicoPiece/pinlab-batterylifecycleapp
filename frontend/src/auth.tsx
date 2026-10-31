import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "./api";
import type { AccessInfo, User } from "./types";

interface AuthContextValue {
  user: User | null;
  access: AccessInfo | null;
  loading: boolean;
  canWrite: boolean;
  canManageAccess: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const nextUser = await api.me();
      let nextAccess: AccessInfo | null = null;
      try {
        nextAccess = await api.access();
      } catch {
        nextAccess = null;
      }
      setUser(nextUser);
      setAccess(nextAccess);
    } catch {
      setUser(null);
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handler = () => {
      setUser(null);
      setAccess(null);
    };
    window.addEventListener("pinlab:unauthorized", handler);
    return () => window.removeEventListener("pinlab:unauthorized", handler);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const nextUser = await api.login(email, password);
    let nextAccess: AccessInfo | null = null;
    try {
      nextAccess = await api.access();
    } catch {
      nextAccess = null;
    }
    setUser(nextUser);
    setAccess(nextAccess);
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setAccess(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      access,
      loading,
      canWrite: access?.can_write ?? false,
      canManageAccess: access?.can_manage_access ?? false,
      login,
      logout,
      refresh,
    }),
    [user, access, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <span>Đang tải phiên làm việc…</span>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

export function RequireAccess({ children }: { children: ReactNode }) {
  const { access, loading } = useAuth();
  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <span>Đang tải quyền truy cập…</span>
      </div>
    );
  }
  if (!access?.can_manage_access) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
