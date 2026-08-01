---
phase: 01-safe-account-entry
plan: 25
subsystem: client-auth
tags: [expo-router, react-native, react-hook-form, zod, playwright, logout]

requires:
  - phase: 01-safe-account-entry/01-19
    provides: Generated protected GET/PATCH users/me contract with duplicate display-name support
  - phase: 01-safe-account-entry/01-20
    provides: Platform-specific SessionTransport and memory-only access-token ownership
  - phase: 01-safe-account-entry/01-21
    provides: Shared client session runtime and protected-route restoration
  - phase: 01-safe-account-entry/01-24
    provides: Idempotent signed-sid current-device logout API and generated client operation
provides:
  - Protected profile route backed by generated GET/PATCH users/me operations
  - Accessible nickname validation, pending, success, field-error, and form-error states
  - Server-first confirmed logout followed by active-platform credential and memory-state cleanup
  - Real-API browser evidence for duplicate nicknames and independent second-device continuity
affects: [01-26, 01-27, profile, session-bootstrap, account-actions]

tech-stack:
  added: []
  patterns:
    - Protected account mutations read the access token from the shared SessionTransport and refresh the shared in-memory current user after success
    - Logout waits for the generated server operation before clearing only the active platform transport and publishing unauthenticated state

key-files:
  created:
    - apps/client/app/(protected)/profile.tsx
    - apps/client/src/features/auth/logout-action.tsx
    - apps/client/src/features/profile/profile-form.tsx
  modified:
    - apps/client/app/_layout.tsx
    - apps/client/src/features/auth/session-bootstrap.tsx
    - apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx
    - apps/client/src/features/profile/__tests__/profile-form-test.tsx
    - e2e/auth/account-actions.spec.ts

key-decisions:
  - "Clear platform-local and in-memory session state only after the generated logout operation returns a server outcome; availability failures retain the credential for safe retry."
  - "Preserve an authenticated /profile target during restoration instead of replacing every authenticated route with the Phase 1 household handoff."

patterns-established:
  - "Profile subject boundary: the client exposes only users/me, sends only displayName, and replaces cached currentUser from the authenticated response."
  - "Logout ordering: generated logout -> SessionTransport.clear -> sessionStateStore.enterUnauthenticated -> replace to login."

requirements-completed: [AUTH-05, AUTH-06]

coverage:
  - id: D1
    description: "The authenticated user can load and update a duplicate-allowed nickname with accessible validation and feedback through generated users/me operations."
    requirement: AUTH-06
    verification:
      - kind: unit
        ref: "apps/client/src/features/profile/__tests__/profile-form-test.tsx#profile nickname form contract (5 passed)"
        status: pass
      - kind: e2e
        ref: "e2e/auth/account-actions.spec.ts#updates the current nickname and accepts a nickname used by another account"
        status: pass
    human_judgment: false
  - id: D2
    description: "Confirmed logout revokes and clears only the current platform session while a separately authenticated browser device remains usable."
    requirement: AUTH-05
    verification:
      - kind: unit
        ref: "apps/client/src/features/profile/__tests__/profile-form-test.tsx#current-device logout contract (2 passed)"
        status: pass
      - kind: e2e
        ref: "e2e/auth/account-actions.spec.ts#logs out only the current browser while a second device stays authenticated"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 25: Protected Profile and Current-Device Logout Summary

**The protected Expo client now edits duplicate-allowed nicknames through generated users/me calls and performs confirmed server-first logout with platform-local cleanup while preserving other device sessions.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-01T15:02:30Z
- **Completed:** 2026-08-01T15:18:41Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added a protected profile route and owned-primitives form that loads only the authenticated subject, validates the persistent nickname field, permits duplicate display names, and exposes loading, pending, success, field-error, and safe form-error states.
- Added an exact “退出这台设备？” confirmation that calls generated logout before clearing the active platform transport and shared in-memory session, then replaces the route with login.
- Replaced placeholder contracts with seven passing component cases and two real Nest/PostgreSQL browser journeys, including a separately logged-in second browser context that remains authenticated after first-device logout.
- Preserved `/profile` through authenticated restoration so a direct or reloaded protected profile URL is no longer redirected to the Phase 1 household handoff.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate profile/logout client RED paths** - `f7d5e7c` (test)
2. **Task 2: Implement profile and current-device logout UI** - `9391eb9` (feat)

## Files Created/Modified

- `apps/client/app/(protected)/profile.tsx` - Protected route composing profile editing and logout against the shared runtime.
- `apps/client/src/features/profile/profile-form.tsx` - Generated GET/PATCH form with input whitelist, typed validation, accessible feedback, and current-user refresh.
- `apps/client/src/features/auth/logout-action.tsx` - Accessible confirmation and server-first current-platform session cleanup.
- `apps/client/app/_layout.tsx` - Allows the profile route as a session destination.
- `apps/client/src/features/auth/session-bootstrap.tsx` - Restores an allowlisted authenticated profile target rather than always replacing it with the handoff.
- `apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx` - Regression coverage for restored profile routing.
- `apps/client/src/features/profile/__tests__/profile-form-test.tsx` - Seven component cases for profile and logout behavior.
- `e2e/auth/account-actions.spec.ts` - Real API/database duplicate-name and two-device logout journeys.

