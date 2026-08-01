---
phase: 01-safe-account-entry
plan: 05
subsystem: testing
tags: [vitest, api-contracts, authentication, refresh-rotation, wave-0]

requires:
  - phase: 01-safe-account-entry/01-03
    provides: Named Vitest integration project, guarded database harness, and discovery-first RED evidence tooling
provides:
  - Seven exact Wave 0 API integration contract paths
  - Sixty-five named account lifecycle, session, and current-user scenarios
  - Pre-schema discovery boundary that does not require Docker for explicitly skipped contracts
affects: [01-10, 01-13, 01-16, 01-18, 01-19, 01-22, 01-24, phase-01-final-gates]

tech-stack:
  added: []
  patterns:
    - Wave 0 API suites are real HTTP-shaped contracts but remain suite-skipped until their owning behavior plan activates RED
    - Missing-behavior markers are introduced only during activation, never in discovery scaffolds

key-files:
  created:
    - apps/api/test/auth/register.int.test.ts
    - apps/api/test/auth/verify-email.int.test.ts
    - apps/api/test/auth/login.int.test.ts
    - apps/api/test/auth/refresh-rotation.int.test.ts
    - apps/api/test/auth/password-reset.int.test.ts
    - apps/api/test/auth/logout.int.test.ts
    - apps/api/test/users/me.int.test.ts
  modified:
    - apps/api/test/setup-integration.ts

key-decisions:
  - "Treat Plan 01-05 as discovery evidence only: the 65 contracts stay explicitly skipped and no behavioral RED is claimed before an owning plan activates its exact marker."
  - "Allow integration contract collection before the Prisma schema exists without starting Docker; once Plan 01-10 creates the schema, the existing Docker, migration, and reset path remains mandatory."

patterns-established:
  - "API contract activation: remove the suite skip in the owning plan, wire migrated fixtures, and add only that owner's IMPLEMENTATION_MISSING_* marker before invoking assert-red."
  - "Discovery proof: vitest list --filesOnly must enumerate all seven exact paths and the complete run must report their skipped files and tests rather than passing assertions."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "Seven exact API behavior suites are discovered with named registration, verification, login, rotation, reset, logout, and users/me contracts."
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "pnpm --filter api exec vitest list test/auth test/users --filesOnly"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 65 Wave 0 cases are reported as explicit skips with no premature missing-behavior marker or unconditional fake pass."
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "pnpm --filter api test --run --passWithNoTests=false"
        status: pass
      - kind: other
        ref: "contract audit for describe.skip plus forbidden IMPLEMENTATION_MISSING/fake-pass patterns"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 05: Wave 0 API Behavior Contracts Summary

**Seven discovered Vitest integration suites now define 65 account-entry and session behaviors without falsely claiming production RED or green behavior.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-01T03:09:00Z
- **Completed:** 2026-08-01T03:19:30Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments

- Created every exact API contract path from the validation inventory and verified Vitest discovers all seven files.
- Named 65 scenarios covering canonical registration and common-password denial, registration-side proof and same/cross-device verification, verified login, refresh rotation/replay/concurrency, atomic password reset/global revoke, current-device logout, and reachable isolated users/me GET/PATCH.
- Kept every suite explicitly skipped with executable HTTP assertions, no unconditional fake pass, and no premature `IMPLEMENTATION_MISSING_*` marker.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create all API behavior contracts** - `582ca28` (test)

## Files Created/Modified

- `apps/api/test/auth/register.int.test.ts` - Canonical identity, password policy, persistence, and pending-proof transport contracts.
- `apps/api/test/auth/verify-email.int.test.ts` - Same/cross-device verification, link-state, resend, and cookie/proof contracts.
- `apps/api/test/auth/login.int.test.ts` - Verified login, generic denial, JWT, cookie, CORS, and throttling contracts.
- `apps/api/test/auth/refresh-rotation.int.test.ts` - Rotation, retained hashes, replay, device isolation, concurrency, expiry, and credential-source contracts.
- `apps/api/test/auth/password-reset.int.test.ts` - Enumeration-safe request, token state, common-password, rollback, global revoke, and no-auto-login contracts.
- `apps/api/test/auth/logout.int.test.ts` - Exact-sid, no-target, idempotent, cookie-clear, and two-device logout contracts.
- `apps/api/test/users/me.int.test.ts` - HTTP reachability, subject isolation, public DTO, duplicate nickname, and mass-assignment contracts.
- `apps/api/test/setup-integration.ts` - Defers Docker/migration setup only while the canonical Prisma schema does not yet exist.

## Decisions Made

- Discovery is the truthful evidence for this Wave 0 plan. Behavioral RED begins only when each downstream owner removes its suite skip, supplies real migrated fixtures, and introduces its exact `IMPLEMENTATION_MISSING_*` marker.
- Pre-schema skipped-suite discovery must remain independent of Docker availability; the schema-present branch still fails closed through Docker, Prisma Migrate, and database reset.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made pre-schema contract discovery independent of Docker**

- **Found during:** Task 1 verification
- **Issue:** Vitest global setup attempted `docker compose up` before checking whether the Prisma schema existed, so even `vitest list` for entirely skipped Wave 0 contracts failed when Docker Desktop was not running.
- **Fix:** Check the schema boundary first and return a no-op teardown only while it is absent; retain the original Docker, migration, reset, and teardown sequence once the schema exists.
- **Files modified:** `apps/api/test/setup-integration.ts`
- **Verification:** Exact seven-file discovery, strict TypeScript, and the full API run all pass without Docker; the full run reports 7 skipped files and 65 skipped tests.
- **Committed in:** `582ca28`

---

**Total deviations:** 1 auto-fixed (1 blocking issue).
**Impact on plan:** The change enables the plan's intended Wave 0 discovery without weakening any schema-present integration database gate.

## Issues Encountered

- Docker Desktop was unavailable on the host. This exposed the ordering bug above; no database-backed behavior was claimed or bypassed because every Plan 01-05 suite is intentionally inactive and the Prisma schema does not yet exist.

## User Setup Required

None - no external service configuration is required for contract discovery.

## Known Stubs

- All seven API suites intentionally use `describe.skip` as their Wave 0 contract state. Plans 01-10, 01-13, 01-16, 01-18, 01-19, 01-22, and 01-24 own activation, real fixtures, exact RED markers, and production behavior.

## Next Phase Readiness

- Plan 01-06 can add the common-password and ASVS audit assets without changing these behavior contracts.
- Each downstream API owner has a stable exact file and named scenario inventory to activate with discovery-first RED evidence.
- The final required-test audit remains intentionally red until all owning plans remove skips and missing-behavior markers after implementation.

## Self-Check: PASSED

- All seven planned contract files and the guarded setup file exist.
- Task commit `582ca28` exists in repository history and contains no deletions.
- Strict TypeScript passes; Vitest `--filesOnly` lists all seven exact paths; the full API run reports 7 skipped files and 65 skipped tests.
- A focused source audit confirms every suite is explicitly skipped and contains neither a premature `IMPLEMENTATION_MISSING_*` marker nor an unconditional fake-pass assertion.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
