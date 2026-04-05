import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api';
import type { User } from '../api';
import { isAdmin } from '../utils/roles';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string, totpCode?: string, backupCode?: string) => Promise<void>;
  loginWithToken: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    authApi.me()
      .then((res) => {
        if (res.data.code === 0) setUser(res.data.data);
        else { localStorage.removeItem('token'); setToken(null); }
      })
      .catch(() => { localStorage.removeItem('token'); setToken(null); })
      .finally(() => setIsLoading(false));
  }, [token]);

  const login = async (username: string, password: string, totpCode?: string, backupCode?: string) => {
    const res = await authApi.login(username, password, totpCode, backupCode);
    if (res.data.code === -2) {
      // 2FA required
      throw new Error('2FA_REQUIRED');
    }
    if (res.data.code !== 0) throw new Error(res.data.msg);
    const { token: tok, user: u } = res.data.data;
    localStorage.setItem('token', tok);
    setToken(tok);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const updateUser = (nextUser: User) => {
    setUser(nextUser);
  };

  const loginWithToken = (nextToken: string, nextUser: User) => {
    localStorage.setItem('token', nextToken);
    setToken(nextToken);
    setUser(nextUser);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, loginWithToken, logout, updateUser, isAdmin: isAdmin(user?.role) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
