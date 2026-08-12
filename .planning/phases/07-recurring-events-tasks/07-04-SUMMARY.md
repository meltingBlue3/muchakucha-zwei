---
phase: 07-recurring-events-tasks
plan: 04
subsystem: api
tags: [recurrence, series-split, transactions, authorization, openapi, prisma]
requires:
  - phase: 07-01
    provides: RecurrenceRule persistence, constraints, and occurrence identity
  - phase: 07-02
    provides: Idempotent recurrence materializer and calendar walking
  - phase: 07-03
    provides: Recurring event/task API contracts and generated recurrence models
provides:
  - Single-occurrence cancellation semantics for recurring events and tasks
  - Atomic this-and-following series splitting with immutable history
  - Household-scoped event and task series mutation routes
  - Generated typed client methods for all four series operations
affects: [07-05, 07-06, 07-07, 07-08, recurring-series-client]
tech-stack:
  added: []
  patterns: [occurrence-derived rule resolution, interactive transaction split, post-commit materialization]
key-files:
  created:
    - apps/api/src/modules/recurrence/recurrence.service.ts
    - apps/api/src/modules/recurrence/recurrence.controller.ts
  modified:
    - apps/api/src/modules/recurrence/dto/recurrence.dto.ts
    - apps/api/src/modules/recurrence/recurrence.module.ts
    - apps/api/src/modules/tasks/dto/create-task.dto.ts
    - apps/api/src/modules/tasks/tasks.service.ts
    - apps/api/src/openapi/generate-openapi.ts
    - apps/api/test/recurrence/recurrence-rules.int.test.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts
    - packages/api-client/src/generated/models.ts
key-decisions:
  - "Series mutations resolve rule ownership from the stored occurrence and return 404 for cross-household identifiers before applying role authorization."
  - "A count-based source rule becomes date-bounded at a split, clearing count atomically to preserve the database endsOn/count XOR constraint."
  - "Successor materialization runs only after the split transaction commits, so failed successor creation leaves the old rule and future rows unchanged."
patterns-established:
  - "Series split transactions end the old rule, create the successor, replace future instances, and preserve all earlier occurrence rows as one atomic unit."
requirements-completed: [RECR-02]
coverage:
  - id: D1
    description: "This-only edits affect one stored occurrence, while deletion records cancellation that later materialization cannot regenerate."
    requirement: RECR-02
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules.int.test.ts#series scope operations"
        status: pass
      - kind: integration
        ref: "pnpm --filter api test:integration"
        status: pass
    human_judgment: false
  - id: D2
    description: "This-and-following changes atomically split a rule, retain byte-for-byte historical rows, roll back on failure, and enforce household authorization privacy."
    requirement: RECR-02
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules.int.test.ts#series scope operations"
        status: pass
      - kind: other
        ref: "pnpm --filter api typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "Generated clients expose typed update/delete methods for event and task series without OpenAPI drift."
    requirement: RECR-02
    verification:
      - kind: other
        ref: "pnpm --filter @muchakucha/api-client typecheck"
        status: pass
      - kind: other
        ref: "pnpm --filter api openapi:check"
        status: pass
    human_judgment: false
metrics:
  duration: 17min
  completed: 2026-08-12
status: complete
---

# Phase 7 Plan 4: Series Scope Mutation Semantics Summary

**Household-authorized recurring event and task mutations now support durable single-occurrence cancellation and atomic future-series splitting with immutable history and generated client methods.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-08-12T02:42:40Z
- **Completed:** 2026-08-12T02:59:53Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added `cancelled` to the canonical task status vocabulary and removed the duplicate service-local status list.
- Added occurrence-derived recurrence rule resolution with household privacy and role enforcement shared by event and task series operations.
- Implemented this-only cancellation as `Task.status = cancelled` or `Event.cancelledAt`, preserving the occurrence row so materialization cannot recreate it.
- Implemented event and task `/series` routes for this-only and this-and-following update/delete scopes.
- Made future-series splitting atomic across old-rule termination, successor creation, future-row replacement, and association copying, with materialization deferred until commit.
- Added integration proofs for isolated edits, durable cancellation, history preservation, rollback, non-series rejection, cross-household privacy, and member authorization.
- Published the four series mutation methods and their request/response types in the generated API client.

## Task Commits

1. **Task 1: Single-occurrence semantics and canonical cancelled status** - `208b2df`
2. **Task 2: Atomic event/task series split routes** - `0c14faf`
3. **Task 3: Integration proofs and generated client contract** - `75714cc`

## Files Created/Modified

