---
phase: 01-safe-account-entry
plan: 22
subsystem: auth
tags: [nestjs, prisma, argon2id, password-reset, openapi]

requires:
  - phase: 01-safe-account-entry/01-11
    provides: PasswordResetToken schema, hash-only credential constraints, and PostgreSQL 18 integration harness
  - phase: 01-safe-account-entry/01-18
    provides: AuthSession model, rotating refresh credentials, Argon2id login, and access-session binding
  - phase: 01-safe-account-entry/01-19
    provides: Stable authenticated account boundary and generated OpenAPI client pattern
provides:
  - Enumeration-safe throttled password-reset requests with 30-minute hash-only credentials
  - Atomic single-use reset completion with exact shared password policy and global session revoke
  - Generated password-reset request and completion client contracts
affects: [01-23, password-reset-client, session-restoration, security-verification]

tech-stack:
  added: []
  patterns:
    - Password-reset delivery begins only after the credential transaction commits
    - Reset completion conditionally consumes, changes password, and globally revokes in one serializable transaction

key-files:
  created:
    - apps/api/src/modules/auth/dto/request-password-reset.dto.ts
    - apps/api/src/modules/auth/dto/complete-password-reset.dto.ts
  modified:
    - apps/api/src/modules/auth/auth.controller.ts
    - apps/api/src/modules/auth/auth.service.ts
    - apps/api/src/openapi/generate-openapi.ts
    - apps/api/test/auth/password-reset.int.test.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts
    - packages/api-client/src/generated/models.ts

key-decisions:
  - "Issue 32-byte CSPRNG reset credentials for exactly 30 minutes, persist only lowercase SHA-256 hashes, invalidate active predecessors, and start mail delivery only after commit."
  - "Apply the existing exact-input top-3000 policy and Argon2id parameters before one serializable transaction conditionally consumes the token, changes the password hash, and revokes every active user session without issuing a replacement session."

patterns-established:
  - "Generic reset request: canonical lookup and throttling expose one stable 202 response for existing and absent identities while only existing users receive post-commit mail."
  - "Atomic reset completion: invalid terminal credentials return one generic 400; a valid credential owns one transaction spanning consume, password update, and all-device revoke."

requirements-completed: [AUTH-04]

coverage:
  - id: D1
    description: "Password-reset requests return an equivalent throttled response for existing and absent accounts while issuing superseding 30-minute hash-only credentials through post-commit mail."
    requirement: AUTH-04
    verification:
      - kind: integration
        ref: "apps/api/test/auth/password-reset.int.test.ts#request equivalence, throttle, hash-only expiry, and supersession cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "Password-reset completion rejects invalid and common-password inputs, atomically changes the Argon2id hash and revokes all sessions, rolls back on injected failure, and issues no session."
    requirement: AUTH-04
    verification:
      - kind: integration
        ref: "apps/api/test/auth/password-reset.int.test.ts#completion policy, terminal token, rollback, global revoke, and login cases (12 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The generated OpenAPI client exposes typed password-reset request and no-content completion operations without Prisma coupling or drift."
    requirement: AUTH-04
    verification:
      - kind: other
        ref: "pnpm openapi:check"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 22: Atomic Password Reset Summary

**Enumeration-safe reset requests now issue superseding hash-only credentials, while one serializable completion transaction applies the shared Argon2id policy, changes the password, and revokes every existing device session without authenticating the caller.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-01T13:40:33Z
- **Completed:** 2026-08-01T13:48:33Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added generic throttled reset requests that canonicalize identity, invalidate active predecessors, persist only 30-minute SHA-256 token hashes, and deliver secret-bearing links after commit.
- Added single-use completion that enforces the exact shared 12-128 code-point/top-3000 policy, writes a fresh Argon2id hash, and revokes every active session in one serializable transaction.
- Proved terminal token handling, direct injected rollback, old/new password behavior, all-device revoke, no auto-login, strict DTO validation, and deterministic generated OpenAPI operations against PostgreSQL 18.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate password-reset RED matrix** - `0d22b85` (test)
2. **Task 2: Implement atomic reset and global revoke** - `932215b` (feat)

## Files Created/Modified

