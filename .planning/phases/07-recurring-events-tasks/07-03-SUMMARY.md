---
phase: 07-recurring-events-tasks
plan: 03
subsystem: api
tags: [recurrence, events, openapi, nestjs, prisma, authorization]
requires:
  - phase: 07-01
    provides: RecurrenceRule persistence, nested recurrence DTOs, and shared materializer
  - phase: 07-02
    provides: Four-frequency calendar walk and rolling materialization worker
provides:
  - Recurring event creation with timezone-aware, constant-duration materialization
  - Cancelled-event list filtering with deep-link resolution retained
  - Household-level recurrence materialization watermarks on event and task lists
  - Generated client recurrence request and response contracts
affects: [07-04, 07-05, 07-06, 07-07, 07-08, recurring-event-client]
tech-stack:
  added: []
  patterns: [post-commit recurrence materialization, minimum household watermark, generated-contract drift gate]
key-files:
  created: []
  modified:
    - apps/api/src/modules/events/events.service.ts
    - apps/api/src/modules/events/dto/create-event.dto.ts
    - apps/api/src/modules/events/dto/update-event.dto.ts
    - apps/api/src/modules/tasks/tasks.service.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/src/generated/models.ts
    - packages/api-client/openapi.json
    - apps/api/test/recurrence/recurrence-rules.int.test.ts
key-decisions:
  - "Event recurrence derives startTimeLocal from the submitted start instant in the rule timezone and stores durationMinutes from the event interval."
  - "List watermarks use the minimum materializedThrough across every household rule, so any lagging series keeps the household watermark conservative."
requirements-completed: [RECR-01]
metrics:
  duration: 9min
  completed: 2026-08-12
status: complete
---

# Phase 7 Plan 3: Recurring Event API and Client Contract Summary

**Timezone-aware recurring events now materialize as real constant-duration rows, cancelled instances stay deep-linkable while leaving lists, and generated clients receive the complete recurrence contract.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-12T02:28:32Z
- **Completed:** 2026-08-12T02:37:35Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added optional nested recurrence inputs to event create/update DTOs and task update DTOs without changing existing required fields.
- Added transactional recurring-event rule/template creation followed by post-commit materialization through the shared recurrence service.
- Preserved event duration across generated occurrences and restored the submitted wall-clock time in the rule's IANA timezone.
- Filtered cancelled event occurrences from list totals while retaining `getById` responses with `cancelledAt` for deep-link presentation.
- Added conservative household watermarks to event and task lists using the minimum rule watermark.
- Published recurrence request/response types and occurrence metadata through the hand-maintained OpenAPI generator and regenerated tracked client artifacts.
- Added integration coverage for weekly event generation, cancellation asymmetry, watermark behavior, validation bounds, and authorization privacy.

## Task Commits

1. **Task 1: Event recurrence, cancellation read paths, and list watermarks** - `a0f0b26`
2. **Task 2: OpenAPI template and generated client recurrence contracts** - `a5c2ef0`
3. **Task 3: Recurring event and cancellation integration assertions** - `f12d335`

## Files Created/Modified

- `apps/api/src/modules/events/events.service.ts` - recurring event creation, recurrence response mapping, cancellation filtering, and household watermark aggregation.
- `apps/api/src/modules/events/dto/create-event.dto.ts` - nested recurrence input plus occurrence, cancellation, rule, and list-watermark response fields.
- `apps/api/src/modules/events/dto/update-event.dto.ts` - backward-compatible optional recurrence input.
- `apps/api/src/modules/events/events.module.ts` - recurrence materializer dependency wiring.
- `apps/api/src/modules/tasks/dto/update-task.dto.ts` - optional nested recurrence contract for update compatibility.
- `apps/api/src/modules/tasks/tasks.service.ts` - conservative household-level minimum watermark.
- `apps/api/src/openapi/generate-openapi.ts` - canonical recurrence model template source.
- `packages/api-client/src/generated/models.ts` - generated recurrence-aware client types.
- `packages/api-client/openapi.json` - regenerated OpenAPI schema document.
- `apps/api/test/recurrence/recurrence-rules.int.test.ts` - recurring event behavior, validation, and authorization proofs.

## Decisions Made

- Event rule scheduling data is derived from the submitted event interval: the start instant is formatted in the requested IANA timezone and duration is stored in minutes, matching the option-a storage contract from 07-01.
- Household watermarks are not inferred from returned rows. Each list query aggregates the minimum `materializedThrough` across the household's rules, including rules whose occurrences are outside the current filter.
- Cancelled event filtering remains deliberately asymmetric: list/count queries require `cancelledAt: null`, while direct reads keep the existing household ownership checks and return the cancelled row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Generated artifact] Committed the regenerated OpenAPI document**
- **Found during:** Task 2 drift verification
- **Issue:** `pnpm openapi:generate` updates the tracked `packages/api-client/openapi.json` in addition to the two generated TypeScript files named in the task.
- **Fix:** Included the regenerated document in the same atomic task commit so `pnpm openapi:check` compares a clean package tree.
- **Files modified:** `packages/api-client/openapi.json`
- **Verification:** `pnpm openapi:check` printed PASS.
- **Commit:** `a5c2ef0`

---

**Total deviations:** 1 auto-fixed (1 blocking generated artifact).
**Impact on plan:** Required to satisfy the repository's zero-drift contract; no API behavior or dependency scope was added.

## Issues Encountered

- A PowerShell acceptance helper used ripgrep quiet mode inside a boolean expression, which produced no pipeline value despite a successful match. The literal assertions were rerun with normal ripgrep output; all required strings were present. Product tests were unaffected.

## User Setup Required

None - no external services or new dependencies were introduced.

## Known Stubs

None.

## Verification

- `pnpm --filter api typecheck` - passed with zero errors.
- `pnpm --filter client typecheck` - passed with zero errors.
- `pnpm --filter api test:integration -- recurrence` - 11 passed across 2 files.
- `pnpm --filter api test:integration` - 211 passed across 16 files.
- `pnpm openapi:check` - PASS; generated client matches the committed package tree.
- Required literals `HOUSEHOLD_NOT_FOUND`, `VALIDATION_FAILED`, `cancelled_at`, and `Not/AZone` are present in the recurrence integration suite.
- No mutable `setUTCDate`/`setUTCMonth` recurrence arithmetic or dependency-manifest changes were introduced.

## Next Phase Readiness

- Plan 07-04 can build single-occurrence and future-series mutation routes on the recurrence-aware event/task response contracts.
- No blockers or external setup remain.

## Self-Check: PASSED

- All declared source, generated contract, and test files exist.
- Task commits `a0f0b26`, `a5c2ef0`, and `f12d335` exist in git history.
- All plan-level automated gates passed and no generated client drift remains.
- No unintended tracked-file deletions or generated untracked files were introduced.
- The user-owned `.planning/quick/` directory remains untouched.

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-12*
