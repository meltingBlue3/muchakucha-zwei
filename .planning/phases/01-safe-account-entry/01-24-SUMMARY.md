---
phase: 01-safe-account-entry
plan: 24
subsystem: auth
tags: [nestjs, jwt, prisma, logout, httponly-cookie, openapi]

requires:
  - phase: 01-safe-account-entry/01-18
    provides: Signed sub/sid access JWTs, durable device sessions, rotating refresh credentials, and Web cookie topology
  - phase: 01-safe-account-entry/01-22
    provides: Password-reset global session revocation kept distinct from ordinary logout
provides:
  - Protected idempotent current-device logout derived only from the verified JWT sid
  - Exact two-device isolation and post-logout refresh rejection evidence
  - Matching Web refresh-cookie clearing and generated no-content client contract
affects: [01-25, client-logout, session-bootstrap, security-verification]

tech-stack:
  added: []
  patterns:
    - Route-scoped guard metadata permits idempotent logout of an already revoked sid without weakening other protected routes
    - No-content authenticated generated operations parse empty responses safely

key-files:
  created: []
  modified:
    - apps/api/src/modules/auth/access-token.guard.ts
    - apps/api/src/modules/auth/auth.controller.ts
    - apps/api/src/modules/auth/auth.service.ts
    - apps/api/test/auth/logout.int.test.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts

key-decisions:
  - "Derive logout identity exclusively from a verified access JWT sub/sid pair and expose no request-body session or user target."
  - "Allow a valid, unexpired, known but already revoked sid only on the logout route so repeated logout remains 204 while every other protected route still requires an active session."

patterns-established:
  - "Current-device revoke: conditionally set revokedAt for the verified userId/sessionId pair; a zero-row repeat is a successful no-op."
  - "Cookie deletion mirrors issuance: use the environment-specific name plus identical HttpOnly, Secure, SameSite=Lax, and /api/v1/auth path attributes with Max-Age=0."

requirements-completed: [AUTH-05]

coverage:
  - id: D1
    description: "Protected logout revokes only the signed sid, rejects caller-selected targets, remains idempotent, prevents that device from refreshing, and preserves a second device."
    requirement: AUTH-05
    verification:
      - kind: integration
        ref: "apps/api/test/auth/logout.int.test.ts#current-device logout API contract (5 passed)"
        status: pass
      - kind: integration
        ref: "apps/api/test/auth/login.int.test.ts and apps/api/test/security/asvs-v5-l1.test.ts#guard and termination evidence (19 targeted assertions passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Web logout clears the refresh cookie with the production Secure-prefixed name and the same bounded Path, HttpOnly, SameSite, and Secure topology used at issuance."
    requirement: AUTH-05
    verification:
      - kind: integration
        ref: "apps/api/test/auth/logout.int.test.ts#clears the Web refresh cookie with matching topology"
        status: pass
    human_judgment: false
  - id: D3
    description: "The generated OpenAPI client exposes authenticated POST logout as a typed no-content operation without contract drift."
    requirement: AUTH-05
    verification:
      - kind: other
        ref: "pnpm openapi:check and api-client typecheck"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 24: Current-Device Logout Summary

**Protected logout now derives identity only from the signed access-token `sid`, idempotently revokes that one device, clears the matching Web cookie, and publishes a deterministic no-content client operation.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-01T14:15:10Z
- **Completed:** 2026-08-01T14:25:10Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added `POST /api/v1/auth/logout` with bearer protection, no target body, `204` success, and conditional revocation of exactly the verified `sub`/`sid` pair.
- Proved repeated logout, current-device refresh rejection, second-device continuity, caller-target rejection, and production Web cookie deletion against PostgreSQL 18.
- Generated a typed `ApiClient.logout(accessToken)` operation and made authenticated no-content responses safe to consume without OpenAPI drift.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate logout RED cases** - `b9d281b` (test)
2. **Task 2: Implement sid-only current-device logout** - `38747f6` (feat)

## Files Created/Modified

- `apps/api/src/modules/auth/access-token.guard.ts` - Route-scoped idempotent-logout allowance while retaining signature, claim, session, and expiry checks.
- `apps/api/src/modules/auth/auth.controller.ts` - Protected bodyless logout route and exact refresh-cookie deletion topology.
- `apps/api/src/modules/auth/auth.service.ts` - Conditional current-session revoke keyed by verified user and session identity.
- `apps/api/test/auth/logout.int.test.ts` - Five real HTTP/database cases covering two devices, idempotency, targeting, and production cookies.
- `apps/api/test/auth/login.int.test.ts` - Guard test context updated for route metadata lookup.
- `apps/api/src/openapi/generate-openapi.ts` - Stable logout operation validation and generated no-content client behavior.
- `packages/api-client/openapi.json` - Canonical bearer-protected logout path.
- `packages/api-client/src/generated/client.ts` - Typed authenticated logout method.

