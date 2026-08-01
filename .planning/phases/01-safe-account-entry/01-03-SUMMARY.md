---
phase: 01-safe-account-entry
plan: 03
subsystem: testing
tags: [vitest, postgresql, powershell, openapi, red-gate]

requires:
  - phase: 01-safe-account-entry/01-02
    provides: Pinned pnpm workspace, strict TypeScript baseline, and deterministic local PostgreSQL service
provides:
  - One-shot named Vitest unit and integration projects for the API workspace
  - Disposable migrated PostgreSQL reset harness guarded against non-test databases
  - Fail-fast RED evidence, required-test inventory, and OpenAPI drift checks
affects: [01-05-api-contract-tests, 01-11-api-bootstrap, 01-13-registration, phase-01-final-gates]

tech-stack:
  added: []
  patterns:
    - Test discovery must succeed before an expected behavior failure can count as RED evidence
    - Integration suites migrate once and truncate only disposable local test data between runs

key-files:
  created:
    - apps/api/package.json
    - apps/api/tsconfig.json
    - apps/api/vitest.config.ts
    - apps/api/test/setup-integration.ts
    - apps/api/test/reset-database.ts
    - scripts/assert-red.ps1
    - scripts/check-required-tests.ps1
    - scripts/check-openapi-drift.ps1
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "Split API tests into named unit and integration Vitest projects so quick tests never start PostgreSQL and integration tests remain serial and migrated."
  - "Preserve Prisma migration history during database resets while refusing any reset whose host is non-loopback or whose database name lacks a standalone test segment."
  - "Treat only a discovered focused test containing its caller-supplied missing-behavior marker as valid RED evidence; infrastructure failures always fail the gate."

patterns-established:
  - "RED proof: discovery succeeds, focused execution fails, infrastructure diagnostics are absent, and the exact behavior marker is present."
  - "Required-test audit: exact contractual paths are enumerated centrally and any skip/todo/IMPLEMENTATION_MISSING marker fails before suites run."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "API runner discovers named tests in one-shot unit and integration projects with a deterministic migrated database harness."
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "pnpm --filter api exec vitest --version && pnpm --filter api exec tsc -p tsconfig.json --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "RED evidence rejects absent/import-broken tests and accepts only the requested missing-behavior marker; required-test inventory rejects absent or disabled contracts."
    requirement: SAFE-03
    verification:
      - kind: other
        ref: "scripts/assert-red.ps1 -SelfTest && scripts/check-required-tests.ps1 -SelfTest"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 03: API RED Verification Infrastructure Summary

**Named Vitest projects now pair a guarded migrated PostgreSQL harness with fail-fast RED, required-test inventory, and generated OpenAPI drift contracts.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-01T02:38:35Z
- **Completed:** 2026-08-01T02:46:44Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments

- Created the `api` workspace with named, non-watch Vitest unit and integration projects plus strict TypeScript configuration.
- Added a migrated PostgreSQL integration setup that resets application tables deterministically while preserving `_prisma_migrations` and refusing unsafe database targets.
- Added self-testing PowerShell gates for meaningful RED evidence and the exact 23 required test contracts, plus an OpenAPI drift check that propagates generation and Git failures.

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure API integration testing and RED evidence** - `a4d083b` (chore)

## Files Created/Modified

- `apps/api/package.json` - One-shot test, integration, and OpenAPI commands with only approved exact dependencies.
- `apps/api/tsconfig.json` - Strict Node/Vitest TypeScript boundary.
- `apps/api/vitest.config.ts` - Named unit and serial integration projects with no watch or empty-suite success.
- `apps/api/test/setup-integration.ts` - Starts the health-checked PostgreSQL service, deploys Prisma migrations, and brackets integration suites with resets.
- `apps/api/test/reset-database.ts` - Safely truncates application tables on loopback test databases only.
- `scripts/assert-red.ps1` - Discovery-first focused RED proof with exact marker and infrastructure-failure rejection.
- `scripts/check-required-tests.ps1` - Exact validation inventory and forbidden skip/todo/missing-marker audit.
- `scripts/check-openapi-drift.ps1` - Regeneration plus tracked/untracked generated-client drift detection without suppressed errors.
- `pnpm-lock.yaml` - Frozen-lockfile importer for the new API workspace using previously approved package versions.

## Decisions Made

- Unit and integration tests are separate named Vitest projects; only integration tests start PostgreSQL and run migrations.
- Database reset preserves migration history and uses both loopback-host and test-name safety checks before destructive SQL.
- RED evidence is accepted only after discovery and only for the exact caller marker, never merely because Vitest exits nonzero.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added the API workspace importer to the frozen lockfile**

- **Found during:** Task 1 (Configure API integration testing and RED evidence)
- **Issue:** Creating `apps/api/package.json` without a matching lockfile importer made future `pnpm install --frozen-lockfile` runs fail even though all referenced packages were already approved and locked.
- **Fix:** Regenerated only lockfile metadata offline, adding the `apps/api` importer without downloading or substituting packages.
- **Files modified:** `pnpm-lock.yaml`
- **Verification:** `pnpm install --frozen-lockfile` passes and reports the lockfile is current.
- **Committed in:** `a4d083b`

---

**Total deviations:** 1 auto-fixed (1 blocking issue).
**Impact on plan:** The new workspace remains reproducible under the existing approved dependency graph; package identity and versions did not change.

## Issues Encountered

- PowerShell 7 (`pwsh`) is not installed on this Windows host. The exact planned scripts were verified through the compatible Windows PowerShell host using a session-local `pwsh` alias; both scripts avoid PowerShell-7-only syntax and passed. No repository shim or external package was installed.
- The canonical progress updater reported 11% but wrote `percent: 0` into STATE frontmatter; the reported canonical value was applied directly after the handler completed, while its completed-plan count and ROADMAP update were retained.

## User Setup Required

None - integration tests use the existing local Compose contract and require no new secrets.

## Known Stubs

- `apps/api/package.json` currently points `openapi:generate` at `dist/openapi/generate-openapi.js`; the executable generator and generated package arrive with the Nest/Swagger contract work beginning in Plan 01-11. The drift checker itself is complete and deliberately fails until that producer exists.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: local-database-reset | `apps/api/test/reset-database.ts` | Destructive test-only SQL is guarded by loopback-host and database-name checks and preserves migration history. |

## Next Phase Readiness

- Plan 01-04 can configure the client runner independently without mixing API test behavior.
- Later API RED plans can use `scripts/assert-red.ps1` and cannot mistake runner, config, import, or missing-test failures for valid evidence.
- The final required-test audit is intentionally red until Plans 01-05 through 01-09 create all 23 named contracts.

## Self-Check: PASSED

- All eight planned implementation artifacts exist, plus the required frozen-lockfile importer update.
- Task commit `a4d083b` exists in repository history and contains no deletions.
- Vitest version/discovery, RED self-test, required-test self-test, strict TypeScript compile, and frozen install all pass.
- No untracked runtime fixtures remain after self-tests.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
