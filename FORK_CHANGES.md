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

### 4. Backup of photos over 1 MB fails

- **App:** mobile
- **Symptom:** backup never uploads photos larger than 1 MB; they stay failed in the Backup tab.
  The proxy log shows `client intended to send too large body` and `POST /api/upload/ ... 413`
  for every one of them.
- **Cause:** the app sent each file in one request. The LibrePhotos proxy (nginx) keeps the
  default `client_max_body_size` of 1 MB and refuses larger bodies. The web app is not affected
  because it already sends 1,000,000-byte chunks.
- **Fix:** the app sends files in chunks of at most 1,000,000 bytes, like the web app. A file
  that fits is sent straight from disk as before; a larger one is cut into temporary chunk files
  in the cache, deleted after each request. The photo is opened read-only: by default a `file://`
  path opens read-write, which the app may not do to a camera photo. The split is a pure
  function with unit tests.
- **Files:**
  - `apps/mobile/src/sync/upload/chunks.ts` (new)
  - `apps/mobile/src/sync/upload/__tests__/chunks.test.ts` (new)
  - `apps/mobile/src/sync/upload/expo-transport.ts`

### 5. Videos never back up, stuck on "Preparing photos"

- **App:** mobile
- **Symptom:** a selected video (for example a screen recording) never uploads, and the Backup
  tab stays on "Preparing photos" for good.
- **Cause:** the hash pass skips videos and leaves them to be hashed at upload time, but the
  upload queue only took assets that were hashed or parked in iCloud, so a video never got in.
  The Backup status also counted it as waiting for the hash pass.
- **Fix:** the queue and the upload window also take unhashed videos (`UPLOADABLE` in
  `queue.ts`); the worker hashes them on the way out, as it already did for iCloud assets.
  Videos no longer count towards "Preparing photos".
- **Files:**
  - `apps/mobile/src/sync/upload/queue.ts`
  - `apps/mobile/src/sync/jobs/handlers.ts`
  - `apps/mobile/src/sync/upload/status.ts`
  - `apps/mobile/src/sync/upload/__tests__/queue.test.ts`
  - `apps/mobile/src/sync/upload/__tests__/status.test.ts`

### 6. A video on the phone opens as a still photo and cannot play

- **App:** mobile
- **Symptom:** a video that is still on the phone (for example a screen recording) opens in the
  viewer as a still frame with no way to play it. In the grid the only sign of a video is a tiny
  white dot. Once it played, the video's controls and progress bar were hidden under the viewer's
  thumbnail strip and action bar, and taps on the video went to the viewer instead.
- **Cause:** the viewer used the player only for videos that are not on the phone
  (`!item.local_uri`); a local one fell through to the image view. The playing video filled the
  whole screen under the viewer's bars and was wrapped in a tap handler.
- **Fix:** a video plays from its local file when it has one, else streams from the server. The
  playing video stops above the viewer's top bar and bottom bars, and no tap handler wraps it.
  Grid tiles show a play icon on videos.
- **Files:**
  - `apps/mobile/src/features/viewer/PhotoViewerScreen.tsx` (+ test)
  - `apps/mobile/src/features/viewer/VideoSlide.tsx`
  - `apps/mobile/src/components/PhotoTile.tsx`

### 7. Backed-up photos lose their location

- **App:** mobile
- **Symptom:** photos backed up from the phone have no location on the server, although the
  originals on the phone have GPS data.
- **Cause:** on Android 10+ an app that reads photos without `ACCESS_MEDIA_LOCATION` gets a copy
  with the GPS data removed. The app did not declare the permission. Declaring it is not enough:
  expo-media-library's permission check answers "granted" without it (on Android 14+ the
  selected-photos permission that comes with full access counts as granted), so it never asks.
