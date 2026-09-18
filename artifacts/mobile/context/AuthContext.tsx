import React, { createContext, useContext, useState, useEffect } from 'react';
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
  };
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string, role: 'admin' | 'teacher') => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changeAdminCredentials: (currentPassword: string, newUsername?: string, newPassword?: string) => Promise<{ success: boolean; error?: string }>;
  listAdminUsers: () => Promise<AdminUser[]>;
  createAdminUser: (data: { name: string; username: string; password: string; linkedTeacherId?: string | null }) => Promise<{ success: boolean; error?: string }>;
  updateAdminUser: (id: string, data: { name?: string; password?: string; linkedTeacherId?: string | null }) => Promise<{ success: boolean; error?: string }>;
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
        reEnrollFace: false,
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
         const admin = data.admin ?? { id: 'admin', name: 'Administrator', username: username.trim(), linkedTeacherId: null };
         const u: AuthUser = {
           id: admin.id,
           name: admin.name,
           username: admin.username,
           role: 'admin',
           linkedTeacherId: admin.linkedTeacherId ?? null,
         };
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
    await AsyncStorage.multiRemove([AUTH_KEY, ADMIN_SESSION_KEY]);
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
    try {
      const res = await fetch(`${getApiBase()}/api/settings/admin-users/${encodeURIComponent(user.id)}/switch-teacher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: user.id }),
      });
      if (!res.ok) return { success: false, error: (await readApiError(res)) ?? `Server error (${res.status})` };
      const teacher = await res.json();
      await AsyncStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(user));
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
          allowMarkEdit: false, reEnrollFace: false, ...(teacher.permissions ?? {}),
        },
      };
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(teacherUser));
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
      const adminUser = JSON.parse(stored) as AuthUser;
      await AsyncStorage.multiRemove([AUTH_KEY, ADMIN_SESSION_KEY]);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(adminUser));
      setUser(adminUser);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not switch panels. Please try again.' };
    }
  };

  return (
    <AuthContext.Provider value={{
      user, isLoading, login, logout, changeAdminCredentials,
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
