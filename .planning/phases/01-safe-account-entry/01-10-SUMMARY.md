---
phase: 01-safe-account-entry
plan: 10
subsystem: database
tags: [prisma-7, postgresql-18, authentication, transactions, database-constraints]

requires:
  - phase: 01-safe-account-entry/01-03
    provides: Guarded migrated PostgreSQL integration harness and truthful RED tooling
  - phase: 01-safe-account-entry/01-05
    provides: Registration persistence contract path and downstream API behavior inventory
  - phase: 01-safe-account-entry/01-06
    provides: Hash-at-rest and password-policy security evidence
provides:
  - Prisma 7 PostgreSQL adapter and Nest-owned Prisma lifecycle boundary
  - Five-model durable authentication schema with canonical migration history
  - Database-enforced canonical identity, hash-only secret, expiry, state, lineage, and foreign-key invariants
  - Deterministic PostgreSQL 18 integration harness with PrismaPg transaction rollback evidence
affects: [01-11, 01-13, 01-16, 01-18, 01-19, 01-22, 01-24]

tech-stack:
  added: []
  patterns:
    - Prisma 7 client generation uses prisma.config.ts, a custom generated output, and PrismaPg
    - PostgreSQL constraints own identity, time, token-state, and referential invariants
    - Integration setup accepts an already-ready database only after proving PostgreSQL major 18

key-files:
  created:
    - apps/api/prisma.config.ts
    - apps/api/prisma/schema.prisma
    - apps/api/prisma/migrations/0001_auth_foundation/migration.sql
    - apps/api/src/infrastructure/prisma/prisma.module.ts
    - apps/api/src/infrastructure/prisma/prisma.service.ts
  modified:
    - apps/api/test/auth/register.int.test.ts
    - apps/api/test/setup-integration.ts
    - apps/api/package.json
    - pnpm-lock.yaml
    - scripts/assert-red.ps1
    - .gitignore

key-decisions:
  - "Enforce trim plus NFC normalization plus full lowercase as a PostgreSQL CHECK over emailCanonical while retaining the submitted email separately."
  - "Represent every verification, reset, pending-proof, and refresh secret only through unique 64-character lowercase SHA-256 hash columns."
  - "Regenerate the internal Prisma client before API tests and keep generated output untracked while the schema and migration remain canonical source."

patterns-established:
  - "Auth persistence: application transactions use PrismaPg, while PostgreSQL CHECK/UNIQUE/FK constraints remain the final integrity boundary."
  - "Test database readiness: reuse is allowed only for a loopback disposable database that reports PostgreSQL major 18; otherwise Compose owns startup."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-04]

coverage:
  - id: D1
    description: "A canonical Prisma migration creates User, AuthSession, RefreshToken, EmailVerificationToken, and PasswordResetToken with durable database constraints."
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "pnpm --filter api exec prisma migrate deploy && pnpm --filter api exec prisma migrate status"
        status: pass
      - kind: integration
        ref: "pnpm --filter api exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code"
        status: pass
    human_judgment: false
  - id: D2
    description: "Canonical-equivalent emails collide while the submitted delivery email remains byte-for-byte separate and display names remain non-unique."
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "apps/api/test/auth/register.int.test.ts#registration persistence contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "Hash-only secrets, UTC millisecond timestamps, expiry/state checks, real foreign keys, and PrismaPg transaction rollback are executable against PostgreSQL 18."
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "pnpm --filter api test --run test/auth/register.int.test.ts --testNamePattern persistence (7 passed)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 10: Durable Authentication Persistence Summary

**Prisma 7 with PrismaPg now drives a five-model PostgreSQL 18 auth schema whose migration enforces canonical identity, hash-only secrets, UTC time state, foreign keys, and atomic graph writes.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-01T03:49:15Z
- **Completed:** 2026-08-01T04:04:47Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Created the Prisma 7 config, generated-client contract, `PrismaPg` Nest service/module, and canonical five-model authentication migration.
- Enforced canonical email equality in PostgreSQL with trim, NFC normalization, and full lowercase while preserving the submitted delivery/display value and allowing duplicate display names.
- Enforced lowercase 64-character hashes, unique token identities and refresh lineage, bounded expiry/terminal states, `timestamptz(3)`, UUID foreign keys, cascades, and compromised-session consistency.
- Activated seven direct persistence cases and proved the adapter transaction rolls back a partial user/session graph after a database constraint failure.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate persistence invariants in RED** - `546ad7b` (test)
2. **Task 2: Migrate the auth foundation** - `f0c735c` (feat)

## Files Created/Modified