- `apps/api/src/modules/recurrence/recurrence.service.ts` - occurrence resolution, cancellation, atomic split/delete semantics, and post-commit materialization.
- `apps/api/src/modules/recurrence/recurrence.controller.ts` - authenticated event and task `/series` PUT/DELETE routes.
- `apps/api/src/modules/recurrence/dto/recurrence.dto.ts` - series scope, mutation request, query, and response DTOs.
- `apps/api/src/modules/recurrence/recurrence.module.ts` - controller and service wiring.
- `apps/api/src/modules/tasks/dto/create-task.dto.ts` - canonical `cancelled` task status.
- `apps/api/src/modules/tasks/tasks.service.ts` - reuse of the canonical task status vocabulary.
- `apps/api/src/openapi/generate-openapi.ts` - stable series operation guards and generated client templates.
- `apps/api/test/recurrence/recurrence-rules.int.test.ts` - single-occurrence, split, rollback, privacy, and authorization integration tests.
- `packages/api-client/openapi.json` - regenerated series route and schema document.
- `packages/api-client/src/generated/client.ts` - four typed series mutation methods.
- `packages/api-client/src/generated/models.ts` - `SeriesScope`, `UpdateSeriesDto`, and mutation response models.

## Decisions Made

- The server never trusts a client-supplied rule identity. It resolves the rule through the stored occurrence, verifies the path household, then applies role authorization; cross-household identifiers therefore remain indistinguishable from missing data.
- A this-and-following split preserves every occurrence before the split date, deletes only the old rule's split-date-and-later rows, and constructs the successor from server-owned rule metadata plus validated mutation fields.
- Count-based source rules must clear `count` when the split gives them an `endsOn`; the successor inherits the remaining occurrence count when one remains.
- Successor materialization is intentionally post-commit. Transaction failure produces no partial old-rule cutoff, successor rule, or future-row deletion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved the recurrence termination XOR constraint during count-based splits**
- **Found during:** Task 3 integration verification
- **Issue:** Shortening a count-based source rule by setting `endsOn` while retaining its existing `count` violated the database check constraint and returned 500.
- **Fix:** Clear the old rule's `count` in the same interactive transaction whenever `endsOn` is assigned during update or delete splitting.
- **Files modified:** `apps/api/src/modules/recurrence/recurrence.service.ts`
- **Verification:** The rollback test passes and the complete 216-test API integration suite is green.
- **Commit:** `75714cc`

**2. [Rule 3 - Generated artifact] Committed the regenerated OpenAPI document**
- **Found during:** Task 3 OpenAPI generation
- **Issue:** The generator updates tracked `packages/api-client/openapi.json` alongside the generated TypeScript files named by the task.
- **Fix:** Included the document in the atomic task commit so the zero-drift check has a committed baseline.
- **Files modified:** `packages/api-client/openapi.json`
- **Verification:** `pnpm --filter api openapi:check` printed PASS.
- **Commit:** `75714cc`

---

**Total deviations:** 2 auto-fixed (1 correctness bug, 1 blocking generated artifact).
**Impact on plan:** Both changes were required for correct atomic behavior and the repository's generated-contract invariant; no new dependencies or architectural scope were added.

## Issues Encountered

- PostgreSQL `date` values returned by the raw driver were initially converted through the local Asia/Shanghai timezone in one assertion. The test now selects date-only columns as text, matching the API's calendar-date semantics without timezone distortion.

## User Setup Required

None - no external services, migrations, or new dependencies were introduced.

## Known Stubs

None.

## Verification

- `pnpm --filter api typecheck` - passed with zero errors.
- `pnpm --filter @muchakucha/api-client typecheck` - passed with zero errors.
- `pnpm --filter api test:integration -- test/recurrence/recurrence-rules.int.test.ts` - 13 passed.
- `pnpm --filter api test:integration` - 216 passed across 16 files.
- `pnpm --filter api openapi:check` - PASS; generated client matches the committed package tree.
- The service contains three interactive transaction call sites, all four stable series operation IDs, and the `not_a_series_occurrence` rejection path.
- No dependency manifest changes, unintended tracked-file deletions, or generated untracked files were introduced.

## Next Phase Readiness

- Client plans can now present this-only versus this-and-following choices through typed methods for both recurring events and tasks.
- No blockers or external setup remain.

## Self-Check: PASSED

- All declared source, route, generated contract, and integration test files exist.
- Task commits `208b2df`, `0c14faf`, and `75714cc` exist in git history.
- All plan-level automated gates passed and no generated client drift remains.
- The user-owned `.planning/quick/` directory remains untouched.

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-12*
