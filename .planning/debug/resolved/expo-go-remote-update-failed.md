---
status: resolved
trigger: "Android Expo Go 打开 exp://192.168.31.128:8081 时显示 failed to download remote update"
created: 2026-08-02
updated: 2026-08-02T05:10:00+08:00
---

# Debug Session: Expo Go Remote Update Failed

## Symptoms

- expected: Expo Go 下载 SDK 57 项目的开发更新并打开 Android 验收应用。
- actual: Expo Go 显示 `failed to download remote update`。
- errors: `failed to download remote update`
- timeline: 2026-08-02 首次执行真实 Android 验收时发现；此前 Web、Jest 与 Playwright 自动化均通过。
- reproduction: 在与 PC 同一 Wi-Fi 的 Android 手机上，用 Expo Go 打开 `exp://192.168.31.128:8081`。

## Current Focus

hypothesis: Confirmed resolved. The original Expo Go runtime mismatch and both follow-on native rendering defects have been corrected.
test: User restarted Metro, loaded the project with SDK 57 Expo Go on Android, and inspected startup behavior, warnings, and safe-area rendering.
expecting: The app loads without the remote-update failure or invalid Android accessibility role red screen, emits no React Native core SafeAreaView deprecation warning, and renders acceptably within safe areas.
next_action: Archive this resolved session and append its confirmed pattern to the debug knowledge base without changing phase or plan state.

## Evidence

- timestamp: 2026-08-02T04:00:00+08:00
  checked: Human verification after restarting the SDK 57 Expo service and reloading on Android.
  found: The app launches and the invalid `accessibilityRole="main"` crash is gone. React Native 0.86.2 now emits the non-fatal warning that core `SafeAreaView` is deprecated, pointing to `Screen` in `apps/client/src/ui/primitives.tsx:40`.
  implication: The previous fix is confirmed on the real device. The remaining issue is a distinct, directly located deprecated-component use whose migration must preserve native insets and Web landmark behavior.
- timestamp: 2026-08-02T04:08:00+08:00
  checked: Client package manifest, lockfile, Expo Router root layout, complete shared primitives, primitive tests, and Jest setup.
  found: `Screen` imports `SafeAreaView` directly from `react-native`; `react-native-safe-area-context@5.8.0` exists only in the lockfile and is absent from the client's declared dependencies; `RootLayout` currently wraps the app only in the Restyle theme and session bootstrap; Jest has no safe-area mock or provider harness.
  implication: Replacing the import alone would rely on an undeclared transitive dependency and may leave provider initialization implicit. The migration must establish explicit dependency and provider ownership, then make test expectations observe the new boundary.
- timestamp: 2026-08-02T04:13:00+08:00
  checked: `pnpm why` and installed Expo Router 57.0.9 root implementation.
  found: safe-area-context 5.8.0 is present only through Expo Router. `ExpoRoot` already wraps the entire user route tree in `SafeAreaProvider` and supplies SSR-aware `INITIAL_METRICS`; nested navigation compatibility code detects this context and deliberately avoids another provider.
  implication: Provider requirements are already satisfied in Android, iOS, and Web before `app/_layout.tsx` renders. Adding an application provider would duplicate framework ownership; only direct-render Jest tests need explicit deterministic handling.
- timestamp: 2026-08-02T04:18:00+08:00
  checked: safe-area-context 5.8.0 package, `SafeAreaView`, `SafeAreaProvider`, and supplied Jest mock implementation.
  found: The library's `SafeAreaView` deterministically renders the `RNCSafeAreaView` codegen host with all four edges; Expo Router provides its required native provider hierarchy. The supplied Jest mock only substitutes deterministic context values/provider behavior and leaves the actual SafeAreaView export intact.
  implication: A rendered-host assertion can prove the deprecated core component is gone. Jest can exercise the component directly without hiding it behind a fake SafeAreaView; explicit app-level provider duplication remains unnecessary.
