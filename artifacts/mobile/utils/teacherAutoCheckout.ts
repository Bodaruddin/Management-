import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, Linking, Platform } from 'react-native';
import { getApiBase } from '@/constants/api';
import { AUTH_TOKEN_KEY } from '@/context/AuthContext';

const LOCATION_TASK = 'school-teacher-auto-checkout-location';
const ATTENDANCE_ID_KEY = '@school_auto_checkout_attendance_id';
const ATTENDANCE_DATE_KEY = '@school_auto_checkout_attendance_date';

type AuthenticatedFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function stopLocationTask(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // The task can already be stopped by Android or iOS after checkout.
  }
}

async function clearTrackingState(): Promise<void> {
  await stopLocationTask();
  await AsyncStorage.multiRemove([ATTENDANCE_ID_KEY, ATTENDANCE_DATE_KEY]);
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
    if (locations.length === 0) return;

    const [[, recordId], [, date], [, token]] = await AsyncStorage.multiGet([
      ATTENDANCE_ID_KEY,
      ATTENDANCE_DATE_KEY,
      AUTH_TOKEN_KEY,
    ]);
    if (!recordId || !date || !token) {
      await clearTrackingState();
      return;
    }

    const samples = locations.slice(-50).flatMap((location) => {
      const { latitude, longitude, accuracy } = location.coords;
      if (
        !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || !Number.isFinite(location.timestamp)
      ) return [];
      return [{
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        timestamp: new Date(location.timestamp).toISOString(),
      }];
    });
    if (samples.length === 0) return;

    try {
      const response = await fetch(
        `${getApiBase()}/api/teacher-attendance/${encodeURIComponent(recordId)}/location-samples`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ date, locations: samples }),
        },
      );
      if (response.ok) {
        const result = await response.json() as { checkedOut?: boolean };
        if (result.checkedOut) await clearTrackingState();
      } else if ([401, 403, 404, 409, 410].includes(response.status)) {
        await clearTrackingState();
      }
    } catch {
      // Keep the task registered after a temporary network failure; the next
      // background location batch will retry with the same open attendance.
    }
  });
}

async function requestBackgroundPermission(): Promise<boolean> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    const requestedForeground = await Location.requestForegroundPermissionsAsync();
    if (!requestedForeground.granted) {
      Alert.alert(
        'Location permission needed',
        'School Management needs foreground location permission to verify attendance.',
      );
      return false;
    }
  }

  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) background = await Location.requestBackgroundPermissionsAsync();
  if (background.granted) return true;

  const buttons = [
    { text: 'Not now', style: 'cancel' as const },
    ...(Platform.OS !== 'web' ? [{
      text: 'Open Settings',
      onPress: () => { void Linking.openSettings().catch(() => {}); },
    }] : []),
  ];
  Alert.alert(
    'Background location not enabled',
    'Automatic checkout needs location access while the app is in the background. You can still check out manually.',
    buttons,
  );
  return false;
}

async function startTracking(
  attendanceId: string,
  date: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<boolean> {
  if (!(await TaskManager.isAvailableAsync())) {
    throw new Error('Background location requires an installed native app build.');
  }
  if (!(await requestBackgroundPermission())) return false;

  const response = await authenticatedFetch(
    `/teacher-attendance/${encodeURIComponent(attendanceId)}/auto-checkout`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, enabled: true }),
    },
  );
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || 'The server could not enable automatic checkout.');
  }
  const enableResult = await response.json().catch(() => ({})) as { checkedOut?: boolean };
  if (enableResult.checkedOut) return false;

  await AsyncStorage.multiSet([
    [ATTENDANCE_ID_KEY, attendanceId],
    [ATTENDANCE_DATE_KEY, date],
  ]);
  try {
    if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 40,
        timeInterval: 5 * 60 * 1000,
        deferredUpdatesInterval: 5 * 60 * 1000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        ...(Platform.OS === 'android' ? {
          foregroundService: {
            notificationTitle: 'Automatic teacher checkout is on',
            notificationBody: 'School Management is recording location for attendance.',
            killServiceOnDestroy: false,
          },
        } : {}),
      });
    }
  } catch (error) {
    await authenticatedFetch(
      `/teacher-attendance/${encodeURIComponent(attendanceId)}/auto-checkout`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, enabled: false }),
      },
    ).catch(() => undefined);
    await clearTrackingState();
    throw error;
  }
  return true;
}

export async function offerTeacherAutoCheckout(
  attendanceId: string,
  date: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return new Promise((resolve) => {
    Alert.alert(
      'Enable automatic checkout?',
      'With your permission, the app uses background location to save the latest point inside the school boundary. It stops when you check out. Your phone may pause background updates, so you can still check out manually.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Enable',
          onPress: () => {
            void startTracking(attendanceId, date, authenticatedFetch)
              .then(resolve)
              .catch((error: unknown) => {
                Alert.alert(
                  'Automatic checkout was not enabled',
                  error instanceof Error ? error.message : 'You can still check out manually.',
                );
                resolve(false);
              });
          },
        },
      ],
      { cancelable: false },
    );
  });
}

export async function stopTeacherAutoCheckout(attendanceId?: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const activeAttendanceId = await AsyncStorage.getItem(ATTENDANCE_ID_KEY);
  if (attendanceId && activeAttendanceId !== attendanceId) return;
  await clearTrackingState();
}
