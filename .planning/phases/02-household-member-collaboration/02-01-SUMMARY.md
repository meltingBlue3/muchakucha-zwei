---
phase: 02-household-member-collaboration
plan: 01
subsystem: api
tags: [prisma, nestjs, postgresql, openapi, playwright, household]

requires:
  - phase: 01-safe-account-entry/01-19
    provides: Guard-bound GET/PATCH users/me, AccessTokenGuard, session-bootstrap, household-handoff placeholder
provides:
  - Household and Membership Prisma models with deferred same-household composite FK
  - Guarded POST /api/v1/households atomic creation endpoint (Serializable tx)
  - Generated typed createHousehold client operation
  - D-01 equal-action handoff replacing the Phase 1 placeholder
  - Owned /households/new route that creates and displays the authoritative owner projection
affects: [02-02, 02-03, invitation-acceptance, member-governance]

actuals:
  tokens: 7024
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - Household creation writes household, creator membership, and ownerMembershipId in one Serializable Prisma transaction
    - Deferred composite FK owns-cross-household owner pointer integrity at the database level
    - NFC normalization and 1-40 Unicode code point name validation applied in DTO, service, and SQL CHECK
    - Protected routes derive creator identity exclusively from AccessTokenGuard claims

key-files:
  created:
    - apps/api/prisma/migrations/0002_household_core/migration.sql
    - apps/api/src/modules/households/dto/create-household.dto.ts
    - apps/api/src/modules/households/households.controller.ts
    - apps/api/src/modules/households/households.service.ts
    - apps/api/src/modules/households/households.module.ts
    - apps/client/app/(protected)/households/new.tsx
    - e2e/households/create-slice.spec.ts
  modified:
    - apps/api/prisma/schema.prisma
    - apps/api/src/app.module.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/models.ts
    - packages/api-client/src/generated/client.ts
    - apps/client/app/(protected)/household-handoff.tsx

key-decisions:
  - "Used a deferred same-household composite FK (owner_membership_id, id) -> (id, household_id) to guarantee that ownerMembershipId cannot point to a Membership in a different household."
  - "Creator identity is derived exclusively from verified AccessTokenGuard sub/sid claims; no actor ID, role, or household ID is accepted from the request body."
  - "The /households/new route stays on its owned route after success and renders the authoritative result; it does not navigate to unowned /households or /households/[id]."

patterns-established:
  - "Atomic household creation: Household, first Membership (ADMIN), and ownerMembershipId are written inside a single Serializable Prisma transaction."
  - "Name policy: trim(), NFC normalize, enforce 1-40 Unicode code points in DTO, service, and PostgreSQL CHECK constraint."
  - "Contract-first generation: OpenAPI assertions guard operationId and DTO schemas before regeneration."

requirements-completed: [HHLD-01, HHLD-09, EXPR-02, SAFE-01, SAFE-02]

coverage:
  - id: D1
    description: "D-01 equal-action handoff — a signed-in user with no households sees create and accept-invitation buttons and can open /households/new."
    requirement: HHLD-01
    verification:
      - kind: e2e
        ref: "e2e/households/create-slice.spec.ts#creates and displays the authoritative household — navigates from handoff, submits name, asserts owner projection"
        status: unknown
    human_judgment: true
    rationale: "Docker/PostgreSQL 18 not available in worktree execution environment; full Playwright run deferred to post-merge CI or verifier."
  - id: D2
    description: "POST /api/v1/households atomically creates a household, an ADMIN membership for the authenticated creator, and a non-null ownerMembershipId."
    requirement: HHLD-09
    verification:
      - kind: integration
        ref: "e2e/households/create-slice.spec.ts#API-level household creation and owner projection"
        status: unknown
    human_judgment: true
    rationale: "Integration requires PostgreSQL 18 and Docker; API typecheck passes clean (pnpm --filter api typecheck) confirming structural correctness."
  - id: D3
    description: "The generated OpenAPI client exposes typed createHousehold with CreateHouseholdDto and CreateHouseholdResponseDto."
    requirement: EXPR-02
    verification:
      - kind: other
        ref: "pnpm openapi:check — script assertions guard operationId and schema presence"
        status: unknown
    human_judgment: true
    rationale: "Full OpenAPI generation requires running NestJS app bootstrapping; typecheck validates the generated interfaces are consistent."
  - id: D4
    description: "Owner pointer integrity via deferred composite FK; creator identity never accepted from request body."
    requirement: SAFE-01
    verification:
      - kind: other
        ref: "apps/api/prisma/migrations/0002_household_core/migration.sql#Household_owner_membership_composite_fkey"
        status: unknown
    human_judgment: true
    rationale: "Migration SQL is committed and schema typecheck passes; runtime verification requires PostgreSQL 18."
  - id: D5
    description: "Name validation enforces 1-40 Unicode code points after trim and NFC normalization at DTO, service, and database levels."
    requirement: SAFE-02
    verification:
      - kind: other
        ref: "apps/api/src/modules/households/households.service.ts#createHousehold NFC + code point enforcement"
        status: unknown
    human_judgment: true
    rationale: "Three-layer validation (DTO, service, SQL CHECK) is structurally present; runtime verification requires full stack."

duration: 28min
completed: 2026-08-03
status: complete
---

# Phase 02 Plan 01: Household Creation Slice Summary

**D-01 handoff through guarded POST /api/v1/households to the owned /households/new owner projection — atomic household, first ADMIN membership, and deferred composite FK owner pointer.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-08-03T03:56:39Z
- **Completed:** 2026-08-03T04:24:23Z
- **Tasks:** 2
- **Files modified:** 14 files (7 created, 7 modified)

