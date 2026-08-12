---
phase: 07-recurring-events-tasks
plan: 01
subsystem: api
tags: [nestjs, prisma, postgresql, recurrence, tasks]
requires:
  - phase: 03-calendar
    provides: Event persistence and household calendar boundaries
  - phase: 04-tasks
    provides: Task CRUD and existing task list read path
provides:
  - Shared RecurrenceRule persistence contract with date-only occurrence keys
  - Idempotent 90-day task and event materialization skeleton
  - Daily recurring task creation through the existing task API
affects: [07-02, 07-03, 07-04, 07-05]
tech-stack:
  added: []
  patterns: [transaction-level advisory locks, date-only calendar arithmetic, createMany idempotency]
key-files:
  created:
    - apps/api/prisma/migrations/20260813000000_recurrence_rules/migration.sql
    - apps/api/src/modules/recurrence/recurrence-date.ts
    - apps/api/src/modules/recurrence/dto/recurrence.dto.ts
    - apps/api/src/modules/recurrence/recurrence-materializer.service.ts
    - apps/api/test/recurrence/recurrence-rules.int.test.ts
  modified:
    - apps/api/prisma/schema.prisma
    - apps/api/src/modules/tasks/tasks.service.ts
    - apps/api/src/modules/tasks/dto/create-task.dto.ts
decisions:
  - "Selected option-a: store startTimeLocal and durationMinutes on RecurrenceRule so scheduling data survives occurrence deletion."
metrics:
  duration: 20min
  completed: 2026-08-12
status: complete
---

# Phase 7 Plan 1: Daily Recurring Task Tracer Summary

Daily recurring tasks now create a self-contained rule and materialize real, listable Task rows through a transaction-locked, database-idempotent 90-day generation path.

## Performance

- **Duration:** 20 min
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Added `RecurrenceRule`, date-only occurrence keys, `ON DELETE SET NULL` relations, uniqueness guarantees, and database CHECK constraints.
- Added pure calendar-date walking and IANA-aware wall-clock conversion without using mutable JavaScript date component setters.
- Connected nested recurrence DTO validation to `TasksService.create`, with immediate post-commit materialization and unchanged one-time task behavior.
- Proved rule creation, five generated occurrences, idempotent reruns, 404 household privacy, and API/database mutual-exclusion enforcement.

## Task Commits

1. **Task 1: Decide recurrence time storage** — decision recorded here (`option-a`; no source commit)
2. **Task 2: End-to-end daily recurring task tracer** — `0cc7715`

## Files Created/Modified

- `apps/api/prisma/schema.prisma` — shared recurrence model and Task/Event occurrence relations.
- `apps/api/prisma/migrations/20260813000000_recurrence_rules/migration.sql` — tables, date columns, indexes, foreign keys, and CHECK constraints.
- `apps/api/src/modules/recurrence/recurrence-date.ts` — pure calendar arithmetic and timezone conversion.
- `apps/api/src/modules/recurrence/recurrence-materializer.service.ts` — advisory-locked idempotent Task/Event materialization.
- `apps/api/src/modules/recurrence/dto/recurrence.dto.ts` — bounded recurrence request/response contracts and IANA validation.
- `apps/api/src/modules/tasks/tasks.service.ts` — recurring task creation and recurrence-aware response mapping.
- `apps/api/test/recurrence/recurrence-rules.int.test.ts` — HTTP and database tracer coverage.

## Decisions Made

- Selected `option-a`: `startTimeLocal` and `durationMinutes` live on `RecurrenceRule`. The rule is self-contained, generated event duration remains stable through DST changes, and deleting any occurrence cannot erase schedule metadata.
- Calendar identities use PostgreSQL `date` and `YYYY-MM-DD` API values; timestamps remain reserved for instants such as `dueDate`.
- Materialization obtains a transaction-level advisory lock and relies on `(recurrence_rule_id, occurrence_date)` uniqueness plus `createMany({ skipDuplicates: true })`, not a check-then-insert race.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added database checks for option-a scheduling fields**
- **Found during:** Task 2
- **Issue:** The selected option added wall-clock and duration columns whose DTO bounds could otherwise be bypassed by direct database writes.
- **Fix:** Added format/range CHECK constraints for `start_time_local` and `duration_minutes` alongside the planned recurrence constraints.
- **Files modified:** `apps/api/prisma/migrations/20260813000000_recurrence_rules/migration.sql`
- **Commit:** `0cc7715`

## Verification

- `pnpm --filter api exec prisma generate` — passed
- `pnpm --filter api typecheck` — passed
- `pnpm --filter api test:quick` — 8 passed
- `pnpm --filter api test:integration -- recurrence` — 4 passed
- `pnpm --filter api test:integration` — 204 passed across 15 files
- Schema contains five `@db.Date` fields; no forbidden mutable date setters or `queryRawUnsafe` calls; dependency manifests unchanged.

## Known Stubs

None.

## Self-Check: PASSED

- All declared source, migration, and test files exist.
- Task commit `0cc7715` exists in git history.
- No unintended tracked-file deletions or generated untracked files were introduced.
