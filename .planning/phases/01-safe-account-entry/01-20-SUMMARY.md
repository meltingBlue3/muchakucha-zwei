---
phase: 01-safe-account-entry
plan: 20
subsystem: client-auth
tags: [react-native, securestore, web-locks, openapi-client, refresh-rotation]

requires:
  - phase: 01-safe-account-entry/01-12
    provides: Platform-specific session storage boundary and typed restoration outcomes
  - phase: 01-safe-account-entry/01-18
    provides: Generated login/refresh operations and rotating session API
  - phase: 01-safe-account-entry/01-19
    provides: Generated authenticated users/me operation and public current-user DTO
provides:
  - Generated-client-backed login, refresh, and users/me session adapter
  - Process single-flight native rotation and Web Lock plus in-tab serialization
  - Typed credential rejection versus availability outcomes with safe retention rules
affects: [01-21, session-bootstrap, login, authenticated-api]

tech-stack:
  added: []
  patterns:
    - Memory access-token injection into a generated OpenAPI client wrapper
    - Platform refresh coordinators around one rotation operation

key-files:
  created:
    - apps/client/src/api/api-client.ts
    - apps/client/src/api/refresh-coordinator.ts
  modified:
    - apps/client/src/platform/session/session-transport.ts
    - apps/client/src/platform/session/session-transport.native.ts
    - apps/client/src/platform/session/session-transport.web.ts
    - apps/client/src/platform/session/__tests__/session-transport-test.ts
    - apps/client/src/features/auth/__tests__/verification-flow-test.tsx

key-decisions:
  - "Accept and persist the rotated platform credential before loading users/me, so an availability failure retains a valid session instead of corrupting rotation state."
  - "Map explicit 401 refresh outcomes to expired, revoked, or replayed reauthentication while treating network, 408, 429, and 5xx failures as offline retention."
  - "Keep one refresh coordinator per platform module: process-wide single-flight on native and Web Lock with an in-tab fallback on Web."

patterns-established:
  - "Session API wrapper: generated login/refresh/getMe methods plus an injected memory-only access-token reader."
  - "One-retry current-user loading: an access rejection may enter the serialized refresh path once; refresh itself never recursively retries."

