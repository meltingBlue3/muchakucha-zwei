---
phase: 01-safe-account-entry
plan: 07
subsystem: testing
tags: [jest-expo, react-native, auth-contracts, secure-store, wave-0]

requires:
  - phase: 01-safe-account-entry/01-04
    provides: Expo SDK 57 client workspace, Jest Expo discovery, and deterministic platform mocks
provides:
  - Six exact Wave 0 client feature and platform-adapter contract suites
  - Forty-seven named registration, verification, bootstrap, reset, session transport, and profile scenarios
  - Explicit D-06 registration-proof through authenticated no-household handoff pipeline
affects: [01-13, 01-16, 01-19, 01-22, 01-24, phase-01-final-gates]

tech-stack:
  added: []
  patterns:
    - Client Wave 0 suites remain explicitly skipped until their owning behavior plans activate truthful RED
    - Every future RED case has a unique IMPLEMENTATION_MISSING marker

key-files:
  created:
    - apps/client/src/features/auth/__tests__/register-form-test.tsx
    - apps/client/src/features/auth/__tests__/verification-flow-test.tsx
    - apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx
    - apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx
    - apps/client/src/platform/session/__tests__/session-transport-test.ts
    - apps/client/src/features/profile/__tests__/profile-form-test.tsx
  modified: []

key-decisions:
  - "Treat Plan 01-07 as discovery-only Wave 0 scaffolding: suites are explicitly skipped, and later owners activate each unique missing-behavior marker against real production boundaries."
  - "Name D-06 across registration and verification suites as native proof write, proof read and clear, issued-session acceptance, authenticated state, and no-household handoff; Web remains behind the API-issued HttpOnly-cookie boundary."

patterns-established:
  - "Client contract activation: unskip only the owning suite or case, wire the public feature/adapter boundary, and use its unique marker as truthful RED evidence."
  - "Platform contract split: native SecureStore and in-memory access tokens are tested separately from Web HttpOnly cookies and credentialed same-origin requests."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-03]

coverage:
  - id: D1
    description: "All six exact client feature and platform-adapter paths are discovered with 47 explicitly skipped future behavior contracts and no fake passes."
    requirement: SAFE-03
    verification:
      - kind: unit
        ref: "pnpm --filter client test --runInBand --listTests"
        status: pass
      - kind: unit
        ref: "pnpm --filter client test --runInBand (6 suites and 47 tests explicitly skipped)"
        status: pass
      - kind: other
        ref: "pnpm --filter client typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-06 explicitly connects native registration-proof persistence to verification consumption and clearing, issued-session acceptance, authenticated state, and the no-household handoff while preserving the Web cookie boundary."
    requirement: AUTH-02
    verification:
      - kind: other
        ref: "Named D-06 audit across register-form-test.tsx and verification-flow-test.tsx"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 07: Client Feature and Platform Adapter Contracts Summary

**Six Jest Expo suites now discover 47 uniquely marked account-entry and session contracts, including the complete D-06 native proof-to-authenticated-handoff chain and the Web HttpOnly-cookie boundary.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-01T03:24:00Z
- **Completed:** 2026-08-01T03:40:00Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments

- Created all six exact client feature and adapter paths required by the phase validation inventory and proved Jest discovers each path.
- Defined 47 named registration, verification, bootstrap, password-reset, platform-session, logout, and profile contracts with a unique expected missing-behavior marker per future RED case.
- Made D-06 explicit from native registration-proof write through verification read/clear, issued-session acceptance, authenticated state, and no-household handoff, while asserting that Web proof material remains inaccessible to JavaScript.
- Preserved ownership boundaries: no design-system suites from Plan 01-08 and no browser/E2E contracts from Plan 01-09 were added or modified.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create all client feature and adapter contracts** - `0d5d351` (test)

## Files Created/Modified

- `apps/client/src/features/auth/__tests__/register-form-test.tsx` - Registration validation, pending state, safe errors, pending-proof transport, and verification continuation.
- `apps/client/src/features/auth/__tests__/verification-flow-test.tsx` - Token sanitization, D-06 proof/session lifecycle, terminal outcomes, cross-device guidance, and resend eligibility.
- `apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx` - Splash ownership, authenticated restoration, offline retention, reauthentication, and safe intended routes.
- `apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx` - Enumeration safety, link sanitization, password validation, terminal states, and no-auto-login behavior.
- `apps/client/src/platform/session/__tests__/session-transport-test.ts` - Native SecureStore/mutex and Web cookie/lock boundaries plus current-device logout and forbidden-storage rules.
- `apps/client/src/features/profile/__tests__/profile-form-test.tsx` - Subject-scoped nickname loading, whitelisted update, duplicate names, pending state, and accessible feedback.

## Decisions Made

- This Wave 0 task establishes discovery and executable skipped contracts, not behavioral RED or production GREEN. Downstream owners must activate only their cases and demonstrate failure through the already unique marker before implementation.
- D-06 is a cross-suite pipeline rather than one broad test: registration owns proof creation, verification owns proof consumption and clearing, and session acceptance owns the authenticated/no-household result.
- Platform security is expressed as two separate public contracts so native SecureStore behavior cannot accidentally legitimize JavaScript-readable Web secrets.

## TDD Gate Compliance

- Plan 01-07 is an `execute` plan containing a test-only `tdd="true"` Wave 0 task. The behavior-adding MVP gate is inapplicable because no production source file is owned.
- Discovery is green and all 47 future behavior cases remain explicitly skipped. No behavioral RED or GREEN claim is made in this plan.
- Task commit `0d5d351` contains only contract tests; each downstream activation has a unique `IMPLEMENTATION_MISSING_*` marker for a truthful RED run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Isolated contract files as TypeScript modules**

- **Found during:** Task 1 typecheck verification
- **Issue:** Files without imports or exports shared the global script scope, causing their local `missingBehavior` helpers to collide.
- **Fix:** Added an empty module export to every suite so each helper remains file-local without introducing production imports.
- **Files modified:** All six contract files.
- **Verification:** `pnpm --filter client typecheck` passes and Jest still discovers all six paths.
- **Committed in:** `0d5d351`

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** The fix is required for strict TypeScript correctness and does not alter contract behavior or ownership.

## Issues Encountered

- The phase sampling command `pnpm test:quick` still exits nonzero because the pre-existing API `unit` project has no unit test files. This known out-of-scope condition is already recorded in `deferred-items.md`; the client leg passes and every Plan 01-07 focused verification passes.

## User Setup Required

None - contract discovery requires no external services or secrets.

## Known Stubs

- All six suites intentionally use `describe.skip`, and their 47 cases intentionally retain unique `IMPLEMENTATION_MISSING_*` markers. These are Wave 0 contracts, not shipped feature behavior; downstream account-entry implementation plans own activation and removal before the final required-test audit.

## Next Phase Readiness

- Client implementation plans can activate focused cases without inventing test paths or ambiguous failure markers.
- Plan 01-08 retains exclusive ownership of design-token, contrast, and primitive-state suites; the already completed Plan 01-09 retains browser/E2E ownership.
- The D-06 continuation boundary is explicit enough for registration, verification, session transport, router bootstrap, and Phase 2 handoff work to converge on one contract.

## Self-Check: PASSED

- All six planned files exist and are listed by the exact Jest discovery command.
- Task commit `0d5d351` exists in repository history and contains no deletions.
- The full client run reports 6 skipped suites and 47 skipped tests; strict TypeScript passes.
- D-06 is named across registration and verification, every missing-behavior marker is unique, and no design or browser path was modified.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
