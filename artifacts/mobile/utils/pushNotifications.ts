import Constants, { AppOwnership } from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const ANDROID_NOTIFICATION_CHANNEL_ID = "default";

export function isAndroidExpoGo(): boolean {
  return Platform.OS === "android" && Constants.appOwnership === AppOwnership.Expo;
}

export async function configureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
    name: "School notifications",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2563EB",
  });
}

export async function getExpoPushToken(): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error("Push notifications are available in the installed mobile app.");
  }
  if (isAndroidExpoGo()) {
    throw new Error(
      "Android remote push notifications are unavailable in Expo Go. Install a development or release build to receive phone alerts.",
    );
  }

  await configureAndroidNotificationChannel();

  const projectId = Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error("Push notifications are not configured for this app build.");
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}
