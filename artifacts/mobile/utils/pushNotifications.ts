import Constants, { AppOwnership } from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const ANDROID_NOTIFICATION_CHANNEL_ID = "school_alerts_v2";
export const LEGACY_NOTIFICATION_CHANNEL_ID = "default";
export const DAILY_NOTIFICATION_CHANNEL_ID = "school_daily_alerts";

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
      Notifications.setNotificationChannelAsync(DAILY_NOTIFICATION_CHANNEL_ID, {
        ...channelConfig,
        name: "Daily Announcements",
      }),
      Notifications.setNotificationChannelAsync("miscellaneous", {
        ...channelConfig,
        name: "School System Alerts",
      }),
    ]);
  } catch (error) {
    console.warn("[push] Failed to configure notification channels:", error);
  }
}

// Ensure channels are prepared as early as possible
if (Platform.OS === "android") {
  void configureAndroidNotificationChannel();
}

export async function requestPushPermission() {
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    permission = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
  }
  return permission;
}

export async function showLocalPopupNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await configureAndroidNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: "default",
        vibrate: [0, 250, 250, 250],
        priority: Notifications.AndroidNotificationPriority.MAX,
        channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
        data: data ?? { screen: "notifications" },
      },
      trigger: null, // show immediately as heads-up notification
    });
  } catch (error) {
    console.warn("[push] Failed to present local popup notification:", error);
  }
}

export async function getExpoPushToken(): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error("Push notifications are available in the installed mobile app.");
  }
  if (isAndroidExpoGo()) {
    throw new Error(
      "Android remote push notifications are unavailable in Expo Go. In-app alerts and local notifications are active.",
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
