import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type LocationCoordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

const TARGET_ACCURACY_METERS = 80;
const MAX_ACCEPTABLE_ACCURACY_METERS = 250;
const NATIVE_SAMPLES = 3;
const SAMPLE_DELAY_MS = 500;

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Location request timed out')), milliseconds);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function chooseBetterLocation(
  current: LocationCoordinates | null,
  next: LocationCoordinates,
): LocationCoordinates {
  if (!current) return next;
  if (next.accuracy === undefined) return current;
  if (current.accuracy === undefined || next.accuracy < current.accuracy) return next;
  return current;
}

function ensureUsableAccuracy(location: LocationCoordinates): LocationCoordinates {
  if (
    location.accuracy !== undefined
    && location.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS
  ) {
    throw new Error(
      `GPS accuracy is currently too low (±${Math.round(location.accuracy)}m). `
      + 'Turn on precise location and try again from the school grounds.',
    );
  }
  return location;
}

function getWebLocation(options: PositionOptions): Promise<LocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      reject,
      options,
    );
  });
}

async function readWebLocation(): Promise<LocationCoordinates> {
  let best: LocationCoordinates | null = null;
  let lastError: any;

  for (let attempt = 0; attempt < NATIVE_SAMPLES; attempt += 1) {
    try {
      const current = await getWebLocation({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
      best = chooseBetterLocation(best, current);
      if (best.accuracy !== undefined && best.accuracy <= TARGET_ACCURACY_METERS) break;
    } catch (error: any) {
      lastError = error;
      if (error?.code === 1) {
        throw new Error('Location permission is required to mark attendance');
      }
    }
    if (attempt < NATIVE_SAMPLES - 1) await wait(SAMPLE_DELAY_MS);
  }

  if (!best) {
    if (lastError?.code === 3) {
      try {
        best = await getWebLocation({
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 0,
        });
      } catch {
        throw new Error('Could not get your current location. Turn on location services and try again.');
      }
    } else {
      throw new Error(lastError?.message || 'Could not read your location');
    }
  }

  return ensureUsableAccuracy(best);
}

async function readNativeLocation(): Promise<LocationCoordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Location permission is required');

  let best: LocationCoordinates | null = null;
  let lastError: any;

  for (let attempt = 0; attempt < NATIVE_SAMPLES; attempt += 1) {
    try {
      const location = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
          mayShowUserSettingsDialog: true,
        }),
        12000,
      );
      best = chooseBetterLocation(best, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
      });
      if (best.accuracy !== undefined && best.accuracy <= TARGET_ACCURACY_METERS) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < NATIVE_SAMPLES - 1) await wait(SAMPLE_DELAY_MS);
  }

  if (!best) {
    try {
      const location = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: true,
        }),
        15000,
      );
      best = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
      };
    } catch {
      throw new Error(
        lastError?.message || 'Could not get your current location. Turn on location services and try again.',
      );
    }
  }

  if (!best) {
    throw new Error('Could not get your current location. Turn on location services and try again.');
  }
  return ensureUsableAccuracy(best);
}

export async function readCurrentLocation(): Promise<LocationCoordinates> {
  if (Platform.OS === 'web') return readWebLocation();
  return readNativeLocation();
}