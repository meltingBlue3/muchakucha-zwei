# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## expo-go-remote-update-failed — SDK-mismatched Expo Go could not load the Android development update
- **Date:** 2026-08-02
- **Error patterns:** failed to download remote update
- **Root cause:** The Play Store Expo Go client supported SDK 54 while Metro served runtime `exposdk:57.0.0`; after installing the matching SDK 57 client, shared `Screen` also exposed a Web-only `main` role to Android and used React Native 0.86's deprecated core SafeAreaView.
- **Fix:** Installed the matching SDK 57 Expo Go client, gated `role="main"` to Web, migrated `Screen` to directly declared `react-native-safe-area-context`, and added native/Web regression coverage.
- **Files changed:** apps/client/package.json, apps/client/src/ui/primitives.tsx, apps/client/src/ui/__tests__/primitive-states-test.tsx, e2e/auth/accessibility.spec.ts, pnpm-lock.yaml
---