- `apps/api/prisma.config.ts` - Prisma 7 CLI datasource, schema, and migration location.
- `apps/api/prisma/schema.prisma` - Five-model typed auth persistence contract and custom generated-client output.
- `apps/api/prisma/migrations/0001_auth_foundation/migration.sql` - Reviewed PostgreSQL schema plus unsupported CHECK constraints.
- `apps/api/src/infrastructure/prisma/prisma.service.ts` - Required `PrismaPg` adapter and Nest lifecycle management.
- `apps/api/src/infrastructure/prisma/prisma.module.ts` - Global injectable Prisma boundary.
- `apps/api/test/auth/register.int.test.ts` - Truthful RED activation and migrated identity/hash/time/FK/transaction assertions.
- `apps/api/test/setup-integration.ts` - Disposable database startup that verifies PostgreSQL major 18 before reusing a ready service.
- `apps/api/package.json` / `pnpm-lock.yaml` - API ownership of approved Prisma/Nest dependencies and deterministic client generation.
- `scripts/assert-red.ps1` - Backward-compatible plan argument names for exact RED execution.
- `.gitignore` - Generated internal Prisma client exclusion.

## Decisions Made

- Canonicalization is not merely an application convention: PostgreSQL rejects any `email_canonical` value that differs from `lower(normalize(btrim(email), NFC))`.
- Original email storage remains separate from identity comparison, so casing, Unicode composition, and submitted surrounding whitespace can be audited without weakening unique identity.
- Generated Prisma sources are reproducibly rebuilt from the committed schema before tests rather than being treated as hand-owned source.
- The integration harness may bypass Compose only when the configured disposable loopback database is reachable and reports PostgreSQL major 18.

## TDD Gate Compliance

- **RED:** `546ad7b` followed successful discovery and failed only with `IMPLEMENTATION_MISSING_AUTH_SCHEMA`.
- **GREEN:** `f0c735c` added the canonical migration and PrismaPg boundary; the same focused suite passed 7 persistence cases.
- **REFACTOR:** No separate refactor commit was required; strict TypeScript, full API integration sampling, migration status, and schema drift checks pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Accepted the plan's RED command argument names**

- **Found during:** Task 1 (Activate persistence invariants in RED)
- **Issue:** The plan invokes `-Suite api -Marker`, while the existing script exposed only `-MissingBehaviorMarker` and rejected the exact command before discovery.
- **Fix:** Added a validated API suite parameter and `Marker` alias without weakening discovery, infrastructure-error, or exact-marker checks.
- **Files modified:** `scripts/assert-red.ps1`
- **Verification:** The plan-form command reports valid RED only for `IMPLEMENTATION_MISSING_AUTH_SCHEMA`.
- **Committed in:** `546ad7b`

**2. [Rule 3 - Blocking] Made the API workspace own its Prisma runtime boundary**

- **Found during:** Task 2 (Migrate the auth foundation)
- **Issue:** The API manifest did not declare the already-approved Prisma client/adapter or Nest dependency used by the new service, and a fresh generated client was not guaranteed before tests.
- **Fix:** Added exact already-approved dependencies, refreshed lockfile metadata offline, added deterministic client generation, and ignored generated output.
- **Files modified:** `apps/api/package.json`, `pnpm-lock.yaml`, `.gitignore`
- **Verification:** Frozen offline install, Prisma generation, and strict API TypeScript all pass.
- **Committed in:** `f0c735c`

---

**Total deviations:** 2 auto-fixed (2 blocking issues).
**Impact on plan:** Both changes make the planned commands and Prisma 7 runtime reproducible; no dependency identity, schema scope, or authentication behavior was expanded.

## Issues Encountered

- Docker Hub access from Docker Desktop repeatedly failed with TLS/proxy EOF, so the locked Compose images could not be pulled during this run.
- Starting the cached database on planned port 55432 was blocked because Windows dynamically excluded ports 55342-55441 after Docker started. Verification used port 55442 and the locally cached immutable PostgreSQL digest `sha256:9b5bd946f3a507db72c55959700e517463e8d5dbb6f7eb30d920d5bcf6951431`, whose runtime reported PostgreSQL 18.2. The committed Compose contract remains pinned to PostgreSQL 18.4; the migration was applied from empty, reported current, and showed no schema drift on PostgreSQL major 18.

## User Setup Required

None - no external credentials or production database configuration is required.

## Known Stubs

- Six registration HTTP behavior cases remain intentionally suite-skipped for their downstream API owners. Plan 01-10 activates only direct migrated persistence behavior and contains no goal-blocking persistence stub.

## Next Phase Readiness

- Plan 01-11 can bootstrap Nest/Fastify around a validated singleton PrismaPg service.
- Registration, verification, refresh, reset, logout, and profile plans can rely on real migrated models and database-enforced invariants.
- No pending migration, schema drift, plaintext token column, or persistence blocker remains.

## Self-Check: PASSED

- All five created key files and all six modified key files exist.
- RED commit `546ad7b` precedes GREEN commit `f0c735c` in repository history.
- A fresh PostgreSQL 18 database applied `0001_auth_foundation`, reported current status, and matched the Prisma schema.
- Focused persistence tests pass 7/7; the full API integration sample passes 11 tests with only downstream Wave 0 cases skipped.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
