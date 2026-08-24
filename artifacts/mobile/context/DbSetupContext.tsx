import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SETUP_KEY = '@db_setup_complete';
export const PENDING_CONFIG_KEY = '@db_pending_config';

export type DbProvider = 'supabase' | 'firebase' | 'postgresql' | 'custom';

export interface PendingDbConfig {
  provider: DbProvider;
  name: string;
  // PostgreSQL / Supabase / Custom
  url?: string;
  // Firebase
  projectId?: string;
  apiKey?: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  serviceAccountJson?: string;
}

interface DbSetupContextType {
  isSetupComplete: boolean | null; // null = loading
  localConfig: PendingDbConfig | null;
  markSetupComplete: () => Promise<void>;
  resetSetup: () => Promise<void>;
  saveLocalConfig: (config: PendingDbConfig) => Promise<void>;
  clearLocalConfig: () => Promise<void>;
}

const DbSetupContext = createContext<DbSetupContextType | null>(null);

export function DbSetupProvider({ children }: { children: React.ReactNode }) {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [localConfig, setLocalConfig] = useState<PendingDbConfig | null>(null);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  async function checkSetupStatus() {
    const [setup, cfg] = await AsyncStorage.multiGet([SETUP_KEY, PENDING_CONFIG_KEY]);
    setLocalConfig(cfg[1] ? JSON.parse(cfg[1]) : null);

    // Always verify with the server — the local cache may be stale if the
    // admin reset the DB connection from another device or the server restarted.
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const base = domain ? `https://${domain}` : '';
      const res = await fetch(`${base}/api/db-connections/active`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.connected === true) {
          await AsyncStorage.setItem(SETUP_KEY, 'true');
          setIsSetupComplete(true);
          return;
        }
      }
      // Server says no active user-configured DB — clear local cache and show setup
      await AsyncStorage.removeItem(SETUP_KEY);
      setIsSetupComplete(false);
    } catch {
      // Server unreachable — fall back to local cache so staff can still use the app
      const localDone = setup[1] === 'true';
      setIsSetupComplete(localDone);
    }
  }

  const markSetupComplete = async () => {
    await AsyncStorage.setItem(SETUP_KEY, 'true');
    setIsSetupComplete(true);
  };

  const resetSetup = async () => {
    await AsyncStorage.multiRemove([SETUP_KEY, PENDING_CONFIG_KEY]);
    setIsSetupComplete(false);
    setLocalConfig(null);
  };

  const saveLocalConfig = async (config: PendingDbConfig) => {
    await AsyncStorage.setItem(PENDING_CONFIG_KEY, JSON.stringify(config));
    setLocalConfig(config);
  };

  const clearLocalConfig = async () => {
    await AsyncStorage.removeItem(PENDING_CONFIG_KEY);
    setLocalConfig(null);
  };

  return (
    <DbSetupContext.Provider
      value={{ isSetupComplete, localConfig, markSetupComplete, resetSetup, saveLocalConfig, clearLocalConfig }}
    >
      {children}
    </DbSetupContext.Provider>
  );
}

export function useDbSetup() {
  const ctx = useContext(DbSetupContext);
  if (!ctx) throw new Error('useDbSetup must be used within DbSetupProvider');
  return ctx;
}
