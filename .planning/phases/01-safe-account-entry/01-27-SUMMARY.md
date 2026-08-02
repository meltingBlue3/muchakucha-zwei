---
phase: 01-safe-account-entry
plan: 27
subsystem: testing
tags: [android, expo-go, secure-store, deep-link, authentication, uat]

requires:
  - phase: 01-26
    provides: complete automated authentication, accessibility, security, and contract gates
provides:
  - real Android approval of the core account lifecycle
  - device evidence for SecureStore restart, profile persistence, scoped logout, and global session revoke
  - explicit accepted-risk record for skipped offline and accessibility device checks
affects: [phase-02-household, phase-06-release, android-uat, accessibility-audit]

tech-stack:
  added: []
  patterns: [LAN Expo acceptance harness, Mailpit deep-link verification, explicit UAT risk acceptance]

key-files:
  created: [.planning/phases/01-safe-account-entry/01-27-SUMMARY.md]
  modified: []

key-decisions:
  - "Use Expo Go SDK 57 over LAN with an explicit EXPO_PUBLIC_API_ORIGIN for real-device Phase 1 acceptance."
  - "Record offline, 200% text, TalkBack, announcement, and touch-target checks as explicitly waived device evidence; retain their passing automated coverage and release debt."

patterns-established:
  - "Android acceptance distinguishes observed device behavior from automated-only or explicitly waived evidence."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "A real Android device completed registration, Mailpit verification, login, SecureStore restart restoration, nickname persistence, current-device logout with a surviving browser session, and password reset with global session revocation."
    requirement: AUTH-03
    verification:
      - kind: manual_procedural
        ref: "Android Expo Go SDK 57 acceptance session on 2026-08-02"
        status: pass
      - kind: integration
        ref: "01-26 automated fail-fast acceptance chain"
        status: pass
    human_judgment: true
    rationale: "SecureStore persistence, native deep-link handoff, and independent device sessions require real-device observation."
  - id: D2
    description: "Android offline restoration, 200% text and keyboard reachability, TalkBack announcements, and 48px target checks were not manually exercised."
    requirement: SAFE-03
    verification:
      - kind: automated_ui
        ref: "01-26 client and Playwright accessibility/offline coverage"
        status: pass
      - kind: manual_procedural
        ref: "Android acceptance session; user explicitly accepted the skipped checks"
        status: unknown
    human_judgment: true
    rationale: "The user explicitly waived these device-only checks and approved Phase 1 with the residual risk recorded."

duration: 6h 20m
completed: 2026-08-02
status: complete
---

# Phase 01 Plan 27: Android Account Lifecycle Acceptance Summary

**A real Android device approved the complete core account lifecycle, including secure restart restoration and multi-device revocation boundaries, with skipped device accessibility/offline checks preserved as explicit accepted risk.**

## Performance

- **Duration:** 6h 20m including device setup, service recovery, and human checkpoints
- **Started:** 2026-08-02T02:40:00+08:00
- **Completed:** 2026-08-02T09:00:32+08:00
- **Tasks:** 1 human-verification checkpoint
- **Files modified:** 1 planning artifact; three acceptance-discovered client fixes were committed separately

## Accomplishments

- Completed registration, local email delivery, same-device verification, login, and SecureStore-backed restart restoration in Expo Go on a real Android device.
- Proved nickname persistence, current-device-only logout with a surviving browser session, and password reset that revoked every existing device session.
- Fixed three Android acceptance regressions: invalid native `main` accessibility role, deprecated core SafeAreaView usage, and render-phase reset-link navigation.
- Captured explicit user approval to close Phase 1 while accepting the residual risk from skipped offline and manual accessibility checks.

## Task Commits

Acceptance-discovered fixes were committed atomically:

1. **Native accessibility-role compatibility** - `f23487a` (fix)
2. **Safe-area context migration** - `7a3164a` (fix)
3. **Reset-link navigation lifecycle** - `cb510e6` (fix)

## Files Created/Modified

- `.planning/phases/01-safe-account-entry/01-27-SUMMARY.md` - Android acceptance evidence and accepted-risk record.
- `apps/client/src/ui/primitives.tsx` - Native landmark and safe-area compatibility fixes discovered during acceptance.
- `apps/client/src/features/auth/password-reset-flow.tsx` - Post-commit reset-link sanitization compatible with React 19.

## Decisions Made

- Accepted the user's explicit waiver for offline, large-text, TalkBack, announcement, and touch-target device checks; these remain automated-only evidence rather than being represented as human-tested.
- Kept iOS real-device testing and production SMTP/domain validation as Phase 6 release gates.

## Deviations from Plan

### Auto-fixed Issues

**1. Android renderer rejected Web landmark role**
- **Found during:** Android launch acceptance
- **Fix:** Apply `role="main"` only on Web.
- **Verification:** User confirmed the Android crash was fixed.

**2. React Native core SafeAreaView emitted a deprecation warning**
- **Found during:** Android screen acceptance
- **Fix:** Migrate the owned screen primitive to `react-native-safe-area-context`.
- **Verification:** User confirmed the warning was fixed; client tests passed.

**3. Reset-password token sanitization updated navigation during render**
- **Found during:** Password-reset and large-text acceptance sequence
- **Fix:** Defer route sanitization to `useEffect` and add a navigation-state regression test.
- **Verification:** Focused tests 10/10, client tests 89/89, and TypeScript checking passed.

---

**Total deviations:** 3 correctness/compatibility fixes and 1 explicitly accepted manual-test waiver.
**Impact on plan:** Core functional and security acceptance became stronger; waived Android accessibility/offline evidence remains documented verification debt.

## Issues Encountered

- Expo Go initially used an incompatible SDK and later lost the LAN API origin during restart; the official SDK 57 client and explicit `EXPO_PUBLIC_API_ORIGIN=http://192.168.31.128:3000` restored the harness.
- Local Mailpit was mistaken for production email delivery; acceptance continued through the LAN Mailpit UI and link bridge.

## User Setup Required

None for Phase 1 completion. Production email, domains, and iOS validation remain Phase 6 concerns.

## Next Phase Readiness

- The account is ready to enter Phase 2 household setup through the existing no-household handoff.
- Track the waived Android offline/accessibility checks for later device regression or the Phase 6 release gate.

## Self-Check: PASSED

- Android functional/security approvals are recorded from the user's explicit checkpoint responses.
- Skipped checks are marked unknown/waived rather than passed.
- All referenced acceptance-fix commits exist, and the latest client test/typecheck gates passed.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-02*