- `apps/api/src/modules/auth/dto/request-password-reset.dto.ts` - Strict public reset-request and generic accepted response DTOs.
- `apps/api/src/modules/auth/dto/complete-password-reset.dto.ts` - Opaque token and exact-input password completion DTO.
- `apps/api/src/modules/auth/auth.controller.ts` - Throttled request and no-content completion routes with stable operation IDs.
- `apps/api/src/modules/auth/auth.service.ts` - Post-commit credential delivery and serializable consume/hash/revoke behavior.
- `apps/api/test/auth/password-reset.int.test.ts` - Twelve real HTTP and database reset security cases.
- `apps/api/src/openapi/generate-openapi.ts` - Deterministic password-reset model and client generation.
- `packages/api-client/openapi.json` - Canonical request/completion paths and schemas.
- `packages/api-client/src/generated/client.ts` - Typed request and 204-safe completion methods.
- `packages/api-client/src/generated/models.ts` - Generated reset request, response, and completion models.

## Decisions Made

- Kept reset tokens opaque and server-hash-only, with exact 30-minute validity and active-predecessor invalidation before post-commit mail delivery.
- Reused the registration password policy and Argon2id cost parameters verbatim so password rules cannot drift between account creation and recovery.
- Returned no access token, refresh token, cookie, or response body after reset; the user must authenticate normally with the new password.

## TDD Gate Compliance

- **RED:** `0d22b85` discovered all twelve cases against migrated PostgreSQL 18 and failed only with `IMPLEMENTATION_MISSING_RESET_API`.
- **GREEN:** `932215b` makes the route-presence RED sentinel unreachable and passes 12 focused cases, 80 complete API regression tests, both strict typechecks, and the post-commit OpenAPI drift gate.
- **REFACTOR:** No separate refactor commit was required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the approved cached PostgreSQL 18 runtime**

- **Found during:** Task 1 RED verification
- **Issue:** Docker could not resolve the pinned PostgreSQL 18.4 image because the registry returned EOF.
- **Fix:** Pointed only the test process at the existing isolated PostgreSQL 18 container on loopback port 55442; no committed database pin or configuration changed.
- **Files modified:** None
- **Verification:** RED discovery, the focused GREEN matrix, and the complete 80-test API regression all accepted PostgreSQL major 18 and passed.
- **Committed in:** No file change

**2. [Rule 1 - Bug] Corrected reset fixtures to satisfy database chronology constraints**

- **Found during:** Task 2 GREEN verification
- **Issue:** Initial fixtures set verification and expiry timestamps in an order rejected by the existing database CHECK constraints before reaching reset behavior.
- **Fix:** Verified users in a follow-up update and modeled expiration with a valid historical creation/expiry interval.
- **Files modified:** `apps/api/test/auth/password-reset.int.test.ts`
- **Verification:** Focused matrix passes 12/12 and complete API regression passes 80 tests.
- **Committed in:** `932215b`

**3. [Rule 1 - Bug] Corrected canonical progress persistence after SDK update**

- **Found during:** Plan close-out
- **Issue:** `state.update-progress` reported 21/27 summaries and 78% but persisted `percent: 0` in STATE frontmatter.
- **Fix:** Applied the handler's own reported canonical percentage after all SDK-owned state updates completed.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE and ROADMAP both record 21 completed summaries out of 27 plans, with STATE progress at 78%.
- **Committed in:** Plan metadata commit

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking issue).
**Impact on plan:** Both fixes were required for truthful PostgreSQL-backed evidence; production architecture and approved dependency boundaries were unchanged.

## Issues Encountered

- PowerShell 7 was unavailable, so the checked-in RED helper ran equivalently under Windows PowerShell 5.1.
- The OpenAPI drift gate was run after the generated contract commit because it intentionally compares generated output against committed HEAD.

## User Setup Required

None - reset delivery uses the existing mail and `EMAIL_LINK_ORIGIN` configuration boundary.

## Known Stubs

None. The two `IMPLEMENTATION_MISSING_RESET_API` branches are intentional TDD route-presence sentinels and are unreachable with the implemented routes; static scans found no skipped focused suite, placeholder, hardcoded empty rendered data, plaintext token persistence, or goal-blocking mock path.

## Next Phase Readiness

- Client reset screens can consume the generated generic request and no-content completion operations.
- Existing session restoration will observe reset revocation through the durable AuthSession guard/refresh checks.
- No unresolved blocker remains.

## Self-Check: PASSED

- All two created DTOs and seven modified API/test/generated-contract files exist.
- RED commit `0d22b85` precedes GREEN commit `932215b`; both are present on master with no tracked deletion or generated residue.
- Focused reset verification passes 12/12; complete API regression passes 80 tests; API/generated-client strict typechecks pass; `pnpm openapi:check` reports no drift.
- Threat and storage scans confirm both new endpoints are covered by T-14-01/T-14-02, persisted reset credentials are hash-only, and no unplanned trust boundary was introduced.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
