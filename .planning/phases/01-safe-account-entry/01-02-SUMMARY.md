---
phase: 01-safe-account-entry
plan: 02
subsystem: infrastructure
tags: [pnpm, expo, nestjs, prisma, postgresql, mailpit, playwright]

requires:
  - phase: 01-safe-account-entry/01-01
    provides: Human-approved official dependency pins and Expo 57 compatibility trio
provides:
  - Pinned pnpm workspace with one frozen lockfile and strict shared TypeScript settings
  - Health-checked PostgreSQL 18 and Mailpit test services
  - Explicit validated local origins and Playwright API/Expo Web orchestration
affects: [01-03-api-scaffold, 01-04-client-scaffold, wave-0-testing, local-development]

tech-stack:
  added: [pnpm 10.34.5, TypeScript 5.9.3, Expo 57.0.9, NestJS 11.1.28, Prisma 7.9.1, Playwright 1.62.1, PostgreSQL 18.4, Mailpit 1.30.0]
  patterns:
    - Exact dependency pins with a frozen workspace lockfile
    - Local-only defaults validated as absolute origins before E2E orchestration

key-files:
  created:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - tsconfig.base.json
    - compose.yaml
    - .env.test.example
    - playwright.config.ts
    - .gitignore
  modified: []

key-decisions:
  - "Pin pnpm at 10.34.5 and TypeScript at the project-approved stable 5.x line (5.9.3); TypeScript 7 is outside the locked stack."
  - "Use isolated test ports 55432, 11025, and 18025 so local PostgreSQL/Mailpit do not claim standard host ports."
  - "Keep production origins and SMTP provider credentials out of Phase 1; Playwright validates explicit local http(s) origins only."

patterns-established:
  - "Workspace commands: every root one-shot command delegates to the owning workspace package or the pinned Playwright runner."
  - "Test infrastructure: container services use pinned image versions, named test volumes, UTC, and bounded health checks."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "Approved dependency set installs reproducibly as a pinned pnpm workspace with all required root commands."
    requirement: SAFE-03
    verification:
      - kind: other
        ref: "pnpm --version && pnpm install --frozen-lockfile && pnpm exec tsc --version"
        status: pass
    human_judgment: false
  - id: D2
    description: "PostgreSQL 18, Mailpit, test values, and local origins form a deterministic secret-free runtime contract."
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "docker compose config --quiet && pnpm exec playwright --version"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 02: Pinned Workspace and Local Runtime Summary

**Pinned Expo/NestJS/Prisma workspace with a frozen pnpm lockfile, health-checked PostgreSQL 18 and Mailpit services, and validated Playwright origins for API plus Expo Web.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-08-01T01:54:00Z
- **Completed:** 2026-08-01T02:34:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Installed the complete approved package graph with the authoritative `expo@57.0.9`, `react@19.2.3`, and `react-native@0.86.2` trio and one frozen pnpm lockfile.
- Added strict shared TypeScript settings and all seven required root one-shot commands.
- Defined pinned PostgreSQL 18.4 and Mailpit 1.30.0 services with isolated ports, health checks, UTC data handling, and named test volumes.
- Added a secret-free environment example plus fail-fast absolute-origin validation and Playwright orchestration for the future API and Expo Web workspaces.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install the approved workspace** - `d00680c` (chore)
2. **Task 2: Define deterministic local services and origins** - `14d0647` (chore)

## Files Created/Modified

- `package.json` - Exact package pins, pnpm engine contract, and root one-shot scripts.
- `pnpm-workspace.yaml` - App/package workspace globs and approved native build-script allowlist.
- `pnpm-lock.yaml` - Reproducible dependency graph for the approved stack.
- `tsconfig.base.json` - Strict cross-workspace TypeScript baseline.
- `compose.yaml` - Pinned PostgreSQL and Mailpit test services with health checks.
- `.env.test.example` - Explicit local origins, test database, and SMTP capture values without production secrets.
- `playwright.config.ts` - Origin validation and API/Expo Web server orchestration.
- `.gitignore` - Generated dependencies, environment files, reports, coverage, and builds.

## Decisions Made

- Selected `typescript@5.9.3`, the newest stable release in the locked TypeScript 5.x line, instead of the registry's TypeScript 7 release.
- Used stable immutable service version tags (`postgres:18.4-alpine3.24`, `axllent/mailpit:v1.30.0`) rather than floating major/latest tags.
- Used loopback-only local origin defaults and reserved all production domain/provider choices for the Phase 6 release gates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added generated-output ignore rules**
- **Found during:** Task 1 (Install the approved workspace)
- **Issue:** The first workspace install created an untracked `node_modules/` tree; leaving generated dependencies untracked violates the task commit protocol and risks accidental staging.
- **Fix:** Added a focused `.gitignore` covering dependencies, local environment files, Playwright output, coverage, build output, and Expo state while retaining `*.example` environment contracts.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` contains no generated dependency or runtime output.
- **Committed in:** `d00680c`

---

**Total deviations:** 1 auto-fixed (1 blocking issue).
**Impact on plan:** The ignore rules are required workspace hygiene; approved package scope and runtime behavior are unchanged.

## Issues Encountered

- Corepack could not install shims under protected `C:\Program Files\nodejs`; it was enabled in the existing user WindowsApps PATH instead, after which plain `pnpm --version` resolved to 10.34.5.
- Frozen install reports peer warnings from the explicitly approved pins (`react-dom` versus React 19.2.3, `react-native-worklets`, and Jest 30 versus `jest-watch-typeahead`). No unapproved version was substituted. The owning app scaffold plans should preserve the approved compatibility decision and re-evaluate warnings once dependencies move into their final workspace packages.
- The initial registry download exceeded the short command timeout; rerunning the same approved install completed successfully from the partial cache.

## User Setup Required

None for configuration creation. Docker Desktop must be running when integration services are started; local values are documented in `.env.test.example`.

## Known Stubs

None - Playwright server commands intentionally target the `api` and `client` workspaces created by Plans 01-03 and 01-04, and no placeholder data flows to an application surface.

## Next Phase Readiness

- Plans 01-03 and 01-04 can create `api` and `client` packages under the established workspace globs and inherit the strict TypeScript baseline.
- The frozen install and Compose parse gates pass. Production domains, SMTP provider credentials, and release association files remain Phase 6 gates as planned.

## Self-Check: PASSED

- All eight key files exist at their required paths.
- Task commits `d00680c` and `14d0647` exist in repository history.
- `pnpm install --frozen-lockfile && docker compose config --quiet` passes.
- Required root scripts and authoritative Expo/NestJS/Prisma aligned pins were checked exactly.
- No goal-blocking stubs or untracked generated files remain.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
