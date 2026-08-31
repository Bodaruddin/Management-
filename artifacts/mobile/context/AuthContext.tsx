import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBase } from '@/constants/api';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'teacher';
  permissions?: {
    addStudent: boolean;
    feeCollection: boolean;
    manageClasses: boolean;
    manageExams: boolean;
    manageResults: boolean;
    promoteStudents: boolean;
    sendFeeReminder: boolean;
    allowMarkEdit: boolean;
  };
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string, role: 'admin' | 'teacher') => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changeAdminCredentials: (currentPassword: string, newUsername?: string, newPassword?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_KEY = '@school_auth_user';

async function readApiError(response: Response): Promise<string | undefined> {
  try {
    const data = await response.json();
    return typeof data?.error === 'string' ? data.error : undefined;
  } catch {
    return undefined;
  }
}

async function loginTeacher(
  username: string,
  password: string,
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  try {
    // Teacher credentials are verified by the API so staff do not need to
    // configure a database on their own device.
    const res = await fetch(`${getApiBase()}/api/teachers/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    if (res.status === 401) return { success: false, error: 'Invalid teacher credentials' };
    if (res.status === 503) return { success: false, error: 'DATABASE_NOT_READY' };
    if (!res.ok) {
      return {
        success: false,
        error: (await readApiError(res)) ?? `Server error (${res.status})`,
      };
    }
    const t: any = await res.json();
    const u: AuthUser = {
      id: t.id, name: t.name, username: t.username, role: 'teacher',
      permissions: {
        addStudent: false,
        feeCollection: false,
        manageClasses: false,
        manageExams: false,
        manageResults: false,
        promoteStudents: false,
        sendFeeReminder: false,
        allowMarkEdit: false,
        ...(t.permissions ?? {}),
      },
    };
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(u));
    return { success: true, user: u };
  } catch {
    return { success: false, error: 'Could not connect to server. Please try again.' };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY)
      .then((s) => { if (s) setUser(JSON.parse(s)); })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string, role: 'admin' | 'teacher'): Promise<{ success: boolean; error?: string }> => {
    if (role === 'admin') {
      try {
        const res = await fetch(`${getApiBase()}/api/settings/admin-credentials/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        if (res.status === 503) return { success: false, error: 'DATABASE_NOT_READY' };
        if (!res.ok) {
          return {
            success: false,
            error: (await readApiError(res)) ?? `Server error (${res.status})`,
          };
        }
        const data = await res.json();
        if (data.valid) {
          const u: AuthUser = { id: 'admin', name: 'Administrator', username: username.trim(), role: 'admin' };
          await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(u));
          setUser(u);
          return { success: true };
        }
        // Staff can sign in directly with their teacher credentials even when
        // the role toggle is still set to Admin (its default value).
        const teacherResult = await loginTeacher(username, password);
        if (teacherResult.success && 'user' in teacherResult && teacherResult.user) {
          setUser(teacherResult.user);
          return { success: true };
        }
        return { success: false, error: teacherResult.error ?? 'Invalid credentials' };
      } catch {
        return { success: false, error: 'Could not connect to server. Please try again.' };
      }
    }
    const teacherResult = await loginTeacher(username, password);
    if (teacherResult.success && 'user' in teacherResult && teacherResult.user) {
      setUser(teacherResult.user);
      return { success: true };
    }
    return { success: false, error: teacherResult.error ?? 'Invalid teacher credentials' };
  };

  const logout = async () => {
    await AsyncStorage.removeItem(AUTH_KEY);
    setUser(null);
  };

  const changeAdminCredentials = async (
    currentPassword: string,
    newUsername?: string,
    newPassword?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${getApiBase()}/api/settings/admin-credentials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newUsername, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Update failed' };
      // Update cached user if username changed
      if (newUsername && user) {
        const updated = { ...user, username: newUsername.trim() };
        await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(updated));
        setUser(updated);
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Could not connect to server. Please try again.' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, changeAdminCredentials }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
