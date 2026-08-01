---
phase: 01-safe-account-entry
plan: 19
subsystem: api
tags: [nestjs, prisma, access-guard, openapi, users-me]

requires:
  - phase: 01-safe-account-entry/01-18
    provides: Signed sub/sid access tokens, durable active-session validation, and exported AccessTokenGuard
provides:
  - Authenticated GET and PATCH /api/v1/users/me routes reachable through AppModule
  - Subject-only current-user reads and duplicate-allowed nickname updates with strict validation
  - Minimal Phase 1 public account DTO and deterministic generated client operations
affects: [01-20, 01-21, session-bootstrap, profile-editing]

tech-stack:
  added: []
  patterns:
    - Current-user controllers consume only guard-attached access-token claims
    - Public account responses are explicitly projected instead of returning Prisma records

key-files:
  created:
    - apps/api/src/modules/users/users.module.ts
    - apps/api/src/modules/users/users.controller.ts
    - apps/api/src/modules/users/users.service.ts
    - apps/api/src/modules/users/dto/update-me.dto.ts
  modified:
    - apps/api/src/app.module.ts
    - apps/api/src/main.ts
    - apps/api/src/openapi/generate-openapi.ts
    - apps/api/test/users/me.int.test.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts
    - packages/api-client/src/generated/models.ts

key-decisions:
  - "Nest UsersModule owns and imports the registered AuthModule so users/me reuses the exact configured AccessTokenGuard without duplicating JWT configuration."
  - "Expose hasHousehold as the constant false Phase 1 handoff boundary; no household or Today lookup is claimed before Phase 2."

patterns-established:
  - "Subject-only current-user boundary: controller passes request.auth.sub, service selects explicit public fields, and PATCH accepts only UpdateMeDto."
  - "Nickname normalization: trim at the DTO boundary, then enforce a nonblank 1-80 character value before persistence."

requirements-completed: [AUTH-06]

coverage:
  - id: D1
    description: "GET /api/v1/users/me is HTTP-reachable, rejects absent or non-session access tokens, and exposes only the authenticated subject's Phase 1 public profile."
    requirement: AUTH-06
    verification:
      - kind: integration
        ref: "apps/api/test/users/me.int.test.ts#current-user API contract (8 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PATCH /api/v1/users/me updates only guard-derived subjects, permits duplicate display names, trims valid nicknames, and rejects blank, overlong, and mass-assignment input."
    requirement: AUTH-06
    verification:
      - kind: integration
        ref: "apps/api/test/users/me.int.test.ts#PATCH subject isolation and nickname validation"
        status: pass
    human_judgment: false
  - id: D3
    description: "The generated OpenAPI client exposes typed getMe and updateMe operations without Prisma or authentication-internal fields."
    requirement: AUTH-06
    verification:
      - kind: other
        ref: "pnpm openapi:check"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 19: Authenticated Current-User API Summary

**Guard-bound GET/PATCH users/me now returns a minimal Phase 1 account projection, safely updates only the authenticated nickname, and ships matching generated OpenAPI client operations.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-01T13:13:38Z
- **Completed:** 2026-08-01T13:21:25Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Registered an HTTP-reachable UsersModule whose GET/PATCH routes reuse the signed access-token guard and durable session binding from Plan 01-18.
- Added explicit public response and whitelisted update DTOs so only id, original email, display name, verified state, and the intentional `hasHousehold: false` handoff signal cross the API boundary.
- Proved subject isolation, active authentication, duplicate nicknames, trimming, length limits, mass-assignment rejection, and generated OpenAPI stability against PostgreSQL 18.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate users/me reachability and isolation RED** - `dd75a64` (test)
2. **Task 2: Register UsersModule and implement current-user API** - `a82f256` (feat)

## Files Created/Modified

