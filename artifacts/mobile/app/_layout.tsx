import React, { useEffect, useRef } from 'react';
import '@/utils/teacherAutoCheckout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState, Platform } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/context/AuthContext';
import { AppProvider } from '@/context/AppContext';
import { DbSetupProvider } from '@/context/DbSetupContext';
import { getApiBase } from '@/constants/api';
import { useAuth } from '@/context/AuthContext';
import { setBaseUrl } from '@workspace/api-client-react';
import { useRegisterTeacherNotificationDevice } from '@workspace/api-client-react';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import {
  configureAndroidNotificationChannel,
  getExpoPushToken,
  isAndroidExpoGo,
  requestPushPermission,
  showLocalPopupNotification,
} from '@/utils/pushNotifications';

SplashScreen.preventAutoHideAsync();

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

const queryClient = new QueryClient();
const ALERTED_NOTIFICATIONS_KEY = '@alerted_notification_ids_v1';

function RootLayoutNav() {
  const { user } = useAuth();
  const registerDeviceMutation = useRegisterTeacherNotificationDevice();
  const registerDeviceRef = useRef(registerDeviceMutation.mutateAsync);
  const isRegisteringDevice = useRef(false);
  const lastRegisteredTokenRef = useRef<string | null>(null);
  registerDeviceRef.current = registerDeviceMutation.mutateAsync;

  useEffect(() => {
    setBaseUrl(getApiBase() || null);
    if (Platform.OS === 'web') return;

    // Immediately configure Android notification channels on app startup
    void configureAndroidNotificationChannel();

    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/notifications' as any);
    });

    return () => subscription.remove();
  }, []);

  // Proactively check for new unread notifications and trigger mobile popup alert
  useEffect(() => {
    if (Platform.OS === 'web' || !user || user.role !== 'teacher') return;

    let isPolling = false;
    const checkInboxAndAlert = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const apiBase = getApiBase();
        if (!apiBase) return;
        const authData = await AsyncStorage.getItem('@school_auth_session_token');
        if (!authData) return;

        const res = await fetch(`${apiBase}/api/notifications/inbox`, {
          headers: { Authorization: `Bearer ${authData}` },
        });
        if (!res.ok) return;

        const data = await res.json() as {
          notifications?: Array<{ id: string; title: string; body: string; read?: boolean }>;
        };
        const items = Array.isArray(data.notifications) ? data.notifications : [];
        const unreadItems = items.filter((n) => !n.read);

        // Update device app badge
        await Notifications.setBadgeCountAsync(unreadItems.length).catch(() => undefined);

        // Check which items haven't been alerted locally yet
        const rawAlerted = await AsyncStorage.getItem(ALERTED_NOTIFICATIONS_KEY);
        const alertedIds = new Set<string>(rawAlerted ? JSON.parse(rawAlerted) : []);
        let updated = false;

        for (const item of unreadItems) {
          if (!alertedIds.has(item.id)) {
            alertedIds.add(item.id);
            updated = true;
            await showLocalPopupNotification(item.title, item.body, {
              notificationId: item.id,
              screen: 'notifications',
            });
          }
        }

        if (updated) {
          // Keep the alerted set trimmed
          const idsArray = Array.from(alertedIds).slice(-100);
          await AsyncStorage.setItem(ALERTED_NOTIFICATIONS_KEY, JSON.stringify(idsArray));
        }
      } catch (error) {
        // Background notification sync failures should not interrupt UI
      } finally {
        isPolling = false;
      }
    };

    void checkInboxAndAlert();
    const interval = setInterval(checkInboxAndAlert, 20_000);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkInboxAndAlert();
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [user?.id, user?.role]);

  // Register push token for teachers and admins
  useEffect(() => {
    if (Platform.OS === 'web' || !user || isAndroidExpoGo()) return;
    let mounted = true;

    const registerDevice = async () => {
      if (!mounted || isRegisteringDevice.current) return;
      isRegisteringDevice.current = true;
      try {
        let permission = await Notifications.getPermissionsAsync();
        if (!permission.granted) {
          permission = await requestPushPermission();
        }
        if (!mounted || !permission.granted) return;

        const token = await getExpoPushToken();
        if (!mounted || !token) return;

        const registrationKey = `${user.id}:${token}`;
        if (lastRegisteredTokenRef.current === registrationKey) {
          return;
        }

        await registerDeviceRef.current({ data: { token } });
        lastRegisteredTokenRef.current = registrationKey;
      } catch (error) {
        console.warn(
          '[push] Device registration will retry when the app is reopened.',
          error instanceof Error ? error.message : 'Unknown notification error',
        );
      } finally {
        isRegisteringDevice.current = false;
      }
    };

    void registerDevice();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void registerDevice();
    });

    return () => {
      mounted = false;
      appStateSubscription.remove();
    };
  }, [user?.id, user?.role]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="db-setup" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen name="teacher" />
      <Stack.Screen name="messaging" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="db-manager" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <DbSetupProvider>
          <AuthProvider>
            <AppProvider>
              <QueryClientProvider client={queryClient}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </QueryClientProvider>
            </AppProvider>
          </AuthProvider>
        </DbSetupProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
