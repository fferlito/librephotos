import { useEffect } from "react";
import { useRouter, type Href } from "expo-router";

import { loadNotifications } from "./notifications-module";

/**
 * Routes a tapped local notification to its deep-link target (the memories
 * reminder carries `data.url`). Mounted once inside the authed navigator.
 * Renders nothing.
 */
export function NotificationRouter() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let sub: { remove(): void } | undefined;
    const go = (url: unknown) => {
      // A deep link into the app, written by the reminder that scheduled it.
      if (typeof url === "string" && url.startsWith("/")) router.push(url as Href);
    };
    void loadNotifications().then((Notifications) => {
      if (!Notifications || cancelled) return;
      // Cold start: app opened from a notification tap.
      void Notifications.getLastNotificationResponseAsync().then((res) => {
        go(res?.notification.request.content.data?.url);
      });
      // Warm taps while the app is running.
      sub = Notifications.addNotificationResponseReceivedListener((res) => {
        go(res.notification.request.content.data?.url);
      });
    });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [router]);

  return null;
}
