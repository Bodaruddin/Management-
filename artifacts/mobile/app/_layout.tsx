import React, { useEffect, useRef } from 'react';
import '@/utils/teacherAutoCheckout';
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
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts,
} from '@expo-google-fonts/inter';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { getExpoPushToken, isAndroidExpoGo } from '@/utils/pushNotifications';

SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient();

function RootLayoutNav() {
  const { user } = useAuth();
  const registerDeviceMutation = useRegisterTeacherNotificationDevice();
  const registerDeviceRef = useRef(registerDeviceMutation.mutateAsync);
  const isRegisteringDevice = useRef(false);
  registerDeviceRef.current = registerDeviceMutation.mutateAsync;

  useEffect(() => {
    setBaseUrl(getApiBase() || null);
    if (Platform.OS === 'web') return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/notifications' as any);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || user?.role !== 'teacher' || isAndroidExpoGo()) return;

    let mounted = true;
    const registerIfPermissionGranted = async () => {
      if (!mounted || isRegisteringDevice.current) return;
      isRegisteringDevice.current = true;
      try {
        const permission = await Notifications.getPermissionsAsync();
        if (!mounted || !permission.granted) return;
        const token = await getExpoPushToken();
        if (!mounted) return;
        await registerDeviceRef.current({ data: { token } });
      } catch (error) {
        console.warn(
          '[push] Device registration will retry when the app is reopened.',
          error instanceof Error ? error.message : 'Unknown notification error',
        );
      } finally {
        isRegisteringDevice.current = false;
      }
    };

    void registerIfPermissionGranted();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void registerIfPermissionGranted();
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
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  useEffect(() => { if (fontsLoaded || fontError) SplashScreen.hideAsync(); }, [fontsLoaded, fontError]);
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
