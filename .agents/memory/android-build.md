---
name: Android APK builds
description: The imported Expo project currently supports Replit/Metro preview but the shell lacks the native Android toolchain for producing an APK.
---

The mobile project can be typechecked and previewed in Replit, but an Android APK requires a Java/Android SDK toolchain or an approved remote Android build service.

**Why:** The workspace shell did not provide Java or Android SDK, and the project’s local mobile build script creates static Metro bundles rather than a signed native APK.

**How to apply:** Do not claim an APK was produced from this workspace unless a native Android toolchain or supported remote build has actually completed.