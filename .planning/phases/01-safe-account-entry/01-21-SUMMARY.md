---
phase: 01-safe-account-entry
plan: 21
subsystem: client-auth
tags: [expo-router, react-native, session-bootstrap, playwright, accessibility]

requires:
  - phase: 01-safe-account-entry/01-14
    provides: Typed warm theme and owned accessible primitives
  - phase: 01-safe-account-entry/01-19
    provides: Generated users/me contract with explicit no-household signal
  - phase: 01-safe-account-entry/01-20
    provides: Platform-safe login, refresh, restore, and users/me transports
provides:
  - Route-level branded bootstrap with no login flash and shared application session runtime
  - Accessible email/password login with authenticated-state-before-navigation ordering
  - Distinct offline retention, explicit reauthentication, safe intended-route, and no-household handoff paths
affects: [01-23, 01-24, 01-25, phase-02-households]

tech-stack:
  added: []
  patterns:
    - One module-scoped session runtime is shared by root bootstrap and auth routes
    - Public verification continuations bypass restoration while protected entry restores before rendering
    - Auth rejection clears credentials; availability failure retains them behind an offline retry state

key-files:
  created:
    - apps/client/app/(auth)/login.tsx
    - apps/client/app/(auth)/offline.tsx
    - apps/client/app/(protected)/household-handoff.tsx
    - apps/client/src/features/auth/login-form.tsx
    - apps/client/src/features/auth/session-bootstrap.tsx
    - apps/client/src/features/auth/session-runtime.ts
  modified:
    - apps/client/app/_layout.tsx
    - apps/client/app/index.tsx
    - apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx
    - apps/client/src/ui/primitives.tsx
    - e2e/auth/login-session.spec.ts

key-decisions:
  - "Share one module-scoped session transport and state store between root bootstrap and login so authenticated state is observable before protected navigation."
  - "Bypass restart restoration only for public registration and token-sanitizing continuation routes; protected and root entry remain splash-owned until restoration resolves."
  - "Route every Phase 1 authenticated profile to the no-household handoff and preserve only allowlisted internal intended routes without claiming Today or household behavior."

patterns-established:
  - "Bootstrap remount safety: terminal session state prevents duplicate refresh after router replacement, while a fresh application module performs restoration again."
  - "Accessible session feedback: assertive banners expose alert semantics and offline waiting uses a labelled status panel with an explicit retry action."