requirements-completed: [AUTH-03, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "Native login and restoration use generated body operations, persist each rotated refresh generation in SecureStore, and fetch users/me only after access acceptance."
    requirement: AUTH-03
    verification:
      - kind: unit
        ref: "apps/client/src/platform/session/__tests__/session-transport-test.ts#native generated login/refresh and users-me ordering"
        status: pass
    human_judgment: false
  - id: D2
    description: "Web restoration sends credentialed cookie refresh calls, exposes no refresh secret API, and serializes rotation with Web Locks plus an in-tab fallback."
    requirement: SAFE-03
    verification:
      - kind: unit
        ref: "apps/client/src/platform/session/__tests__/session-transport-test.ts#Web credentialed refresh and lock cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "Explicit expired, revoked, and replayed authentication failures clear credentials while network and server availability failures retain them for offline retry."
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: "pnpm --filter client test --runInBand session-transport (18 passed)"
        status: pass
      - kind: other
        ref: "pnpm --filter client typecheck"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 20: Generated Session Transport Wiring Summary

**Generated login, rotating refresh, and users/me calls now flow through platform-safe session adapters with SecureStore/HttpOnly separation, serialized rotation, and typed offline retention.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-01T13:26:18Z
- **Completed:** 2026-08-01T13:35:48Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Connected the pre-established SessionTransport boundary to the real generated login, refresh, and users/me operations without importing Prisma or duplicating HTTP contracts.
- Preserved the native atomic ordering of SecureStore rotation before access publication and the Web rule that JavaScript never receives a refresh credential.
- Added shared single-flight coordination, optional Web Lock serialization, one bounded users/me refresh retry, and typed authentication-versus-availability outcomes.
- Expanded the focused adapter matrix to 18 passing cases and kept the complete client regression at 58 passing tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate real refresh transport RED cases** - `ff09a98` (test)
2. **Task 2: Implement generated-client session transport wiring** - `c7131f7` (feat)

## Files Created/Modified

- `apps/client/src/api/api-client.ts` - Injected-access generated-client wrapper and typed session error mapping.
- `apps/client/src/api/refresh-coordinator.ts` - Reusable single-flight coordinator and Web Lock adapter.
- `apps/client/src/platform/session/session-transport.ts` - Login/current-user session contract and optional authenticated profile projection.
- `apps/client/src/platform/session/session-transport.native.ts` - SecureStore-backed generated login/refresh/current-user composition.
- `apps/client/src/platform/session/session-transport.web.ts` - Cookie-only generated login/refresh/current-user composition with Web Locks.
- `apps/client/src/platform/session/__tests__/session-transport-test.ts` - Eighteen storage, wiring, ordering, concurrency, retry, and failure-classification cases.
- `apps/client/src/features/auth/__tests__/verification-flow-test.tsx` - Complete mock implementation for the expanded SessionTransport interface.

## Decisions Made

- Accepted a rotated credential before users/me because rotation is already committed server-side; losing that successor on a profile availability failure would strand the valid session.
- Kept login credential errors as generated API errors for the login form, while refresh and users/me convert only session-relevant failures into typed restore outcomes.
- Used structural API failure detection instead of relying on a runtime generated-error class, keeping mapping stable across the React Native/Jest module boundary.

## TDD Gate Compliance

- **RED:** `ff09a98` kept all 11 established storage-boundary cases green while five activated wiring cases failed only with `IMPLEMENTATION_MISSING_REFRESH_WIRING`.
- **GREEN:** `c7131f7` removed the marker and passes 18 focused cases, 58 complete client cases, and strict client/generated-client typechecks.
- **REFACTOR:** No separate refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a circular runtime error-class dependency**

- **Found during:** Task 2 GREEN verification
- **Issue:** Importing the restore error through the transport contract created a runtime cycle under Jest, making `instanceof` evaluate against an undefined constructor.
- **Fix:** Made the generated-client wrapper own the error class, kept transport contract imports type-only, and imported the runtime class directly in platform adapters.
- **Files modified:** `apps/client/src/api/api-client.ts`, `apps/client/src/platform/session/session-transport.ts`, native/Web adapters
- **Verification:** All 18 focused cases and strict typecheck pass.
- **Committed in:** `c7131f7`

**2. [Rule 3 - Blocking] Updated the verification-flow test double for the expanded transport contract**

- **Found during:** Task 2 strict typecheck
- **Issue:** The existing verification-flow mock lacked the newly required login and loadCurrentUser methods, blocking project typecheck.
- **Fix:** Added inert Jest methods to the test double without changing verification behavior.
- **Files modified:** `apps/client/src/features/auth/__tests__/verification-flow-test.tsx`
- **Verification:** Client typecheck and the full 58-test client regression pass.
- **Committed in:** `c7131f7`

**3. [Rule 1 - Bug] Corrected canonical progress persistence after SDK update**

- **Found during:** Plan close-out
- **Issue:** `state.update-progress` correctly reported 20/27 and 74% but persisted `percent: 0` in STATE frontmatter.
- **Fix:** Applied the handler's reported canonical percentage after all SDK-owned state updates completed.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE and ROADMAP both record 20 completed plans; STATE now records 74%.
- **Committed in:** Plan tracking synchronization commit

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking issue).
**Impact on plan:** The fixes were required for a runtime-safe adapter boundary, complete strict verification, and truthful canonical tracking; credential architecture and route ownership remained unchanged.

## Issues Encountered

- PowerShell 7 (`pwsh`) is unavailable. The established Windows PowerShell fallback ran the exact RED helper arguments and accepted only the required marker-bound failure.

## User Setup Required

None - no new dependency, external service, or credential is required.

## Known Stubs

None. The `null` values found by the mechanical scan are intentional memory-token and single-flight sentinels, not UI or data placeholders.

## Next Phase Readiness

- Plan 01-21 can compose `login`, `restore`, and `loadCurrentUser` into route-level bootstrap and use the returned public current-user projection for the no-household handoff.
- Offline failures retain the platform credential, while explicit authentication rejection returns a typed reauthentication reason ready for D-11/D-12 UI states.
- No unresolved blocker remains.

## Self-Check: PASSED

- Both created files and all five modified implementation/test files exist; task commits `ff09a98` and `c7131f7` are present in order with no tracked deletion or untracked output.
- Focused session transport tests pass 18/18, the complete client suite passes 58 tests, and strict client plus generated-client typechecks pass.
- Static scans find no refresh wiring marker, production AsyncStorage/localStorage use, Web refresh getter/setter, placeholder stub, or unplanned direct network surface.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
