# Vanlytics Driver (mobile wrapper app)

## What this is

This is a thin native Android/iOS wrapper around the Vanlytics **driver
portal** web page (`https://<your-app-url>/driver/<org-slug>`), where a
driver enters their PIN and clocks in/out for the day (logging start/end
mileage against the van they're already assigned to in Vanlytics).

The app itself contains almost no logic. It's a single [Expo](https://expo.dev)
project that:

1. On first launch, shows a one-time **setup screen** asking for your
   Vanlytics app URL (e.g. `https://acme.vanlytics.app`) and your
   organization code (e.g. `acme-fleet`). These are combined into
   `${baseUrl}/driver/${orgSlug}` and saved on-device (AsyncStorage), so
   drivers never see this screen again.
2. From then on, opens straight into a full-screen WebView pointed at that
   URL, with pull-to-refresh, a loading spinner, and a friendly "can't
   reach Vanlytics, retry" screen for flaky mobile data.
3. Persists cookies across app restarts so the driver's PIN-login session
   sticks, the same way it would in a normal mobile browser.

All the actual driver-facing UI (PIN pad, mileage entry) lives in the main
Vanlytics web app at the `/driver/:orgSlug` route — this app just gives it a
real home-screen icon and an installable APK so drivers don't have to find a
bookmark every morning.

Each phone identifies itself to that page automatically (a device ID stored
in the WebView's local storage) — an admin links each phone to a driver from
Vanlytics' Driver Abstracts → **Manage Devices**, so there's no driver list
or van picker shown on the phone itself. See "First-time driver setup"
below.

Because it's "just" a WebView, **you do not need to rebuild or redistribute
this app when the driver portal web page changes.** Backend changes, UI
tweaks, new fields, bug fixes on `/driver/:orgSlug` all show up automatically
the next time a driver opens the app — same as refreshing a website. You
only need a new APK build if you change something in *this* wrapper project
itself (e.g. the setup screen, the app icon/name, or add a new native
capability).

## Prerequisites

- A free [Expo account](https://expo.dev/signup) (used only for the cloud
  build service — no paid plan required for this).
- Node.js and npm installed locally (already required for the rest of the
  Vanlytics codebase).
- The EAS CLI, installed globally once:

  ```bash
  npm install -g eas-cli
  eas login
  ```

You do **not** need Android Studio or an Android SDK installed locally —
`eas build` runs the actual Android build in Expo's cloud and hands you back
a downloadable `.apk` link.

## Building an installable APK

From the `mobile-driver-app/` directory:

```bash
cd mobile-driver-app
npm install
eas build --platform android --profile preview
```

The first time you run this in a fresh Expo account, `eas build` will ask a
couple of setup questions (e.g. whether to create a new EAS project for
this app — say yes). It then uploads the project, builds it in the cloud,
and prints a URL when it's done (usually a few minutes). You can also watch
progress and grab the link later at https://expo.dev under your account's
"Builds" tab.

The `preview` build profile (see `eas.json`) is configured to produce a
plain installable `.apk` file rather than the Play Store's `.aab` format,
which is what you want for side-loading directly onto driver phones.

### Installing the APK on a driver's phone

1. Open the build's `.apk` link from the phone (e.g. text/email it to the
   phone, or open the Expo build page in the phone's browser and tap
   Download).
2. Android will likely warn about "installing from unknown sources" —
   the phone will prompt you to allow it for that one install (Settings →
   allow this source, if it doesn't prompt automatically).
3. Open the installed "Vanlytics Driver" app, and walk through the one-time
   setup screen (app URL + org code) described above.

You only need to repeat this per phone once. You do **not** need to repeat
it every time the web app changes — see above.

### First-time driver setup (per phone)

After the app is installed and pointed at your Vanlytics URL + org code:

1. Open the app on the driver's phone. Since this phone hasn't been linked
   to anyone yet, it shows a short device code (e.g. `AB12-CD34`) instead of
   any driver's name.
2. In Vanlytics (on your computer), go to **Driver Abstracts → Manage
   Devices**. The phone shows up in that list within a few seconds of
   opening the app (match it by the same code, or by "last seen just now").
   Assign it to the correct driver from the dropdown.
3. Still in Driver Abstracts, use **Set PIN** on that driver if you haven't
   already, and tell the driver their 4-digit PIN directly (it isn't sent
   automatically).
4. Back on the phone, tap "Check again" — it now shows that driver's PIN pad.
   Entering the PIN logs them in and shows their assigned van (from the
   existing Vehicles assignment) so they can clock in.

A driver only needs to be assigned once per phone — reopening the app later
goes straight to the PIN pad. If a phone is lost, replaced, or handed to a
different driver, just re-assign it (or unassign it) from Manage Devices;
nothing on the phone itself needs to change.

### Changing the configured URL later

If the Vanlytics app URL or org code ever needs to change (e.g. moved
domains, renamed org, or you set it up wrong the first time), no reinstall
is needed:

1. Open the app.
2. Tap the small gear icon (⚙) in the top-right corner.
3. Update the URL/org code and save. The app reloads pointed at the new
   address.

## Before your first real build

The icon/splash images checked into `assets/` right now are minimal,
locally-generated placeholders (solid indigo squares) — nothing was
downloaded from the internet to make them. Before distributing a real APK
to drivers, replace these with real Vanlytics branding, keeping the same
filenames and dimensions:

- `assets/icon.png` (1024×1024) — main app icon
- `assets/android-icon-foreground.png` / `android-icon-background.png` /
  `android-icon-monochrome.png` — Android adaptive icon layers
  (512×512 / 512×512 / 432×432)
- `assets/splash-icon.png` (1024×1024) — only used if you later add the
  `expo-splash-screen` package/plugin for a custom splash screen; without
  it, Android shows the adaptive icon on a solid background as the splash
  by default, which is fine for an MVP.
- `assets/favicon.png` (48×48) — only relevant if you ever run `npm run web`

## Play Store distribution (optional, later)

Side-loading the APK (above) is all that's required and is the intended
distribution method for this app. If you ever want it in the Play Store
instead (e.g. for easier over-the-air updates without re-side-loading),
that's a separate, later step:

1. Create a Google Play Console developer account (one-time $25 fee).
2. Build a Play Store–ready artifact with the `production` profile
   (`eas build --platform android --profile production`), which produces
   an `.aab` instead of an `.apk`.
3. Upload it to Play Console's **internal testing** track first to test
   with a small group before any wider release.

None of this is required to hand APKs directly to drivers today.