- timestamp: 2026-08-02T04:23:00+08:00
  checked: Focused Screen regression against unchanged production code.
  found: The test emits the exact deprecation warning at `primitives.tsx:40` and fails as predicted: expected `RNCSafeAreaView`, received `RCTSafeAreaView`.
  implication: The warning and unsupported host boundary are reproducible in automation, directly confirming the import-level root cause before any product change.
- timestamp: 2026-08-02T04:31:00+08:00
  checked: Exact focused Screen regression after the minimal migration.
  found: The client now declares safe-area-context 5.8.0 directly, Screen imports its SafeAreaView, and direct primitive tests run under deterministic SafeAreaProvider metrics. The focused test passes with host `RNCSafeAreaView`, no native role props, and no deprecation warning output.
  implication: The counterfactual changed precisely the predicted component boundary and eliminated the reproducible warning; broader native/Web regressions remain to be checked.
- timestamp: 2026-08-02T04:36:00+08:00
  checked: Complete client Jest suite and strict client TypeScript check after safe-area migration.
  found: All 9 suites and 88 tests pass with no SafeAreaView deprecation warning in output; `tsc --noEmit` exits successfully.
  implication: The supported component boundary, deterministic test provider, theme behavior, and client type contract remain intact.
- timestamp: 2026-08-02T04:46:00+08:00
  checked: Workspace quick regressions, recursive package typechecks, Android production export, and responsive Web accessibility matrix.
  found: API unit tests (3) and client tests (88) pass; API, generated API client, and client typechecks pass; Android exports 1,480 modules into a 3.5 MB Hermes bundle; Web `/login` retains a visible main landmark with zero Axe violations at 320, 390, 768, and 1440 pixels (4/4 Playwright tests).
  implication: The safe-area migration compiles for Android, preserves cross-workspace contracts, Web semantics, responsive layout, theme/accessibility behavior, and introduces no automated warning or regression.
- timestamp: 2026-08-02T04:50:00+08:00
  checked: Complete worktree scope, dependency diff, and whitespace integrity.
  found: `git diff --check` is clean. The tracked diff is limited to four migration files: client dependency declaration, pnpm lock graph, one SafeAreaView import swap, and provider-aware host regression coverage; the active debug session is the only untracked file.
  implication: The implementation is scoped for an atomic commit without staging planning state or unrelated work.
- timestamp: 2026-08-02T04:55:00+08:00
  checked: Frozen offline dependency install, atomic fix commit, and post-commit worktree.
  found: `pnpm install --frozen-lockfile --offline` accepts the graph without changes. Commit `7a3164a` contains exactly the four migration files; the active debug session is the only remaining untracked item.
  implication: The implementation and dependency state are committed and reproducible. Only real-device confirmation of warning-free Expo Go output and safe-area layout remains before archival.
- timestamp: 2026-08-02T05:10:00+08:00
  checked: Final human verification after restarting Metro and reloading with SDK 57 Expo Go on Android.
  found: The app loads successfully; the invalid `accessibilityRole="main"` red screen and React Native core SafeAreaView deprecation warning are gone, and safe-area rendering is acceptable.
  implication: The original issue and both follow-on Android defects are resolved end-to-end in the real target workflow, so the session can be archived.

- timestamp: 2026-08-02T02:36:00+08:00
  checked: Human verification of the SDK 57 Expo Go counterfactual.
  found: The SDK 57 Expo Go APK downloads and launches the project, so the original `failed to download remote update` symptom is gone; Android then immediately reports `Invalid accessibility role value: main` while updating `accessibilityRole` on an RCTView.
  implication: The original runtime-mismatch root cause is confirmed. Verification exposed a separate cross-platform prop-compatibility defect on the first rendered native screen.
- timestamp: 2026-08-02T02:39:00+08:00
  checked: Supplied Android screenshot and repository-wide accessibility-role search.
  found: The screenshot exactly reports `Invalid accessibility role value: main` on Android RCTView. The only client source assigning literal `main` is `apps/client/src/ui/primitives.tsx:42`, where it is cast with `as never`; no project skill directories exist, and the debug file is the only current untracked worktree item.
  implication: The error value has a unique first-party source, and the type cast likely suppresses React Native's platform-valid role union rather than making the runtime value portable.
