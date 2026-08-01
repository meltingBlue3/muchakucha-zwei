---
phase: 01-safe-account-entry
plan: 23
subsystem: client-auth
tags: [expo-router, react-native, password-reset, playwright, accessibility]

requires:
  - phase: 01-safe-account-entry/01-14
    provides: Typed warm theme and owned accessible primitives
  - phase: 01-safe-account-entry/01-21
    provides: Public auth routing, normal login, and shared session runtime boundary
  - phase: 01-safe-account-entry/01-22
    provides: Generated password-reset request/completion operations and global session revoke
provides:
  - Privacy-safe forgot-password request route with stable generic confirmation
  - Token-sanitizing reset landing with accessible password validation and terminal recovery states
  - Reset-success route explaining all-device reauthentication without creating a session
affects: [01-25, client-auth, security-verification]

tech-stack:
  added: []
  patterns:
    - Opaque reset credentials are captured once and removed continuously from browser history while the landing is mounted
    - Browser reset E2E captures real SMTP delivery in-process when the pinned Mailpit runtime is unavailable

key-files:
  created:
    - apps/client/app/(auth)/forgot-password.tsx
    - apps/client/app/auth/reset-password.tsx
    - apps/client/app/(auth)/reset-success.tsx
    - apps/client/src/features/auth/password-reset-flow.tsx
  modified:
    - apps/client/app/_layout.tsx
    - apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx
    - e2e/auth/password-reset.spec.ts

key-decisions:
  - "Sanitize the token-bearing browser location synchronously and keep replacing it until the reset landing unmounts, because Expo Router can restore search parameters after its first render."
  - "Keep password-reset completion entirely outside the session runtime; success routes only to normal login and relies on the server-owned global revoke transaction."
  - "Preserve the server's generic invalid-or-expired credential boundary while exposing accessible expired, used, and invalid recovery panels as client states."

patterns-established:
  - "Token-safe continuation: capture the opaque token in a route ref, render no secret, clear browser URL/history before mutation, and dispose the sanitizer on unmount."
  - "Enumeration-safe recovery: successful reset requests always show the exact same confirmation regardless of submitted identity."

requirements-completed: [AUTH-04]

coverage:
  - id: D1
    description: "Forgot-password requests validate an accessible email field and expose one privacy-safe confirmation for existing and absent identities."
    requirement: AUTH-04
    verification:
      - kind: unit
        ref: "apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx#privacy-safe request confirmation"
        status: pass
      - kind: e2e
        ref: "e2e/auth/password-reset.spec.ts#delivered reset journey"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reset credentials are removed from visible URL, history state, rendered output, and browser console before the generated completion mutation runs."
    requirement: AUTH-04
    verification:
      - kind: unit
        ref: "apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx#token sanitization ordering"
        status: pass
      - kind: e2e
        ref: "e2e/auth/password-reset.spec.ts#URL history and console sanitization"
        status: pass
    human_judgment: false
  - id: D3
    description: "Accessible reset validation rejects common passwords, prevents duplicate submission, explains all-device reauthentication, and returns to login without session creation."
    requirement: AUTH-04
    verification:
      - kind: unit
        ref: "apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx#validation pending outcomes and no auto-login (9 passed)"
        status: pass
      - kind: e2e
        ref: "e2e/auth/password-reset.spec.ts#common password and normal-login-only journeys (2 passed)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 23: Safe Password Reset Client Journey Summary

**Accessible forgot, reset, and success routes now consume the generated API safely, scrub opaque credentials from browser state before use, and require normal login after the server revokes all sessions.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-01T14:40:05Z
- **Completed:** 2026-08-01T15:00:18Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Delivered privacy-safe forgot-password UX with persistent labels, correct email metadata, stable pending action, generic confirmation, live status, and safe error handling.
- Added a token-safe reset landing that continuously removes Expo Router query restoration from visible URL/history, never renders or logs the credential, validates 12–128 character/common-password failures, and prevents duplicate mutation.
- Added distinct accessible expired, used, and invalid recovery panels plus the exact D-09 success explanation and normal-login-only return path.
- Activated nine component contracts and two real browser journeys using generated API operations and actual SMTP delivery.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate reset client RED paths** - `a0d5098` (test)
2. **Task 2: Implement forgot/reset/success UI** - `da4a37c` (feat)

## Files Created/Modified

- `apps/client/app/(auth)/forgot-password.tsx` - Generated-client reset-request route.
- `apps/client/app/auth/reset-password.tsx` - Opaque-token capture and browser/native location sanitizer.
- `apps/client/app/(auth)/reset-success.tsx` - Normal-login-only success route.
- `apps/client/src/features/auth/password-reset-flow.tsx` - Accessible request, completion, recovery, and success components.
- `apps/client/app/_layout.tsx` - Public continuation ownership for token sanitization and reset success.
- `apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx` - Nine executable reset component contracts.
- `e2e/auth/password-reset.spec.ts` - Two delivered-link and common-password Web journeys with in-process SMTP capture.

