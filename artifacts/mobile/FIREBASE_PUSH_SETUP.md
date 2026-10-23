# Android push notification setup

Android must initialize Firebase before [expo-notifications](https://docs.expo.dev/push-notifications/push-notifications-setup/) can request an Expo push token. The native configuration file must match the app ID `com.schoolmanagement.app`. It is intentionally not committed to this repository.

## EAS cloud builds

1. In Firebase Console, download `google-services.json` for the Android app whose package ID is `com.schoolmanagement.app`.
2. In the linked Expo project, add a **file** environment variable named `GOOGLE_SERVICES_JSON` and upload that file for each environment you build with: `development`, `preview`, and/or `production`. The EAS profiles select those environments in `eas.json`.
3. Build a new Android APK. The EAS pre-install hook copies the file to the app config path and checks that its package ID matches; it does not print the file contents. If the file is missing or belongs to another Android app, the build stops with a setup error.
4. Install the new APK. Firebase configuration is native build-time configuration, so an over-the-air JavaScript update cannot fix an already-installed APK.

## Local Android builds

Place the file at `artifacts/mobile/google-services.json`. Git ignores this path. The same package-ID validation runs during EAS Android builds.

The API sends pushes through Expo's push service. For delivery after device registration works, configure the Android FCM v1 service-account credential in the linked Expo/EAS project as well; that credential is separate from `google-services.json`.