- **Fix:** `expo-media-library` plugin with `isAccessMediaLocationEnabled: true` in `app.json`, and
  the media provider asks for `ACCESS_MEDIA_LOCATION` itself (through `PermissionsAndroid`) while
  the app is in the foreground. Photos backed up before the fix stay without a location on the
  server; their originals have different bytes, so they upload again as new photos.
- **Files:**
  - `apps/mobile/app.json` (`plugins`)
  - `apps/mobile/src/sync/device/expo-media-provider.ts`

### 8. New photos on the phone show up late in the app

- **App:** mobile
- **Symptom:** a photo just taken does not appear in the app until some later sync.
- **Cause:** a camera-roll change starts a sync, but while a sync is already running the change is
  folded into it, and that run may have scanned the camera roll already. A run with uploads takes
  minutes.
- **Fix:** a change that lands during a sync waits for that run and then starts another one.
- **Files:**
  - `apps/mobile/src/sync/run.ts`

### 9. The map in the photo info shows "Access blocked"

- **App:** mobile
- **Symptom:** the map preview in a photo's info panel shows OpenStreetMap's "Access blocked" image
  instead of a map.
- **Cause:** the tiles were requested with the HTTP library's default User-Agent, which OSM's tile
  usage policy blocks.
- **Fix:** tiles are requested with a User-Agent naming the app, under a new cache key so the
  cached "Access blocked" images are not shown again.
- **Files:**
  - `apps/mobile/src/features/viewer/MapPreview.tsx`

### 10. Album cards in My Albums have no picture

- **App:** mobile (cause on the server)
- **Symptom:** a user album shows an empty card unless a cover was picked for it.
- **Cause:** the server's sync feed sends only a picked cover for a user album, with no fallback.
- **Fix:** the app uses the album's first photo when no cover was picked.
- **Not fixed:** place albums (Albums, Places) have no picture either: the server always sends an
  empty cover list for them (`SyncPlaceAlbumsView` in `apps/backend/api/views/sync.py`). That needs
  a server change, and the Pi runs the upstream image.
- **Files:**
  - `apps/mobile/src/db/queries/albums.ts`
  - `apps/mobile/src/db/__tests__/filters.test.ts`

## Custom changes

### 11. App icon

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

### 12. App name "DropjeBox"

- **App:** mobile
- **Change:** the name under the icon on the phone is "DropjeBox". Texts inside the app still
  say "LibrePhotos". The package name (`com.librephotosmobile`) is unchanged.
- **Files:**
  - `apps/mobile/app.json` (`name`)

### 13. Accent color setting

- **App:** mobile
- **Change:** Settings, App preferences has an **Accent color** choice: blue (the default), green,
  red, pink, yellow, purple, orange or grey. It colors buttons, links, selections and the tab bar.
  The accent and the theme (System, Light, Dark) are now kept across app starts; before, the theme
  reset on every start. A new feature, not fork-specific.
- **Files:**
  - `apps/mobile/src/theme/accents.ts` (new), `apps/mobile/src/theme/index.ts`
  - `apps/mobile/src/stores/settings.ts`, `apps/mobile/src/stores/auth.ts`
  - `apps/mobile/src/lib/tokenStorage.ts`
  - `apps/mobile/src/features/settings/SettingsScreen.tsx` (+ test)
  - `apps/mobile/src/i18n/locales/en.ts`

## Deployment settings (not in this repository)

The server runs from the upstream Docker images on a Raspberry Pi 4 (`/srv/librephotos`,
cloned from `LibrePhotos/librephotos-docker`). It has no code changes, only local settings:

- `docker-compose.override.yml`: `FEATURE_SCENE_CLASSIFICATION=false` and
  `FEATURE_IMAGE_CAPTIONING=false`, because tagging and captioning were too heavy for a Pi 4.
  This also turns off AI search.
- Site setting `CAPTIONING_MODEL` set to `none`.
- Port `8081` instead of `3000` (8080 is used by another service on the Pi).
- Per-user scan directories `/data/<username>`.