requirements-completed: [AUTH-03, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "Login and fresh-page restoration publish authenticated state before routing only to the Phase 1 no-household handoff."
    requirement: AUTH-03
    verification:
      - kind: unit
        ref: "apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx#authenticated ordering and no-household handoff"
        status: pass
      - kind: e2e
        ref: "e2e/auth/login-session.spec.ts#login and fresh-page restoration"
        status: pass
    human_judgment: false
  - id: D2
    description: "Explicit credential rejection clears session material, announces reauthentication, and preserves only an allowlisted internal intended route."
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: "apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx#rejection and intended-route allowlist"
        status: pass
      - kind: e2e
        ref: "e2e/auth/login-session.spec.ts#rejected session browser path"
        status: pass
    human_judgment: false
  - id: D3
    description: "Timeout, DNS, offline, and server availability outcomes retain credentials and expose offline retry without flashing login."
    requirement: SAFE-03
    verification:
      - kind: unit
        ref: "apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx#offline retention matrix"
        status: pass
      - kind: e2e
        ref: "e2e/auth/login-session.spec.ts#availability failure and splash ownership"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 21: Login and Route-Level Session Restoration Summary

**Accessible login and Expo Router bootstrap now restore platform-safe sessions without UI flash, retain credentials offline, clear rejected sessions, and stop at the Phase 1 no-household handoff.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-01T13:56:00Z
- **Completed:** 2026-08-01T14:10:50Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Delivered an owned-primitives login form with email/password semantics, stable pending action, safe error copy, registration/recovery links, and authenticated-state-before-navigation ordering.
- Added a route-level bootstrap state machine that holds branded loading, distinguishes unauthenticated/authenticated/offline/reauthentication outcomes, avoids duplicate refresh on route remount, and retries retained offline sessions.
- Added the dedicated offline and protected no-household routes while keeping household creation, membership, and Today behavior entirely outside Phase 1.
- Activated nine component assertions and four Playwright journeys for restart restoration, Web secret absence, offline retention, rejected-session recovery, safe intended routes, and splash ownership.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate bootstrap and browser-session RED paths** - `b2a8404` (test)
2. **Task 2: Implement login, bootstrap, offline, and handoff routes** - `022b4bc` (feat)

## Files Created/Modified

- `apps/client/app/_layout.tsx` - Root session gate and safe router replacement.
- `apps/client/app/index.tsx` - D-01 login entry instead of registration-first redirect.
- `apps/client/app/(auth)/login.tsx` - Shared-runtime login route.
- `apps/client/app/(auth)/offline.tsx` - Dedicated retained-session retry route.
- `apps/client/app/(protected)/household-handoff.tsx` - Protected Phase 1 destination with Phase 2 action disabled.
- `apps/client/src/features/auth/login-form.tsx` - Accessible validated login composition.
- `apps/client/src/features/auth/session-bootstrap.tsx` - Typed restart restoration state machine and intended-route allowlist.
- `apps/client/src/features/auth/session-runtime.ts` - Single application session transport/state ownership.
- `apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx` - Nine executable D-01/D-03/D-04/D-11/D-12 cases.
- `apps/client/src/ui/primitives.tsx` - Assertive Banner now exposes alert semantics.
- `e2e/auth/login-session.spec.ts` - Four deterministic browser-session journeys.
- `apps/client/app/household-handoff.tsx` - Intentionally removed after moving the route into the protected group.

## Decisions Made

- Root bootstrap and login share one runtime singleton so a successful login cannot navigate with only a route-local authenticated state.
- Public registration and token-sanitizing verification continuations render directly; root and protected entry remain restoration-gated.
- The current-user `hasHousehold: false` contract always ends at the Phase 1 handoff. Safe intended routes are carried only as internal allowlisted values and never override that phase boundary.

## TDD Gate Compliance

- **RED:** `b2a8404` independently passed the component and Playwright RED helpers with the exact `IMPLEMENTATION_MISSING_SESSION_UI` marker.
- **GREEN:** `022b4bc` removes the marker and passes 9 focused component tests, 4 focused Playwright tests, all 67 active client tests, and strict client typecheck.
- **REFACTOR:** No separate refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented terminal route replacement from restarting refresh**

- **Found during:** Task 2 browser verification
- **Issue:** Router replacement could remount the root bootstrap and repeatedly re-enter refresh, leaving offline and reauthentication journeys on the splash.
- **Fix:** Reused the shared terminal session state on remount and restore only from a fresh booting state.
- **Files modified:** `apps/client/src/features/auth/session-bootstrap.tsx`, `apps/client/src/features/auth/session-runtime.ts`
- **Verification:** Four focused Playwright journeys and nine component cases pass.
- **Committed in:** `022b4bc`

**2. [Rule 2 - Missing Critical] Preserved public registration and sanitized verification entry**

- **Found during:** Task 2 route integration
- **Issue:** A root-wide restore gate could intercept public registration or token-sanitizing continuation routes before their owning screens rendered.
- **Fix:** Added an explicit public-continuation bypass while keeping root, login, and protected routes restoration-gated.
- **Files modified:** `apps/client/app/_layout.tsx`, `apps/client/src/features/auth/session-bootstrap.tsx`
- **Verification:** Public registration renders directly; all required session gates pass.
- **Committed in:** `022b4bc`

**3. [Rule 2 - Missing Critical] Added programmatic alert semantics to assertive banners**

- **Found during:** Task 2 rejected-session browser verification
- **Issue:** Reauthentication copy had an assertive live region but no alert role, so the browser accessibility tree could not locate it as urgent feedback.
- **Fix:** Added `accessibilityRole="alert"` to the shared Banner primitive.
- **Files modified:** `apps/client/src/ui/primitives.tsx`
- **Verification:** Rejected-session Playwright assertion locates and reads the alert; complete client regression passes.
- **Committed in:** `022b4bc`

**4. [Rule 1 - Bug] Corrected canonical progress persistence after SDK update**

- **Found during:** Plan close-out
- **Issue:** `state.update-progress` reported 22/27 and 81% but persisted `percent: 0` in STATE frontmatter.
- **Fix:** Applied the handler's reported canonical percentage after all SDK-owned tracking updates completed.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE and ROADMAP record 22 completed plans; STATE records 81%.
- **Committed in:** Plan tracking commit

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 missing critical functionality).
**Impact on plan:** All fixes preserve route correctness and accessibility inside the planned session UI boundary; no household or Today implementation was added.

## Issues Encountered

- PowerShell 7 (`pwsh`) is unavailable in this Windows environment. Windows PowerShell executed the exact RED helper arguments and accepted only the required marker-bound failures.
- An optional registration regression reached the public form but its real API request returned the existing generic failure banner; this does not affect the required 01-21 gates and is recorded in `deferred-items.md` for its owning flow.

## User Setup Required

None - no new dependency, service, or credential is required.

## Known Stubs

None. The disabled “继续设置家庭” action is the intentional Phase 1-to-Phase 2 handoff boundary and does not claim household functionality.

## Threat Flags

None. Session bootstrap and intended-route handling implement the plan-registered T-21-01 and T-21-02 mitigations; no new endpoint, persistence schema, or secret surface was introduced.

## Next Phase Readiness

- Plan 01-23 can attach forgot/reset routes to the existing login recovery link without changing bootstrap ownership.
- Plans 01-24 and 01-25 can consume the shared session runtime for current-device logout and profile behavior.
- Phase 2 remains the sole owner of household setup and any Today destination.

## Self-Check: PASSED

- All six created files exist; the original root handoff route was intentionally replaced by the protected-group route.
- RED commit `b2a8404` precedes GREEN commit `022b4bc`; both are present on `master` and only the intentional handoff move deleted a tracked file.
- Focused component tests pass 9/9, focused Playwright tests pass 4/4, all active client tests pass 67/67, and strict client typecheck passes.
- Static scans find no session UI marker, focused suite skip, goal-blocking stub, Today/household implementation, Web secret storage, or unplanned threat surface.
- Canonical tracking records Plan 23 of 27, 22 completed summaries, and 81% progress.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
