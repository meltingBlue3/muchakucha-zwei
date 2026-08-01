---
phase: 01-safe-account-entry
plan: 09
subsystem: testing
tags: [playwright, e2e, accessibility, mailpit, auth]

requires:
  - phase: 01-safe-account-entry/01-02
    provides: pinned Playwright and axe packages, deterministic Web/API/Mailpit origins, and browser orchestration
provides:
  - Five discovered executable-skipped Web lifecycle suites covering Phase 1 account entry
  - Discovered executable-skipped axe, responsive, focus, zoom, and preference matrix
  - Explicit client-plan ownership boundaries for future browser RED activation
affects: [01-15, 01-17, 01-21, 01-23, 01-25, 01-26]

tech-stack:
  added: []
  patterns: [Playwright suites remain explicitly skipped until the owning client route plan activates them]

key-files:
  created:
    - e2e/auth/register.spec.ts
    - e2e/auth/verify-email.spec.ts
    - e2e/auth/login-session.spec.ts
    - e2e/auth/password-reset.spec.ts
    - e2e/auth/account-actions.spec.ts
    - e2e/auth/accessibility.spec.ts
  modified: []

key-decisions:
  - "Keep browser contracts suite-skipped until their owning client routes and forms exist; server-only plans cannot claim UI RED."
  - "Make skipped bodies exercise real browser, Mailpit, cookie/storage, multi-context, axe, focus, and media-preference behavior rather than fake passing assertions."

patterns-established:
  - "Browser ownership: each E2E suite is activated only by the plan that owns the corresponding client route/form."
  - "Discovery gate: Playwright --list must parse imports and enumerate named cases without starting feature servers."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: Five account lifecycle suites expose named real-browser contracts while remaining explicitly inactive before client ownership begins.
    requirement: AUTH-01
    verification:
      - kind: automated_ui
        ref: "pnpm exec playwright test --list e2e/auth/register.spec.ts e2e/auth/verify-email.spec.ts e2e/auth/login-session.spec.ts e2e/auth/password-reset.spec.ts e2e/auth/account-actions.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: The Web accessibility suite enumerates axe checks at four widths plus keyboard, focus, live-region, 200% zoom, reduced-motion, and forced-colors cases.
    requirement: SAFE-03
    verification:
      - kind: automated_ui
        ref: "pnpm exec playwright test --list e2e/auth/accessibility.spec.ts"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 09: Web Account Contracts Summary

**Twenty-three Playwright browser contracts now define the real Phase 1 account lifecycle and accessibility matrix while remaining explicitly inactive until their owning client plans build the routes.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-01T03:03:21Z
- **Completed:** 2026-08-01T03:06:47Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added 14 named lifecycle cases for registration, real Mailpit verification, HttpOnly-cookie sessions, restart/offline/revocation, reset, nickname changes, and current-device logout.
- Added nine named accessibility cases covering axe at 320/390/768/1440 widths, keyboard order, focus/live regions, 200% zoom, reduced motion, and forced colors.
- Kept every suite explicitly skipped so server-only plans cannot mistake absent client routes, browser startup, configuration, discovery, or imports for valid behavior RED.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold browser lifecycle contracts** - `1d6f7a6` (test)
2. **Task 2: Scaffold the browser accessibility matrix** - `7d8ec9f` (test)

## Files Created/Modified

- `e2e/auth/register.spec.ts` - Real registration form, pending route, password-manager, paste, and reveal contracts.
- `e2e/auth/verify-email.spec.ts` - Mailpit same/cross-device verification, token sanitization, resend, and Web secret-boundary contracts.
- `e2e/auth/login-session.spec.ts` - Login, restart, offline, revoked-session, safe-route, and splash ownership contracts.
- `e2e/auth/password-reset.spec.ts` - Privacy-safe reset request, Mailpit link, global revoke, no-auto-login, and password-denial contracts.
- `e2e/auth/account-actions.spec.ts` - Duplicate nickname and current-device-only logout contracts.
- `e2e/auth/accessibility.spec.ts` - Responsive axe, keyboard/focus/live-region, zoom, reduced-motion, and forced-colors matrix.

## Decisions Made

- Browser suites stay explicitly skipped until Plans 01-15, 01-17, 01-21, 01-23, 01-25, and 01-26 activate the behavior they own.
- Skipped tests contain executable real-system assertions; no empty body or unconditional pass stands in for future behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The optional phase sampling command `pnpm test:quick` currently exits nonzero because the pre-existing API unit project has no test files. This is expected before API contract Plans 01-05/01-06 and is outside Plan 01-09; both required focused Playwright discovery commands and the combined 23-case discovery gate pass. Recorded in `deferred-items.md` without changing API infrastructure.

## Known Stubs

- All six `e2e/auth/*.spec.ts` suites intentionally use `test.describe.skip` as the plan's executable-skipped Wave 0 contract. Their owning client plans remove the skip and introduce the exact `IMPLEMENTATION_MISSING_*` RED marker only after the route/form can exist; this does not prevent Plan 01-09's discovery goal.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 01-15/17/21/23/25 can independently activate only their owned lifecycle suite after the corresponding client route/form exists.
- Plan 01-26 owns activation of the complete accessibility matrix.
- No server-only plan depends on unbuilt browser UI.

## Self-Check: PASSED

- All six planned E2E files exist.
- Task commits `1d6f7a6` and `7d8ec9f` exist and contain no deletions.
- Playwright parses all imports and lists 23 named tests across the six explicitly skipped suites without starting feature servers.
- No fake passing assertion or `IMPLEMENTATION_MISSING` marker exists in the scaffolded contracts.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
