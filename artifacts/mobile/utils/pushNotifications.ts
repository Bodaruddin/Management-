import Constants, { AppOwnership } from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const ANDROID_NOTIFICATION_CHANNEL_ID = "school_alerts_v2";
export const LEGACY_NOTIFICATION_CHANNEL_ID = "default";

export function isAndroidExpoGo(): boolean {
  return Platform.OS === "android" && Constants.appOwnership === AppOwnership.Expo;
}

export async function configureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  const channelConfig = {
    name: "School Announcements & Alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2563EB",
    sound: "default",
    enableVibrate: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  };

  try {
    await Promise.all([
      Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, channelConfig),
      Notifications.setNotificationChannelAsync(LEGACY_NOTIFICATION_CHANNEL_ID, {
        ...channelConfig,
        name: "School Notifications",
      }),
    ]);
  } catch (error) {
    console.warn("[push] Failed to configure notification channels:", error);
  }
}

export async function requestPushPermission() {
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  return permission;
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
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    "d4f8f33a-30dc-4535-a596-c574f491080e";
  if (!projectId) {
    throw new Error("Push notifications are not configured for this app build.");
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}