## Decisions Made

- Kept logout target-free: the server accepts no caller-selected user or session identifier and derives both values from verified JWT claims.
- Used route-scoped guard metadata for revoked-session acceptance only on logout, preserving endpoint idempotency without allowing revoked access tokens onto `/users/me` or other protected routes.
- Mirrored cookie issuance attributes exactly during deletion, changing only the value and `Max-Age`.

## TDD Gate Compliance

- **RED:** `b9d281b` discovered the real PostgreSQL-backed suite and failed only with `IMPLEMENTATION_MISSING_LOGOUT_API`.
- **GREEN:** `38747f6` passes all 5 focused logout cases, 19 targeted logout/guard/ASVS assertions, API and generated-client strict typechecks, and the committed OpenAPI drift gate.
- **REFACTOR:** No separate refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the approved cached PostgreSQL 18 runtime**

- **Found during:** Task 1 RED verification
- **Issue:** Docker Hub returned EOF while resolving the pinned PostgreSQL 18.4 image.
- **Fix:** Pointed only the test process at the existing isolated PostgreSQL 18 container on loopback port 55442; no committed database configuration changed.
- **Files modified:** None
- **Verification:** RED discovery, focused GREEN, targeted regression, and database-backed logout evidence all accepted PostgreSQL major 18.
- **Committed in:** No file change

**2. [Rule 2 - Missing Critical] Scoped revoked-session verification to idempotent logout**

- **Found during:** Task 2 endpoint design
- **Issue:** The standard access guard correctly rejects revoked sessions, which would make a repeated logout return 401 instead of the required idempotent 204.
- **Fix:** Added explicit route metadata allowing only logout to authenticate a still-valid signed token bound to a known revoked session; all other protected routes continue requiring `revokedAt: null`.
- **Files modified:** `apps/api/src/modules/auth/access-token.guard.ts`, `apps/api/src/modules/auth/auth.controller.ts`
- **Verification:** Repeated logout returns 204 twice, while the existing guard revocation assertion still returns 401 without logout metadata.
- **Committed in:** `38747f6`

**3. [Rule 1 - Bug] Preserved guard-test and ASVS evidence compatibility**

- **Found during:** Task 2 complete API regression
- **Issue:** The existing direct guard mock lacked the new metadata context methods, and the activated logout rewrite had changed the exact ASVS-mapped assertion title.
- **Fix:** Extended the test context with handler/class metadata and restored the canonical termination assertion title while retaining the stronger two-device checks.
- **Files modified:** `apps/api/test/auth/login.int.test.ts`, `apps/api/test/auth/logout.int.test.ts`
- **Verification:** Focused login/logout/ASVS run passes all 19 assertions.
- **Committed in:** `38747f6`

**4. [Rule 1 - Bug] Corrected canonical progress persistence after SDK update**

- **Found during:** Plan close-out
- **Issue:** `state.update-progress` reported 23/27 summaries and 85% but persisted `percent: 0` in STATE frontmatter.
- **Fix:** Applied the handler's reported canonical percentage after all SDK-owned tracking updates completed.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE and ROADMAP record 23 completed plans; STATE records 85%.
- **Committed in:** Plan tracking commit

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 missing critical functionality, 1 blocking issue).
**Impact on plan:** All changes are required for truthful idempotent logout and security evidence; password-reset global revocation and other protected-route behavior remain unchanged.

## Issues Encountered

- PowerShell 7 is unavailable, so the checked-in RED helper ran equivalently under Windows PowerShell 5.1.
- The complete API regression passed 84/85 assertions; an unrelated pre-existing concurrent email-verification case intermittently produced one undefined outcome. It is recorded in `deferred-items.md` and does not affect the required logout, guard, ASVS, typecheck, or OpenAPI gates.

## User Setup Required

None - no new package, service, credential, or migration is required.

## Known Stubs

None. `IMPLEMENTATION_MISSING_LOGOUT_API` is an intentional TDD route-presence sentinel that is unreachable once the implemented endpoint is registered.

## Next Phase Readiness

- Client logout can call the generated no-content operation, then clear platform-local session state without exposing Web refresh material.
- Password-reset global revocation remains unchanged and independently proven.
- No blocker remains for AUTH-05 client integration.

## Threat Flags

None. The new endpoint implements the planned T-16-01 mitigation: signed `sid` only, no caller-selected target, and two-device isolation evidence.

## Self-Check: PASSED

- All eight modified production, test, and generated-contract files exist; no tracked file was deleted.
- RED commit `b9d281b` precedes GREEN commit `38747f6`; both exist on `master`.
- Focused logout tests pass 5/5, targeted logout/guard/ASVS tests pass 19/19, both strict typechecks pass, and `pnpm openapi:check` reports no drift.
- Static scans find no skipped logout suite, goal-blocking stub, caller-controlled logout target, plaintext refresh persistence, or unplanned threat surface.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
