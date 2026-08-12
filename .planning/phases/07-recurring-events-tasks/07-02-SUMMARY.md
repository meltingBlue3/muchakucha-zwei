---
phase: 07-recurring-events-tasks
plan: 02
subsystem: api
tags: [recurrence, calendar-arithmetic, dst, nestjs, prisma, postgresql]
requires:
  - phase: 07-01
    provides: RecurrenceRule persistence, advisory-locked materializer, and daily task tracer
provides:
  - Daily, selected-weekday weekly, monthly, and yearly calendar walking
  - Month-end and leap-year clamping with IANA timezone wall-clock conversion proofs
  - Six-hour rolling recurrence materializer with watermark and row-cap guarantees
affects: [07-03, 07-04, 07-05, recurring-events, recurring-tasks]
tech-stack:
  added: []
  patterns: [pure calendar tuple arithmetic, watermark-driven batch materialization, zero-dependency lifecycle scheduler]
key-files:
  created:
    - apps/api/src/modules/recurrence/recurrence-scheduler.ts
    - apps/api/test/recurrence/materializer.int.test.ts
  modified:
    - apps/api/src/modules/recurrence/recurrence-date.ts
    - apps/api/src/modules/recurrence/recurrence-date.test.ts
    - apps/api/src/modules/recurrence/recurrence-materializer.service.ts
    - apps/api/src/modules/recurrence/recurrence.module.ts
    - apps/api/src/modules/tasks/tasks.service.ts
key-decisions:
  - "Weekly recurrence uses Sunday=0 through Saturday=6, matching the client calendar header."
  - "A recurring task is seeded on its first calendar-valid occurrence when startsOn is not selected."
patterns-established:
  - "Calendar recurrence remains on integer year/month/day tuples until the wall-clock-to-instant boundary."
  - "Background recurrence work is test-gated, unref'ed, lifecycle-cleaned, and logs tick failures."
requirements-completed: [RECR-01]
coverage:
  - id: D1
    description: "Four recurrence frequencies produce bounded, clamped calendar sequences across DST boundaries."
    requirement: RECR-01
    verification:
      - kind: unit
        ref: "apps/api/src/modules/recurrence/recurrence-date.test.ts#recurrence calendar dates"
        status: pass
      - kind: other
        ref: "pnpm --filter api typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "The rolling worker advances due watermarks idempotently, enforces the row cap, and leaves no test timer behind."
    requirement: RECR-01
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/materializer.int.test.ts#rolling recurrence materializer"
        status: pass
      - kind: integration
        ref: "pnpm --filter api test:integration"
        status: pass
    human_judgment: false
duration: 12min
completed: 2026-08-12
status: complete
---

# Phase 7 Plan 2: Full Recurrence Vocabulary and Rolling Worker Summary

**Tuple-based daily, weekly, monthly, and yearly recurrence with month-end clamping, DST-safe instants, and an idempotent six-hour materialization worker**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-12T02:13:00Z
- **Completed:** 2026-08-12T02:25:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added selected-weekday weekly recurrence, interval weeks, monthly anchor restoration, yearly leap-day restoration, inclusive termination, and a 400-instance hard bound.
- Proved New York spring/fall DST behavior and daily date stability across the spring transition while retaining the existing Shanghai conversion.
- Added due-rule scanning, per-rule transactional materialization, watermark advancement, idempotent reruns, and a six-hour lifecycle-managed scheduler.
- Added database integration evidence for selected weekdays, rewound watermarks, repeated no-op runs, hard caps, and February month-end clamping.

## Task Commits

1. **Task 1 RED: recurrence calendar contracts** - `920f25c` (test)
2. **Task 1 GREEN: complete recurrence calendar vocabulary** - `8679261` (feat)
3. **Task 2: rolling materializer and scheduler** - `17e3822` (feat)

## Files Created/Modified

- `apps/api/src/modules/recurrence/recurrence-date.ts` - Four-frequency calendar walking, clamping helpers, weekday helpers, and generation bound.
- `apps/api/src/modules/recurrence/recurrence-date.test.ts` - Weekly, clamping, termination, and real DST behavior contracts.
- `apps/api/src/modules/recurrence/recurrence-materializer.service.ts` - Due-rule scan, by-weekday propagation, and shared hard cap.
- `apps/api/src/modules/recurrence/recurrence-scheduler.ts` - Six-hour test-gated scheduler with unref, cleanup, and failure logging.
- `apps/api/src/modules/recurrence/recurrence.module.ts` - Scheduler provider registration.
- `apps/api/src/modules/tasks/tasks.service.ts` - First-valid-occurrence series seeding.
- `apps/api/test/recurrence/materializer.int.test.ts` - Rolling worker integration coverage.

## Decisions Made

- Weekday numbering is Sunday `0` through Saturday `6`, matching the existing client calendar ordering.
- Monthly and yearly stepping always carries the original anchor day, so a clamped February occurrence never changes the March anchor.
- The scheduler uses Nest lifecycle hooks and native `setInterval`; no new scheduling dependency was introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Seeded weekly series on the first selected occurrence**
- **Found during:** Task 2 integration verification
- **Issue:** The 07-01 creation path always inserted a template occurrence on `startsOn`, leaving an invalid extra task when that weekday was not selected.
- **Fix:** Compute the first calendar-valid occurrence before the creation transaction, reject an empty bounded range, and seed the task on that occurrence.
- **Files modified:** `apps/api/src/modules/tasks/tasks.service.ts`, `apps/api/test/recurrence/materializer.int.test.ts`
- **Verification:** Targeted materializer integration test and the full 207-test integration suite passed.
- **Committed in:** `17e3822`

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** The fix is required for selected-weekday correctness and adds no new architecture or dependency.

## Issues Encountered

- The first targeted materializer run exposed the invalid `startsOn` seed described above; it was fixed and all gates were rerun.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Verification

- `pnpm --filter api test:quick` - 21 passed across 2 files.
- `pnpm --filter api typecheck` - passed with zero errors.
- `pnpm --filter api test:integration -- materializer` - 3 passed.
- `pnpm --filter api test:integration` - 207 passed across 16 files and exited normally.
- Scheduler source contains the `NODE_ENV === 'test'` gate, `unref`, `clearInterval`, and `logger.error`.
- `apps/api/package.json` and `pnpm-lock.yaml` are unchanged.

## Next Phase Readiness

- Plan 07-03 can reuse the complete recurrence walk and rolling worker for event occurrences and recurrence-aware read paths.
- No blockers or external setup remain.

## Self-Check: PASSED

- All seven declared source and test files exist.
- Task commits `920f25c`, `8679261`, and `17e3822` exist in git history.
- No unintended tracked-file deletions or generated untracked files were introduced.
- The user-owned `.planning/quick/` directory remains untouched.

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-12*