- timestamp: 2026-08-02T02:43:00+08:00
  checked: Complete shared primitive implementation, Screen references, primitive tests, and client test configuration.
  found: `Screen` always passes `accessibilityRole={'main' as never}` to React Native `SafeAreaView`; `AuthShell` always wraps its content in `Screen`; no caller can override the role because ScreenProps exposes only label/testID; current tests never assert Screen's platform-specific role behavior.
  implication: Every auth screen using AuthShell delivers the invalid literal directly to the native SafeAreaView, and the `as never` cast is the only reason TypeScript accepts it.
- timestamp: 2026-08-02T02:47:00+08:00
  checked: Startup bootstrap, index redirect, login route, and login form render path.
  found: SessionBootstrap renders AuthShell while booting/offline, and the unauthenticated destination redirects to a login route that also renders AuthShell; AuthShell synchronously renders Screen before any network/form interaction.
  implication: The invalid Screen prop is guaranteed to reach the first Android native render, matching the immediate Fabric property-update red screen.
- timestamp: 2026-08-02T02:53:00+08:00
  checked: React Native 0.86 Android role parser/types, React Native Web role mapping, and existing Web accessibility tests.
  found: Android `AccessibilityRole.fromValue` has no MAIN enum case and throws `IllegalArgumentException("Invalid accessibility role value: $value")`; the public `accessibilityRole` TypeScript union also omits `main`. React Native Web accepts the standard `role` prop and maps `main` to a semantic `<main>`. Existing Axe tests do not explicitly assert the main landmark.
  implication: The `as never` cast bypassed an accurate native type constraint. A platform-gated standard `role` prop is both smaller and more type-safe than maintaining the invalid legacy prop.
- timestamp: 2026-08-02T02:56:00+08:00
  checked: First execution of the new focused native Screen regression test against unchanged production code.
  found: The test fixture failed earlier than the intended assertion because it supplied a raw string child beneath React Native View/ScrollView (`Text strings must be rendered within a <Text> component`).
  implication: This run does not test the role hypothesis; the fixture must use the owned Text primitive before the red-state result is meaningful.
- timestamp: 2026-08-02T02:58:00+08:00
  checked: Corrected focused native Screen regression test against unchanged production code.
  found: The test fails at the intended assertion with `Received: "main"` for `screen.props.accessibilityRole`; the Jest Expo native platform is not Web.
  implication: The invalid Web landmark role is directly observable on the rendered native Screen before the fix, confirming the causal prop-delivery mechanism.
- timestamp: 2026-08-02T03:01:00+08:00
  checked: Exact focused native Screen regression after the one-line production fix.
  found: The test passes: native Screen exposes neither `accessibilityRole` nor `role`. The only output is React Native's pre-existing SafeAreaView deprecation warning.
  implication: The fix removes the crashing prop at the rendered native boundary without changing the Screen structure.
- timestamp: 2026-08-02T03:04:00+08:00
  checked: Complete client Jest suite and strict client TypeScript check after the fix.
  found: All 9 client test suites and 88 tests pass; `tsc --noEmit` exits successfully.
  implication: The regression test is green and the change preserves adjacent client behavior and strict typing.
- timestamp: 2026-08-02T03:06:00+08:00
  checked: First Android export verification command.
  found: The command was rejected before execution because it included recursive cleanup of the validated temporary target.
  implication: No build result was produced and no filesystem change occurred; retry with a unique temporary directory and no destructive cleanup in the command.
- timestamp: 2026-08-02T03:09:00+08:00
  checked: Production Expo Android export after the fix.
  found: Metro bundled 1,480 modules successfully and emitted a 3.5 MB Android Hermes bundle plus metadata and assets.
  implication: The fixed client compiles for the exact Android target; no bundling or type-level regression blocks the real-device retry.
- timestamp: 2026-08-02T03:12:00+08:00
  checked: First focused Playwright Web landmark verification attempt.
  found: Playwright stopped before launching tests because its non-reusable mailbox helper port 18025 was already occupied.
  implication: This is test-infrastructure contention rather than an application failure; rerun with an isolated mailbox port.