## Decisions Made

- Local session material is cleared only after the server logout operation succeeds. A network/server availability failure closes the modal, announces a safe error, and retains the active credential so the user can retry instead of creating ambiguous partial cleanup.
- The authenticated intended-route allowlist remains the navigation authority during bootstrap. `/profile` is preserved, while unrelated or unsafe targets continue to fall back to the no-household handoff.
- Browser E2E creates two independent login sessions rather than cloning one storage state, making second-device isolation evidence correspond to distinct server-side session ids.

## TDD Gate Compliance

- **RED:** `f7d5e7c` passed both marker-bound RED helpers independently with `IMPLEMENTATION_MISSING_ACCOUNT_UI`.
- **GREEN:** `9391eb9` removes the marker and passes 84/84 client tests, strict client typecheck, and 2/2 real-API Playwright account-action journeys.
- **REFACTOR:** No separate refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved the protected profile destination during session restoration**

- **Found during:** Task 2 protected route integration
- **Issue:** The existing authenticated bootstrap path always navigated to `/household-handoff`, so a direct or reloaded `/profile` request could never reach the new protected screen.
- **Fix:** Extended the session destination type to the existing safe intended-route union and routed authenticated restoration to `/profile` when that allowlisted target was requested.
- **Files modified:** `apps/client/app/_layout.tsx`, `apps/client/src/features/auth/session-bootstrap.tsx`, `apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx`
- **Verification:** Session bootstrap regression passes 10/10 and both Playwright profile journeys remain on `/profile` after reload.
- **Committed in:** `9391eb9`

**2. [Rule 3 - Blocking] Made the account-action journey independent of Mailpit image availability**

- **Found during:** Task 2 browser verification
- **Issue:** Docker Hub returned EOF while resolving the pinned Mailpit image, blocking registration setup in the local E2E environment.
- **Fix:** Added a collision-tolerant test SMTP sink and used the isolated PostgreSQL fixture to mark setup accounts verified before creating real API login sessions; the account actions themselves remain full browser-to-Nest-to-PostgreSQL journeys.
- **Files modified:** `e2e/auth/account-actions.spec.ts`
- **Verification:** Both focused Playwright journeys pass against PostgreSQL 18 with no Mailpit container.
- **Committed in:** `9391eb9`

**3. [Rule 1 - Bug] Corrected canonical progress persistence after SDK update**

- **Found during:** Plan close-out
- **Issue:** `state.update-progress` reported 25/27 summaries and 93% but persisted `percent: 0` in STATE frontmatter.
- **Fix:** Applied the handler's reported canonical percentage after all SDK-owned tracking updates completed.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE and ROADMAP record 25 completed plans; STATE records 93%.
- **Committed in:** Plan tracking commit

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking issue).
**Impact on plan:** The fixes were required to make the planned protected route reachable, keep its real API evidence deterministic, and preserve canonical tracking; no device-management or household behavior was added.

## Issues Encountered

- The standard PostgreSQL port 55432 was unavailable locally. Verification reused the existing isolated PostgreSQL 18 fixture on loopback port 55442 after confirming its schema and major version; committed configuration remains unchanged.
- PowerShell 7 is unavailable, so Windows PowerShell 5.1 ran the checked-in RED helper with identical suite, path, and marker arguments.

## User Setup Required

None - no new dependency, service credential, migration, or production configuration is required.

## Known Stubs

None. Static scans found no account-action missing marker, skipped focused suite, placeholder copy, TODO, FIXME, or empty/mock data source in the shipped profile/logout files.

## Threat Flags

None. The client work implements the plan-registered T-17-01 mitigation and introduces no new endpoint, schema, secret store, or caller-selected session target.

## Next Phase Readiness

- Plan 01-26 can run the complete no-skips, accessibility, ASVS, typecheck, and browser gates against a fully implemented account lifecycle.
- Plan 01-27 can exercise profile update and current-device logout on the real Android acceptance target.

## Self-Check: PASSED

- All three created production files and the canonical SUMMARY exist on disk; no tracked file was deleted.
- RED commit `f7d5e7c` precedes GREEN commit `9391eb9`, and both are present on `master`.
- All 84 client tests, strict client typecheck, and both real-API account-action Playwright journeys pass.
- Static scans find no account-action marker, focused-suite skip, goal-blocking stub, Web secret persistence, caller-selected logout target, or unplanned threat surface.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