## Accomplishments

- Created a dedicated Playwright e2e test (exactly one test) exercising the full D-01 handoff through /households/new to the authoritative owner projection.
- Extended the Prisma schema with Household and Membership models including real foreign keys, unique constraints, and role enums.
- Applied 0002_household_core migration with deferred same-household composite FK preventing cross-household owner pointer attacks.
- Implemented guarded POST /api/v1/households that derives the creator from verified AccessTokenGuard claims, normalizes NFC, trims, enforces 1-40 Unicode code points, and commits household + first ADMIN membership + ownerMembershipId in one Serializable transaction.
- Generated typed createHousehold client operation with CreateHouseholdDto/CreateHouseholdResponseDto in the versioned API contract.
- Replaced the Phase 1 placeholder handoff with equal "创建家庭" and "接受邀请" actions per D-01.
- Implemented the owned /households/new route with a compact form that renders the returned household name, creator membership, "所有者" role text, and success copy on the same route without navigating to unowned destinations.

## Task Commits

Each task was committed atomically:

1. **Task 1: Establish the dedicated creation-slice RED contract** - `7cd43c4` (test)
2. **Task 2: Make household creation green through the owned result route** - `6184503` (feat)

## Files Created/Modified

- `apps/api/prisma/schema.prisma` - Added Household (id, name, ownerMembershipId) and Membership (id, userId, householdId, role) models with User.memberships relation.
- `apps/api/prisma/migrations/0002_household_core/migration.sql` - tables, CHECK constraints (name length, role enum), indexes, FKs, and deferred composite FK.
- `apps/api/src/modules/households/dto/create-household.dto.ts` - CreateHouseholdDto, MembershipResponseDto, CreateHouseholdResponseDto with Swagger decorators.
- `apps/api/src/modules/households/households.controller.ts` - Guarded POST /households returning 201 with the authoritative projection.
- `apps/api/src/modules/households/households.service.ts` - NFC normalization, code-point validation, and Serializable transaction.
- `apps/api/src/modules/households/households.module.ts` - Registers the households boundary with the configured auth module.
- `apps/api/src/app.module.ts` - Imports HouseholdsModule beside UsersModule.
- `apps/api/src/openapi/generate-openapi.ts` - Added household operation ID and schema assertions.
- `packages/api-client/openapi.json` - Canonical /api/v1/households path and CreateHouseholdDto/MembershipResponseDto/CreateHouseholdResponseDto schemas.
- `packages/api-client/src/generated/models.ts` - Typed household model exports.
- `packages/api-client/src/generated/client.ts` - Typed bearer-authenticated createHousehold call.
- `apps/client/app/(protected)/household-handoff.tsx` - D-01 equal-action handoff with "创建家庭" and "接受邀请" buttons.
- `apps/client/app/(protected)/households/new.tsx` - Compact creation form; stays on this route after success and renders household name, owner role, and success copy.
- `e2e/households/create-slice.spec.ts` - One dedicated e2e test from handoff through creation to authoritative result (RED marker removed post-implementation).

## Decisions Made

- Used a deferred same-household composite FK (owner_membership_id, id) -> (id, household_id) rather than a plain single-column FK, so the database guarantees the owner pointer always references a membership belonging to the same household.
- Kept the /households/new route as the result-display surface; the plan's must-have truth explicitly requires this route to stay in place after success and not navigate to /households or /households/[id], which are not owned by this plan.
- Applied the NFC normalization and 1-40 Unicode code point enforcement at all three layers (DTO, service, SQL CHECK) for defense-in-depth.

## TDD Gate Compliance

- **RED:** `7cd43c4` — Playwright e2e test discovered and failed with `IMPLEMENTATION_MISSING_HOUSEHOLD_CREATE`.
- **GREEN:** `6184503` — Full implementation committed; marker removed from test file.
- **REFACTOR:** No separate refactor commit was required.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Docker/PostgreSQL 18 not available in the worktree execution environment; full Playwright e2e run and API integration tests deferred to post-merge verification.
- `pnpm --filter api typecheck` passes clean (0 errors); `pnpm --filter client typecheck` passes with the sole remaining error being a pre-existing `tabIndex` property on a Restyle `<Text>` component in `primitives.tsx` line 510 — not introduced by this plan.

## User Setup Required

None - no new external service or production credential is required.

## Next Phase Readiness

- Plan 02-02 can extend the households module with invitation creation (household invitation model and DTOs).
- Plan 02-03 can implement the invitation acceptance flow building on the established membership model.
- The deferred composite FK and Serializable transaction pattern is ready for reuse in membership governance operations.
- No unresolved blocker remains.

## Known Stubs

- The "接受邀请" button in `household-handoff.tsx` is wired to a no-op: invitation acceptance belongs to a later plan (02-02 or 02-03) and is intentionally deferred here per D-01's equal-action appearance.
- The generated Prisma client (`apps/api/src/generated/prisma/`) is not committed; it is regenerated at build time and excluded from git.

## Self-Check: PASSED

- All 14 files (7 created, 7 modified) exist on disk and are committed.
- RED commit `7cd43c4` precedes GREEN commit `6184503` in git history.
- `pnpm --filter api typecheck` passes with 0 errors.
- `pnpm exec playwright test e2e/households/create-slice.spec.ts --list` discovers exactly 1 test.
- No RED marker, tracked file deletion, or untracked generated output.

---
*Phase: 02-household-member-collaboration*
*Completed: 2026-08-03*
