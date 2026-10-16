# Fork changes

This fork ([fferlito/librephotos](https://github.com/fferlito/librephotos)) is based on
[LibrePhotos/librephotos](https://github.com/LibrePhotos/librephotos), branch `dev`,
commit `fb7f9551e` (2026-10-15). This file lists everything that differs from upstream.

Each entry is either a **bug fix** (upstream has the same problem; a candidate for a pull
request upstream) or a **custom change** (specific to this fork, not meant for upstream).

When you pull from upstream, check whether a bug fix below has landed there, and remove it
from this list if so.

## Bug fixes

### 1. Mobile app crashes on start in Expo Go on Android

- **App:** mobile
- **Symptom:** opening the app in Expo Go on Android fails with "expo-notifications: Android
  Push notifications ... was removed from Expo Go with the release of SDK 53", followed by
  "Route ./_layout.tsx is missing the required default export" and
  "Cannot read property 'ErrorBoundary' of undefined".
- **Cause:** `expo-notifications` throws as soon as it is imported in Expo Go on Android (its
  push-token auto-registration runs at import). `NotificationRouter.tsx` and
  `notifications.ts` imported it statically, and the root layout and settings screen import
  those files.
- **Fix:** a new loader, `notifications-module.ts`, imports `expo-notifications` lazily and
  returns `null` in Expo Go on Android. Both files load it through the loader. There, the
  memories reminder is off (turning it on in Settings shows an error toast). Development and
  release builds are unchanged.
- **Files:**
  - `apps/mobile/src/features/memories/notifications-module.ts` (new)
  - `apps/mobile/src/features/memories/NotificationRouter.tsx`
  - `apps/mobile/src/features/memories/notifications.ts`

### 2. Release build cannot sign in to an `http://` server

- **App:** mobile
- **Symptom:** in a release build, signing in to a server on plain HTTP (for example
  `http://192.168.1.163:8081` on a home network) fails with "login failed". The request never
  leaves the phone. Expo Go and development builds work.
- **Cause:** Android blocks unencrypted HTTP for apps targeting API 28+ unless the app opts in.
  Development builds opt in through the debug manifest, release builds do not.
- **Fix:** added `expo-build-properties` (`~57.0.22`, from `npx expo install`) with
  `android.usesCleartextTraffic: true` in `app.json`.
- **Files:**
  - `apps/mobile/app.json` (`plugins`)
  - `apps/mobile/package.json`
  - `package-lock.json`

### 3. Release build crashes when dragging the photo info panel

- **App:** mobile
- **Symptom:** in the photo viewer, opening the info panel and dragging it (for example to the
  full view) crashes the app. Logcat: `[Worklets] Tried to synchronously call a Remote
  Function. Called "anonymous" on the UI Runtime.`
- **Cause:** the panel's pan gesture `onEnd` runs on the UI runtime and calls `snapTarget()`,
  a plain JS function. Debug builds only warn, release builds crash.
- **Fix:** `snapTarget()` is now a worklet (`"worklet"` directive). It stays a pure function, so
  its unit tests are unchanged.
- **Files:**
  - `apps/mobile/src/components/BottomSheet.tsx`

## Custom changes

### 4. App icon

- **App:** mobile
- **Change:** new app icon from the icon pack in `apps/mobile/assets/AppIcons/`.
  - Android adaptive icon foreground: `AppIcons/android/adaptive-foreground.png`, on a
    `#FDD79E` background (the artwork's own color, so launcher masks show no seam).
  - General icon: `AppIcons/appstore.png`.
  - The monochrome (themed icon) layer is removed, because the pack has none and the old one
    showed the previous logo. Themed-icon mode shows the app in color.
- **Not changed:** the notification icon (still `assets/images/android-icon-monochrome.png`) and
  the iOS icon (still `assets/expo.icon`). The old images in `assets/images/` are kept, unused.
- **Files:**
  - `apps/mobile/assets/AppIcons/` (new)
  - `apps/mobile/app.json` (`icon`, `android.adaptiveIcon`)

### 5. App name "DropjeBox"

- **App:** mobile
- **Change:** the name under the icon on the phone is "DropjeBox". Texts inside the app still
  say "LibrePhotos". The package name (`com.librephotosmobile`) is unchanged.
- **Files:**
  - `apps/mobile/app.json` (`name`)

## Deployment settings (not in this repository)

The server runs from the upstream Docker images on a Raspberry Pi 4 (`/srv/librephotos`,
cloned from `LibrePhotos/librephotos-docker`). It has no code changes, only local settings:

- `docker-compose.override.yml`: `FEATURE_SCENE_CLASSIFICATION=false` and
  `FEATURE_IMAGE_CAPTIONING=false`, because tagging and captioning were too heavy for a Pi 4.
  This also turns off AI search.
- Site setting `CAPTIONING_MODEL` set to `none`.
- Port `8081` instead of `3000` (8080 is used by another service on the Pi).
- Per-user scan directories `/data/<username>`.
