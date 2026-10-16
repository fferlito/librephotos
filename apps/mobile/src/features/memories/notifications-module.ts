/**
 * Lazy access to expo-notifications. Expo Go on Android (SDK 53+) throws as soon
 * as the package is imported (its push-token auto-registration runs at import),
 * so a static import would crash every screen that reaches it. Callers load the
 * module through here and treat `null` as "notifications unavailable".
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

/** True where expo-notifications cannot be loaded: Expo Go on Android. */
export const notificationsUnavailable =
  Platform.OS === "android" &&
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** The expo-notifications module, or null where it cannot be loaded. */
export async function loadNotifications(): Promise<NotificationsModule | null> {
  if (notificationsUnavailable) return null;
  return import("expo-notifications");
}