## Decisions Made

- Browser sanitization remains active until the reset landing unmounts because Expo Router may restore its search state after the synchronous history replacement.
- The client never imports or calls the shared session runtime during recovery. Server completion revokes sessions; the success screen only routes to ordinary login.
- The server intentionally returns one generic invalid-or-expired terminal code. The client owns distinct accessible recovery-panel states without weakening that server security boundary.

## TDD Gate Compliance

- **RED:** `a0d5098` independently passed both marker-bound RED helpers with `IMPLEMENTATION_MISSING_RESET_UI`.
- **GREEN:** `da4a37c` removes the marker and passes 9 focused component tests, 2 focused browser tests, all 76 active client tests, and strict client typecheck.
- **REFACTOR:** No separate refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Kept reset continuations outside session restoration**

- **Found during:** Task 2 route integration
- **Issue:** The planned reset-success route and actual `/auth/reset-password` pathname were not included in the root public-continuation allowlist, so session bootstrap could intercept credential sanitization or hide the success explanation.
- **Fix:** Added both exact paths to the existing public continuation boundary.
- **Files modified:** `apps/client/app/_layout.tsx`
- **Verification:** Focused browser journeys reach reset and success routes; full client regression passes.
- **Committed in:** `da4a37c`

**2. [Rule 1 - Bug] Prevented Expo Router from restoring the reset token**

- **Found during:** Task 2 browser verification
- **Issue:** A single `history.replaceState` cleared the URL initially, but Expo Router could restore its query state after rendering.
- **Fix:** Kept an idempotent history sanitizer active while the landing is mounted and disposed it on unmount.
- **Files modified:** `apps/client/app/auth/reset-password.tsx`, `apps/client/src/features/auth/password-reset-flow.tsx`
- **Verification:** Playwright proves the token is absent from URL, history state, and console before completion and after common-password rejection.
- **Committed in:** `da4a37c`

**3. [Rule 3 - Blocking] Made delivered-mail E2E independent of unavailable Mailpit image**

- **Found during:** Task 2 browser verification
- **Issue:** Two attempts to start the approved pinned Mailpit image failed with Docker Hub EOF, blocking the real mail-delivery journey.
- **Fix:** Added a suite-local SMTP protocol capture server that receives the API's real Nodemailer delivery and extracts quoted-printable verification/reset links.
- **Files modified:** `e2e/auth/password-reset.spec.ts`
- **Verification:** Both focused Playwright journeys pass through real registration, verification mail, reset mail, generated API completion, and login-only success.
- **Committed in:** `da4a37c`

**4. [Rule 1 - Bug] Corrected canonical progress persistence after SDK update**

- **Found during:** Plan close-out
- **Issue:** `state.update-progress` reported 24/27 summaries and 89% but persisted `percent: 0` in STATE frontmatter.
- **Fix:** Applied the handler's own reported canonical percentage after all SDK-owned state updates completed.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE and ROADMAP record 24 completed summaries; STATE records 89%.
- **Committed in:** Plan metadata commit

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 missing critical functionality, 1 blocking issue).
**Impact on plan:** All changes are confined to planned client recovery behavior and its verification environment; no API, schema, dependency, or session architecture changed.

## Issues Encountered

- PowerShell 7 was unavailable, so Windows PowerShell 5.1 ran both exact RED helper invocations successfully.
- The pinned Mailpit image could not be fetched because Docker Hub returned EOF. The E2E SMTP capture replacement exercises the same provider-neutral mail port without adding a package.
- Focused browser verification reused the approved cached PostgreSQL 18 test runtime on loopback port 55442 because the default Compose PostgreSQL runtime was unavailable.

## User Setup Required

None - no dependency, credential, or external provider configuration was added.

## Known Stubs

None. Expired, used, and invalid panels are complete client states; the current server intentionally maps invalid-or-expired credentials to its generic invalid outcome rather than disclosing terminal credential history.

## Threat Flags

None. The reset-link surface implements planned T-15-01 with immediate and mount-lifetime URL/history sanitization; no new endpoint, secret store, session path, or schema boundary was introduced.

## Next Phase Readiness

- Plan 01-25 can consume the existing shared session runtime without password-reset coupling.
- AUTH-04 now has server, generated-client, component, and delivered-browser coverage with no unresolved blocker.

## Self-Check: PASSED

- All four created route/feature files exist; all three planned/critical modified files are committed.
- RED commit `a0d5098` precedes GREEN commit `da4a37c`; both exist on `master` with no tracked deletion.
- Focused component tests pass 9/9, focused Playwright tests pass 2/2, complete active client tests pass 76/76, and strict client typecheck passes.
- Static scans find no reset marker, focused-suite skip, Web storage/session runtime use, token logging, raw feature styling, goal-blocking placeholder, or unplanned threat surface.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