- `apps/api/src/modules/users/users.module.ts` - Registers the users boundary with the configured auth module.
- `apps/api/src/modules/users/users.controller.ts` - Guarded GET/PATCH routes using only `request.auth.sub`.
- `apps/api/src/modules/users/users.service.ts` - Subject-only Prisma reads and nickname updates with explicit projection.
- `apps/api/src/modules/users/dto/update-me.dto.ts` - Public response and strict nickname update contracts.
- `apps/api/src/app.module.ts` - Imports the reachable UsersModule boundary.
- `apps/api/src/main.ts` - Allows PATCH in the exact-origin CORS method set.
- `apps/api/src/openapi/generate-openapi.ts` - Generates and validates users/me operations and models.
- `apps/api/test/users/me.int.test.ts` - Eight real HTTP, PostgreSQL, authorization, isolation, and validation cases.
- `packages/api-client/openapi.json` - Canonical users/me OpenAPI paths and schemas.
- `packages/api-client/src/generated/client.ts` - Typed bearer-authenticated `getMe` and `updateMe` calls.
- `packages/api-client/src/generated/models.ts` - Public current-user and nickname update models.

## Decisions Made

- Nested the configured AuthModule under UsersModule so one registered boundary provides both the existing auth controllers and the exact exported AccessTokenGuard; no parallel JWT configuration was introduced.
- Kept `hasHousehold: false` as an explicit Phase 1 handoff signal and intentionally omitted household membership and Today data.

## TDD Gate Compliance

- **RED:** `dd75a64` passed discovery and failed at the booted HTTP route with `IMPLEMENTATION_MISSING_USERS_ME` after PostgreSQL fixtures succeeded.
- **GREEN:** `a82f256` removed the marker and passes 8 focused cases, 67 API regression tests, both strict typechecks, and the post-commit OpenAPI drift gate.
- **REFACTOR:** No separate refactor commit was required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the safe cached PostgreSQL 18 runtime**

- **Found during:** Task 1 RED verification
- **Issue:** The default isolated port was dormant while a previously approved PostgreSQL 18 test container was already healthy on port 55442.
- **Fix:** Pointed only the test process at the cached loopback PostgreSQL 18 instance without changing committed database configuration.
- **Files modified:** None
- **Verification:** Integration setup accepted server version 18.2; RED, GREEN, and the 67-test API regression completed successfully.
- **Committed in:** No file change

**2. [Rule 3 - Blocking] Made RED fixtures satisfy the database password-hash constraint**

- **Found during:** Task 1 RED activation
- **Issue:** The first current-user fixture used a non-Argon placeholder and failed the database CHECK before reaching the missing route.
- **Fix:** Generated a valid Argon2id fixture hash once per suite so the only RED failure was the missing users/me behavior.
- **Files modified:** `apps/api/test/users/me.int.test.ts`
- **Verification:** The RED helper accepted the named missing-route marker after successful fixture insertion.
- **Committed in:** `dd75a64`

**3. [Rule 2 - Missing Critical] Enabled PATCH through the configured Web CORS boundary**

- **Found during:** Task 2 implementation
- **Issue:** The application CORS method allowlist exposed only GET, POST, and OPTIONS, so the new PATCH endpoint would be unreachable from the auxiliary Web client despite working natively.
- **Fix:** Added PATCH to the existing exact-origin CORS method set.
- **Files modified:** `apps/api/src/main.ts`
- **Verification:** Strict API typecheck and complete API regression pass; generated contract publishes the PATCH operation.
- **Committed in:** `a82f256`

---

**Total deviations:** 3 auto-fixed (2 blocking issues, 1 missing critical functionality).
**Impact on plan:** All fixes were required for truthful RED evidence and cross-platform route reachability; no schema, dependency, or account scope expanded.

## Issues Encountered

- The OpenAPI drift command intentionally compares generated output with committed HEAD, so it reported expected drift before the feature commit and passed immediately after the generated contract was committed.

## User Setup Required

None - no new external service or production credential is required.

## Known Stubs

None. `hasHousehold: false` is the intentional Phase 1 handoff contract; Phase 2 owns real household membership lookup and Today behavior.

## Next Phase Readiness

- Plan 01-20 can call generated `getMe` only after accepting an access token during serialized session restoration.
- Plan 01-21 can route from the authenticated public profile to the established no-household handoff without reading auth internals.
- No unresolved blocker remains.

## Self-Check: PASSED

- All four created users files and seven modified contract/application files exist and are committed.
- RED commit `dd75a64` precedes GREEN commit `a82f256`; both are present on master with no tracked deletion or untracked output.
- Focused integration passes 8/8, full API regression passes 67 tests, API/generated-client strict typechecks pass, and `pnpm openapi:check` reports no drift.
- Static scans find no RED marker, skipped users/me suite, goal-blocking stub, Prisma/auth-internal response field, or unplanned trust boundary.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
