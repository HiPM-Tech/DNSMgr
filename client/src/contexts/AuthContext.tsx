import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api';
import type { User, WebAuthnResponse } from '../api';
import { isAdmin } from '../utils/roles';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string, totpCode?: string, backupCode?: string, webauthnResponse?: WebAuthnResponse) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Token is now stored in httpOnly cookie, managed by server
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated by calling /me endpoint
    authApi.me()
      .then((res) => {
        if (res.data.code === 0) setUser(res.data.data);
      })
      .catch(() => {
        // Not authenticated or token expired
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string, totpCode?: string, backupCode?: string, webauthnResponse?: WebAuthnResponse) => {
    const res = await authApi.login(username, password, totpCode, backupCode, webauthnResponse);
    if (res.data.code === -2) {
      // 2FA required
      const err = new Error('2FA_REQUIRED') as Error & { types?: string[] };
      err.types = res.data.data?.types || ['totp'];
      throw err;
    }
    if (res.data.code !== 0) throw new Error(res.data.msg);
    // Token is set via httpOnly cookie by server
    const { user: u } = res.data.data;
    if (u) setUser(u);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Ignore errors during logout
    } finally {
      setUser(null);
    }
  };

  const updateUser = (nextUser: User) => {
    setUser(nextUser);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser, isAdmin: isAdmin(user?.role) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