- timestamp: 2026-08-02T03:15:00+08:00
  checked: Focused Playwright `/login` accessibility case using isolated mailbox port 28025.
  found: The browser finds a visible main landmark, login remains usable, and the existing Axe scan reports zero violations; 1 test passed.
  implication: Gating the role to Web preserves the required main landmark semantics while the native branch omits the invalid role.
- timestamp: 2026-08-02T03:18:00+08:00
  checked: Workspace-wide quick regression tests and recursive package typechecks.
  found: API unit tests (3) and all client tests (88) pass; TypeScript checks pass for API, generated API client, and client.
  implication: The minimal client change introduces no detected cross-workspace regression and remains type-safe across every typed package.
- timestamp: 2026-08-02T03:20:00+08:00
  checked: Final worktree scope and diff integrity before commit.
  found: `git diff --check` is clean. The tracked diff is limited to 3 files: one Screen prop replacement, one native regression test, and one Web main-landmark assertion; the active debug session is the only untracked file.
  implication: The fix is minimal, reviewable, and safe to commit without staging unrelated or generated content.
- timestamp: 2026-08-02T03:22:00+08:00
  checked: Atomic fix commit and post-commit worktree.
  found: Commit `f23487a` contains the 3 verified files; the active debug session is the only remaining untracked item.
  implication: The requested code/test changes are committed, while the session correctly remains active until real-device confirmation permits archival.

- timestamp: 2026-08-02T00:00:00+08:00
  observation: PC 上 TCP 8081、3000、18025、18026 均处于监听状态。
- timestamp: 2026-08-02T00:15:00+08:00
  checked: Expo configuration, port 8081 listener, and local IPv4 addresses.
  found: The client uses Expo 57.0.9 / React Native 0.86.2; node PID 32808 runs `expo start --port 8081`; port 8081 listens on `[::]`; WLAN is `192.168.31.128/24`.
  implication: The project SDK matches its declared stack, the advertised WLAN address is current, and Metro is not restricted to loopback.
- timestamp: 2026-08-02T00:16:00+08:00
  checked: HTTP requests to `127.0.0.1:8081` and `192.168.31.128:8081` with Expo update headers.
  found: Both requests returned a response body (PowerShell exposed it as `byte[]`; response decoding remains to be inspected).
  implication: Both local network paths reach Metro; exact response validity must be checked before eliminating the server branch.
- timestamp: 2026-08-02T00:19:00+08:00
  checked: Exact Expo update responses through loopback and WLAN, plus debug knowledge base.
  found: No knowledge base exists. Both endpoints return HTTP 200 `application/expo+json`, runtime `exposdk:57.0.0`, and address-correct `launchAsset`, `hostUri`, and `debuggerHost` values; the LAN manifest consistently advertises `192.168.31.128:8081`.
  implication: Manifest generation and host indirection are correct; remaining server-side possibility is bundle compilation/download, while network filtering or Expo Go compatibility remain candidates.
- timestamp: 2026-08-02T00:26:00+08:00
  checked: Exact Android launchAsset URL from the LAN manifest.
  found: Metro returned HTTP 200 `application/javascript` and a 7,480,370-byte Android/Hermes bundle in 5.7 seconds.
  implication: The remote-update failure is not caused by Metro bundle compilation or a missing Expo Router entry module.
- timestamp: 2026-08-02T00:27:00+08:00
  checked: Windows WLAN/firewall state for the Metro process.
  found: WLAN `Redmi_5F7F_5G` is Public; Windows Firewall is enabled; two enabled inbound Allow rules apply to `C:\Program Files\nodejs\node.exe` on the Public profile; no dedicated port-8081 rule exists.
  implication: A blanket Windows firewall block is not supported, though rule address/interface scope still needs confirmation.
- timestamp: 2026-08-02T00:31:00+08:00
  checked: `expo-doctor` and Android Debug Bridge availability.
  found: Metro-relevant code still bundles; expo-doctor reports missing direct peer dependencies and test/tool version mismatches but no update-server/config failure. ADB 36 is installed, but no Android device is connected, so the installed Expo Go version cannot be queried from the PC.
  implication: The doctor findings should be handled separately but do not explain a failure before a valid manifest/bundle is downloaded; phone client state requires human verification.
