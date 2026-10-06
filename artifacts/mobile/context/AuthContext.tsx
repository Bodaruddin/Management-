import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBase } from '@/constants/api';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'teacher';
  linkedTeacherId?: string | null;
  isAdminTeacher?: boolean;
  adminId?: string;
  permissions?: {
    addStudent: boolean;
    feeCollection: boolean;
    manageClasses: boolean;
    manageExams: boolean;
    manageResults: boolean;
    promoteStudents: boolean;
    sendFeeReminder: boolean;
    allowMarkEdit: boolean;
    reEnrollFace: boolean;
    facelessAttendance: boolean;
  };
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  authenticatedFetch: (path: string, init?: RequestInit) => Promise<Response>;
  login: (username: string, password: string, role: 'admin' | 'teacher') => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changeAdminCredentials: (currentPassword: string, newUsername?: string, newPassword?: string) => Promise<{ success: boolean; error?: string }>;
  listAdminUsers: () => Promise<AdminUser[]>;
  createAdminUser: (data: { name: string; username: string; password: string; linkedTeacherId?: string | null }) => Promise<{ success: boolean; error?: string }>;
  updateAdminUser: (id: string, data: { name?: string; password?: string; linkedTeacherId?: string | null }) => Promise<{ success: boolean; error?: string }>;
  forceLogoutTeacher: (teacherId: string) => Promise<{ success: boolean; error?: string; revokedSessions?: number }>;
  switchToTeacher: () => Promise<{ success: boolean; error?: string }>;
  switchToAdmin: () => Promise<{ success: boolean; error?: string }>;
}