- timestamp: 2026-08-02T00:32:00+08:00
  checked: Full Windows firewall scope for the exact running Node executable.
  found: Public inbound TCP and UDP Allow rules have LocalAddress Any, RemoteAddress Any, and LocalPort Any.
  implication: Windows Defender Firewall is not filtering the phone by source address or port under the active profile.
- timestamp: 2026-08-02T00:34:00+08:00
  checked: Official Expo SDK 57 creation and Development Builds FAQ documentation.
  found: Expo states that during the SDK 57 transition physical-device Expo Go projects should use SDK 54; the app-store Expo Go currently supports SDK 54 only, while Android can install a compatible Expo Go version via the `expo-go` CLI. This project serves runtime `exposdk:57.0.0`.
  implication: A Play Store Expo Go client is incompatible with this project's update runtime and is now the leading, directly documented cause.
- timestamp: 2026-08-02T00:39:00+08:00
  checked: Installed `expo-go` CLI behavior for an Android SDK 57 client.
  found: `pnpm dlx expo-go@latest url android 57.0.0` resolves the official `Expo-Go-57.0.2.apk`; the CLI also supports `download android 57.0.0`.
  implication: The leading compatibility hypothesis has a minimal counterfactual fix available without changing or downgrading the repository.

## Eliminated

- hypothesis: 验收服务已经全部退出。
  reason: 四个验收端口当前均有监听进程。
- hypothesis: Metro only listens on loopback or `192.168.31.128` is a stale PC address.
  reason: Port 8081 listens on `[::]`, WLAN currently owns `192.168.31.128/24`, and both loopback and LAN HTTP requests reached Metro.
- hypothesis: Metro returns an invalid update manifest or rewrites launch URLs to loopback.
  reason: Both Expo update responses are HTTP 200 with protocol headers and valid SDK 57 JSON; the LAN response advertises only `192.168.31.128:8081` for bundle and debugger URLs.
- hypothesis: The remote update fails because Metro cannot compile or serve the Android launch bundle.
  reason: The exact LAN launchAsset URL returns a 7.48 MB Android/Hermes JavaScript bundle with HTTP 200.
- hypothesis: Windows Firewall has no inbound allowance for the Node process on the active Public WLAN profile.
  reason: Two enabled inbound Allow rules target the exact running executable, `C:\Program Files\nodejs\node.exe`, on the Public profile.

## Resolution

root_cause: The original remote-update failure was an Expo Go runtime mismatch (Play Store SDK 54 client versus project runtime `exposdk:57.0.0`). Once that was corrected, shared `Screen` exposed two native incompatibilities: it sent the Web-only `main` landmark through Android's accessibility role boundary, and it imported React Native 0.86's deprecated core SafeAreaView instead of the supported safe-area-context component.
fix: Replaced Screen's unconditional, casted `accessibilityRole="main"` with the supported standard `role` prop gated to `Platform.OS === 'web'`; added native/Web role regressions. Declared safe-area-context 5.8.0 directly, migrated Screen from RN core SafeAreaView, and made direct primitive tests provide deterministic safe-area metrics.
verification: Human verification confirms SDK 57 Expo Go loads the app after Metro restart, the invalid Android accessibility role red screen is gone, the core SafeAreaView deprecation warning is gone, and safe-area rendering is acceptable. The focused safe-area regression went RED with the exact warning and `RCTSafeAreaView`, then GREEN with `RNCSafeAreaView`, no native role props, and no warning. Client 9/9 suites (88 tests), workspace quick tests (including 3 API tests), all package typechecks, Android export (1,480 modules, 3.5 MB Hermes), and responsive Web main-landmark/Axe checks (4/4) pass.
files_changed:
  - apps/client/package.json
  - apps/client/src/ui/primitives.tsx
  - apps/client/src/ui/__tests__/primitive-states-test.tsx
  - e2e/auth/accessibility.spec.ts
  - pnpm-lock.yaml