export interface AdminUser {
  id: string;
  name: string;
  username: string;
  linkedTeacherId?: string | null;
  createdAt?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_KEY = '@school_auth_user';
const ADMIN_SESSION_KEY = '@school_admin_session';
const AUTH_TOKEN_KEY = '@school_auth_session_token';
const SESSION_CHECK_INTERVAL_MS = 20_000;

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
): Promise<{ success: boolean; user?: AuthUser; sessionToken?: string; error?: string }> {
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
    if (typeof t.sessionToken !== 'string' || !t.sessionToken) {
      return { success: false, error: 'The server could not start a secure session. Please try again.' };
    }
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
        reEnrollFace: false,
        facelessAttendance: false,
        ...(t.permissions ?? {}),
      },
    };
    return { success: true, user: u, sessionToken: t.sessionToken };
  } catch {
    return { success: false, error: 'Could not connect to server. Please try again.' };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const authenticatedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!path.startsWith('/')) throw new Error('Authenticated API paths must be relative to /api.');
    if (!sessionToken) throw new Error('Your session has expired. Please sign in again.');
    const headers = {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${sessionToken}`,
    };
    return fetch(`${getApiBase()}/api${path}`, { ...init, headers });
  }, [sessionToken]);

  const clearLocalSession = useCallback(async () => {
    await AsyncStorage.multiRemove([AUTH_KEY, ADMIN_SESSION_KEY, AUTH_TOKEN_KEY]);
    setUser(null);
    setSessionToken(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const values = await AsyncStorage.multiGet([AUTH_KEY, AUTH_TOKEN_KEY]);
        if (cancelled) return;
        const savedUser = values[0]?.[1];
        const savedToken = values[1]?.[1];
        if (!savedUser || !savedToken) {
          await AsyncStorage.multiRemove([AUTH_KEY, ADMIN_SESSION_KEY, AUTH_TOKEN_KEY]);
          return;
        }
        try {
          setUser(JSON.parse(savedUser) as AuthUser);
          setSessionToken(savedToken);
        } catch {
          await AsyncStorage.multiRemove([AUTH_KEY, ADMIN_SESSION_KEY, AUTH_TOKEN_KEY]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user || !sessionToken) return;
    let mounted = true;
    let checking = false;

    const validateSession = async () => {
      if (!mounted || checking) return;
      checking = true;
      try {
        const response = await fetch(`${getApiBase()}/api/auth/session`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (mounted && response.status === 401) {
          await clearLocalSession();
        }
      } catch {
        // Keep the cached session during a network outage. Retry on the next
        // interval or when the app returns to the foreground.
      } finally {
        checking = false;
      }
    };

    void validateSession();
    const interval = setInterval(() => { void validateSession(); }, SESSION_CHECK_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void validateSession();
    });
    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [user?.id, user?.role, sessionToken, clearLocalSession]);

  const persistLogin = async (nextUser: AuthUser, token: string) => {
    await AsyncStorage.multiSet([
      [AUTH_KEY, JSON.stringify(nextUser)],
      [AUTH_TOKEN_KEY, token],
    ]);
    setSessionToken(token);
    setUser(nextUser);
  };

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
          if (typeof data.sessionToken !== 'string' || !data.sessionToken) {
            return { success: false, error: 'The server could not start a secure session. Please try again.' };
          }
          const admin = data.admin ?? { id: 'admin', name: 'Administrator', username: username.trim(), linkedTeacherId: null };
          const u: AuthUser = {
            id: admin.id,
            name: admin.name,
            username: admin.username,
            role: 'admin',
            linkedTeacherId: admin.linkedTeacherId ?? null,
          };
          await persistLogin(u, data.sessionToken);
          return { success: true };
        }
        // Staff can sign in directly with their teacher credentials even when
        // the role toggle is still set to Admin (its default value).
        const teacherResult = await loginTeacher(username, password);
        if (teacherResult.success && teacherResult.user && teacherResult.sessionToken) {
          await persistLogin(teacherResult.user, teacherResult.sessionToken);
          return { success: true };
        }
        return { success: false, error: teacherResult.error ?? 'Invalid credentials' };
      } catch {
        return { success: false, error: 'Could not connect to server. Please try again.' };
      }
    }
    const teacherResult = await loginTeacher(username, password);
    if (teacherResult.success && teacherResult.user && teacherResult.sessionToken) {
      await persistLogin(teacherResult.user, teacherResult.sessionToken);
      return { success: true };
    }
    return { success: false, error: teacherResult.error ?? 'Invalid teacher credentials' };
  };

  const logout = async () => {
    const tokens = new Set<string>();
    if (sessionToken) tokens.add(sessionToken);
    try {
      const storedAdminSession = await AsyncStorage.getItem(ADMIN_SESSION_KEY);
      if (storedAdminSession) {
        const snapshot = JSON.parse(storedAdminSession) as { sessionToken?: unknown };
        if (typeof snapshot.sessionToken === 'string') tokens.add(snapshot.sessionToken);
      }
    } catch {
      // A malformed saved admin snapshot must not block local sign-out.
    }
    await Promise.all([...tokens].map(async token => {
      try {
        await fetch(`${getApiBase()}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Local sign-out must still complete if the server is offline.
      }
    }));
    await clearLocalSession();
  };

  const forceLogoutTeacher = async (teacherId: string) => {
    if (!user || user.role !== 'admin' || !sessionToken) {
      return { success: false, error: 'Sign in as an administrator to manage teacher access.' };
    }
    try {
      const res = await fetch(`${getApiBase()}/api/teachers/${encodeURIComponent(teacherId)}/force-logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) {
        const error = (await readApiError(res)) ?? `Server error (${res.status})`;
        if (res.status === 401) await clearLocalSession();
        return { success: false, error };
      }
      const data = await res.json();
      return { success: true, revokedSessions: Number(data.revokedSessions) || 0 };
    } catch {
      return { success: false, error: 'Could not connect to the server. Please try again.' };
    }
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
      body: JSON.stringify({ adminId: user?.id ?? 'admin', currentPassword, newUsername, newPassword }),
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

  const listAdminUsers = async (): Promise<AdminUser[]> => {
    try {
      const res = await fetch(`${getApiBase()}/api/settings/admin-users`);
      if (!res.ok) throw new Error((await readApiError(res)) ?? `Server error (${res.status})`);
      return await res.json();
    } catch (error: any) {
      throw new Error(error?.message ?? 'Could not load administrator accounts');
    }
  };

  const createAdminUser = async (data: {
    name: string; username: string; password: string; linkedTeacherId?: string | null;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${getApiBase()}/api/settings/admin-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, adminId: user?.id }),
      });
      if (!res.ok) return { success: false, error: (await readApiError(res)) ?? `Server error (${res.status})` };
      return { success: true };
    } catch {
      return { success: false, error: 'Could not connect to server. Please try again.' };
    }
  };

  const updateAdminUser = async (
    id: string,
    data: { name?: string; password?: string; linkedTeacherId?: string | null },
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${getApiBase()}/api/settings/admin-users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, adminId: user?.id }),
      });
      if (!res.ok) return { success: false, error: (await readApiError(res)) ?? `Server error (${res.status})` };
      const updated = await res.json();
      if (user?.id === id) {
        const nextUser = { ...user, name: updated.name, linkedTeacherId: updated.linkedTeacherId ?? null };
        await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(nextUser));
        setUser(nextUser);
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Could not connect to server. Please try again.' };
    }
  };

  const switchToTeacher = async (): Promise<{ success: boolean; error?: string }> => {
    if (!user || user.role !== 'admin' || !user.linkedTeacherId) {
      return { success: false, error: 'Link this administrator to a teacher profile first.' };
    }
    if (!sessionToken) {
      return { success: false, error: 'Your administrator session has expired. Please sign in again.' };
    }
    try {
      const res = await fetch(`${getApiBase()}/api/settings/admin-users/${encodeURIComponent(user.id)}/switch-teacher`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!res.ok) return { success: false, error: (await readApiError(res)) ?? `Server error (${res.status})` };
      const teacher = await res.json();
      if (typeof teacher.sessionToken !== 'string' || !teacher.sessionToken) {
        return { success: false, error: 'The server could not start a secure teacher session. Please try again.' };
      }
      const teacherUser: AuthUser = {
        id: teacher.id,
        name: teacher.name,
        username: teacher.username,
        role: 'teacher',
        isAdminTeacher: true,
        adminId: user.id,
        permissions: {
          addStudent: false, feeCollection: false, manageClasses: false, manageExams: false,
          manageResults: false, promoteStudents: false, sendFeeReminder: false,
          allowMarkEdit: false, reEnrollFace: false, facelessAttendance: false,
          ...(teacher.permissions ?? {}),
        },
      };
      await AsyncStorage.multiSet([
        [ADMIN_SESSION_KEY, JSON.stringify({ user, sessionToken })],
        [AUTH_KEY, JSON.stringify(teacherUser)],
        [AUTH_TOKEN_KEY, teacher.sessionToken],
      ]);
      setSessionToken(teacher.sessionToken);
      setUser(teacherUser);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not switch panels. Please try again.' };
    }
  };

  const switchToAdmin = async (): Promise<{ success: boolean; error?: string }> => {
    if (!user?.isAdminTeacher) return { success: false, error: 'This teacher account is not linked to an administrator.' };
    try {
      const stored = await AsyncStorage.getItem(ADMIN_SESSION_KEY);
      if (!stored) return { success: false, error: 'The administrator session has expired. Please sign in again.' };
      const snapshot = JSON.parse(stored) as { user?: AuthUser; sessionToken?: unknown } & Partial<AuthUser>;
      const adminUser = snapshot.user ?? snapshot as AuthUser;
      // Older app versions left the admin token active while switching panels.
      const adminToken = typeof snapshot.sessionToken === 'string' ? snapshot.sessionToken : sessionToken;
      if (!adminToken) return { success: false, error: 'The administrator session has expired. Please sign in again.' };

      await AsyncStorage.multiSet([
        [AUTH_KEY, JSON.stringify(adminUser)],
        [AUTH_TOKEN_KEY, adminToken],
      ]);
      await AsyncStorage.removeItem(ADMIN_SESSION_KEY);
      const teacherToken = sessionToken;
      setSessionToken(adminToken);
      setUser(adminUser);
      if (teacherToken && teacherToken !== adminToken) {
        void fetch(`${getApiBase()}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${teacherToken}` },
        }).catch(() => undefined);
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Could not switch panels. Please try again.' };
    }
  };

  return (
    <AuthContext.Provider value={{
      user, isLoading, authenticatedFetch, login, logout, changeAdminCredentials, forceLogoutTeacher,
      listAdminUsers, createAdminUser, updateAdminUser, switchToTeacher, switchToAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
