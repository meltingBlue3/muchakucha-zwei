---
phase: 07-recurring-events-tasks
plan: 11
subsystem: api
tags: [recurrence, tasks, events, prisma, openapi, filtering]

# Dependency graph
requires:
  - phase: 07-recurring-events-tasks (07-09)
    provides: currentCalendarDateIn, per-frequency lookahead, monotonic watermark — the recurrence generation machinery this plan's fixtures create rows against
provides:
  - "GET .../tasks and GET .../events both accept an optional recurring=true|false query parameter, mapped to a fixed recurrenceRuleId where clause"
  - "TasksService.list and EventsService.list where accumulators are Prisma.TaskWhereInput / Prisma.EventWhereInput (IN-03's as any assertions removed, 4 sites)"
  - "EventsService.list(actorId, householdId, filters: ListFilters) — object-ified signature matching TasksService.list's shape, single caller (EventsController) updated"
  - "packages/api-client listTasks/listEvents gain an optional recurring?: boolean parameter before signal, generated from generate-openapi.ts's clientSource template"
affects: [07-10 (client-side D-15 chip, if not already landed), any future plan touching tasks.service.ts/events.service.ts list() or generate-openapi.ts's list operations]

# Actuals (#2632)
actuals:
  tokens: 6500
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enum-like query param mapped to a fixed where fragment: filters.recurring is compared only against the literal strings 'true'/'false' and never concatenated into any query — any other value is silently treated as unset (T-07-28 mitigation)."
    - "OpenAPI contract change discipline: every list-operation query param addition edits generate-openapi.ts's clientSource template plus an assertion-block check (parameters array contains the new param name), then regenerates — never hand-edits packages/api-client/src/generated/*."

key-files:
  created:
    - apps/api/test/recurrence/recurring-filter.int.test.ts
  modified:
    - apps/api/src/modules/tasks/tasks.service.ts
    - apps/api/src/modules/tasks/tasks.controller.ts
    - apps/api/src/modules/events/events.service.ts
    - apps/api/src/modules/events/events.controller.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts

key-decisions:
  - "Split the OpenAPI assertion's scope across the two tasks instead of adding the full both-operations check in Task 1: Task 1's assertion checks only listTasks' parameters; Task 2 extends it to also require listEvents' parameters. The plan's literal Task 1 action text describes adding the combined check immediately, but that would make Task 1's own `pnpm openapi:check` verification gate fail (events doesn't have the recurring param yet at that point) — see Deviations."
  - "EventsService.list's Prisma.DateTimeFilter typing for the startTime range object (was Record<string, Date>) — required by the Prisma.EventWhereInput conversion; no behavior change, same gte/lt semantics."

requirements-completed: [RECR-01]

coverage:
  - id: D1
    description: "GET tasks and GET events both accept recurring=true/false/unset with identical three-state semantics; the value is compared only against fixed literals and never concatenated into a query."
    requirement: "RECR-01"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurring-filter.int.test.ts#recurring list filter (D-15) — tasks: ?recurring=true / ?recurring=false / no parameter"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurring-filter.int.test.ts#recurring list filter (D-15) — events: ?recurring=true / ?recurring=false / no parameter"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both list where accumulators are typed as Prisma.TaskWhereInput / Prisma.EventWhereInput; the four as any assertions (2 findMany + 2 count) are gone (IN-03)."
    verification:
      - kind: other
        ref: "grep -c 'as any' apps/api/src/modules/tasks/tasks.service.ts apps/api/src/modules/events/events.service.ts — both 0"
        status: pass
      - kind: other
        ref: "cd apps/api && pnpm typecheck — passes with the typed where"
        status: pass
    human_judgment: false
  - id: D3
    description: "EventsService.list's signature is object-ified to ListFilters, matching TasksService; the startDate/endDate timezone-compensation logic and comments are preserved verbatim and still work when combined with recurring."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurring-filter.int.test.ts#startDate/endDate and recurring=true apply together — date range and recurring filter both take effect"
        status: pass
    human_judgment: false
  - id: D4
    description: "Non-members requesting either list with recurring set still get 404 HOUSEHOLD_NOT_FOUND — the new parameter does not leak household existence."
    requirement: "RECR-01"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurring-filter.int.test.ts#a non-member requesting ?recurring=true gets 404 HOUSEHOLD_NOT_FOUND (tasks and events)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The generated client's new recurring parameters originate from generate-openapi.ts's template, not hand-edited generated files; pnpm openapi:check reports zero drift after generation."
    verification:
      - kind: other
        ref: "pnpm openapi:generate then git diff --stat packages/api-client — only openapi.json and client.ts change, matching the template edits; pnpm openapi:check passes"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-08-13
status: complete
---

# Phase 7 Plan 11: Recurring List Filter + Typed Where Summary

**Added an optional `recurring=true|false` query parameter to both `GET .../tasks` and `GET .../events`, and used the same touch-point to replace both lists' `Record<string, unknown>` + `as any` where accumulators with typed `Prisma.TaskWhereInput` / `Prisma.EventWhereInput` (closing IN-03's four call sites).**

## Performance

- **Duration:** 35 min
- **Tasks:** 2
- **Files modified:** 6 (+1 created)
- **Commits:** 2 task commits

## Accomplishments

- `TasksService.ListFilters` and `EventsService`'s new `ListFilters` interface both gain `recurring?: string`, documented as accepting only the literal strings `'true'`/`'false'`; any other value is silently treated as unset. The mapping (`where.recurrenceRuleId = { not: null }` / `= null`) never concatenates the parameter into a query string (T-07-28 mitigation).
- `tasks.service.ts` and `events.service.ts` both had their list `where` accumulator retyped from `Record<string, unknown>` to `Prisma.TaskWhereInput` / `Prisma.EventWhereInput`, removing all four `as any` assertions (2 `findMany` + 2 `count`) that IN-03 flagged as a risk — adding a field to an untyped accumulator always compiled; it no longer does.
- `EventsService.list(actorId, householdId, startDate?, endDate?)` was refactored to `list(actorId, householdId, filters: ListFilters = {})`, matching `TasksService.list`'s shape. The startDate/endDate UTC-offset compensation logic and its explanatory comments (why `startDate` is pushed back one UTC day and `endDate` pushed forward one) are unchanged — only the parameter source moved from positional args to destructuring off `filters`. The sole caller, `EventsController.list`, was updated to pass an object literal; `HouseholdIdParam`'s pre-existing intersection-type pattern in that controller was left untouched, per the plan's explicit out-of-scope note.
- `TasksController.list` and `EventsController.list` both gained `@ApiQuery({ name: 'recurring', required: false })` and `@Query('recurring') recurring?: string`, following the existing `assigneeId`/`startDate` patterns exactly.
- `generate-openapi.ts`'s `clientSource` template gained `recurring?: boolean` on both `listTasks` and `listEvents` (positioned immediately before `signal`, matching the plan's ordering requirement), with the same conditional query-string append pattern already used for `status`/`priority`/`assigneeId`/`startDate`/`endDate`. A new assertion block entry verifies both list operations' OpenAPI `parameters` array contains a `recurring` entry, throwing `OpenAPI recurring list filter parameters are missing or unstable.` if either is missing.
- `pnpm openapi:generate` + `pnpm openapi:check` confirmed zero drift: only `packages/api-client/openapi.json` and `packages/api-client/src/generated/client.ts` changed, and the diff in `client.ts` is exactly the two new `recurring?: boolean` parameters plus their query-string append lines — nothing was hand-edited.
- New `apps/api/test/recurrence/recurring-filter.int.test.ts` (9 tests): tasks side covers `recurring=true`/`recurring=false`/unset (three-state, with `total` verified unaffected) and a non-member 404; events side covers the same three-state + 404, plus a combined `startDate`/`endDate` + `recurring=true` regression proving the `ListFilters` object refactor didn't drop the date-range branch (with a companion unfiltered-date-range assertion showing both events still return without the recurring filter).

## Task Commits

1. **Task 1: 任务侧 recurring 参数端到端（服务 → 控制器 → OpenAPI → 生成客户端 → 集成断言）** - `190f1e9` (feat)
2. **Task 2: 事件侧 recurring 参数与 list 签名对象化** - `11ee939` (feat)

## Files Created/Modified

- `apps/api/src/modules/tasks/tasks.service.ts` - `ListFilters.recurring`, `Prisma.TaskWhereInput` (removed 2 `as any`), recurring→where mapping
- `apps/api/src/modules/tasks/tasks.controller.ts` - `@ApiQuery`/`@Query` for `recurring`, wired into `filters`
- `apps/api/src/modules/events/events.service.ts` - New `ListFilters` interface, `list()` object-ified, `Prisma.EventWhereInput` (removed 2 `as any`), `Prisma.DateTimeFilter` for the startTime range, recurring→where mapping
- `apps/api/src/modules/events/events.controller.ts` - `@ApiQuery`/`@Query` for `recurring`, `list()` call passes a `ListFilters` object literal
- `apps/api/src/openapi/generate-openapi.ts` - `recurring?: boolean` on `listTasks`/`listEvents` client methods; assertion block entry checking both operations' `parameters`
- `packages/api-client/openapi.json` - Regenerated (recurring parameter on both list operations)
- `packages/api-client/src/generated/client.ts` - Regenerated (recurring parameter on `listTasks`/`listEvents`)
- `apps/api/test/recurrence/recurring-filter.int.test.ts` - New: 9 integration tests (4 tasks-side, 5 events-side)

## Decisions Made

See `key-decisions` in frontmatter. The OpenAPI-assertion split (Task 1 checks only `listTasks`, Task 2 extends it to also require `listEvents`) is the one deviation from the plan's literal wording — necessary so each task's own `<verify>` gate is independently satisfiable; documented in full below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Split the OpenAPI assertion's scope across the two tasks instead of adding the combined check in Task 1**
- **Found during:** Task 1, while implementing action item 5 ("在文件末尾的断言块中...任务与事件的 list 操作的 parameters 中都必须存在 name 为 recurring 的查询参数")
- **Issue:** The plan's literal instruction has Task 1 add an assertion requiring *both* `listTasks` and `listEvents` to expose a `recurring` OpenAPI parameter. But Task 1 only modifies the tasks side — `listEvents` doesn't gain `recurring` until Task 2. `pnpm openapi:check` runs `openapi:generate` internally, so with the combined assertion in place at the end of Task 1, `openapi:generate` would throw before Task 1's own required verification command (`pnpm openapi:check && ... && pnpm test:integration`) could pass, making Task 1 uncommittable under the executor's atomic per-task-commit protocol.
- **Fix:** Task 1's assertion checks only `listTasksParams` for the `recurring` entry. Task 2 extends the same assertion (same variable names, same throw message) to additionally require `listEventsParams`. By the time Task 2's commit lands, the assertion matches the plan's described end state exactly (both operations required) — only the intermediate state during Task 1 differs from the plan's literal phrasing.
- **Files modified:** `apps/api/src/openapi/generate-openapi.ts` (same file in both tasks' `files_modified` list, no scope expansion)
- **Verification:** `pnpm openapi:generate` throws `OpenAPI recurring list filter parameters are missing or unstable.` if either operation is missing the parameter, confirmed by running it before Task 2's changes (fails, as expected, since only tasks had it) and after (passes). `pnpm openapi:check` passes cleanly at both task boundaries.
- **Committed in:** `190f1e9` (Task 1 commit, tasks-only check), `11ee939` (Task 2 commit, extended to events)

---

**Total deviations:** 1 auto-fixed (1 blocking-issue fix, Rule 3)
**Impact on plan:** None on the final state — after Task 2, the assertion is exactly what the plan specifies (both list operations required). Only the intra-plan sequencing of when each half of the check activates was adjusted, and only because the plan's own atomic-commit-per-task execution model required each task to be independently verifiable.

## Issues Encountered

- **Two pre-existing, out-of-scope integration test failures remain** (`test/security/asvs-v5-l1.test.ts` and `test/auth/password-reset.int.test.ts`), same CRLF-corrupted SecLists denylist fixture on this Windows worktree already logged against 07-09 in `.planning/phases/07-recurring-events-tasks/deferred-items.md` — unrelated to any file this plan touches, not fixed (out of scope per the executor's scope-boundary rule).
- Local execution required `pnpm install` and `pnpm prisma:generate` (worktree had no `node_modules`/generated Prisma client) — routine environment bring-up, not a deviation. A local PostgreSQL 17 service on the default port (5432) with `muchakucha_test`/`muchakucha_test_only` credentials was already available and used for `TEST_DATABASE_URL`.
- Full `pnpm test:integration` run: 238 passed, 2 failed (the pre-existing unrelated failures above) — up from the 229-passing baseline recorded in 07-09-SUMMARY.md, consistent with this plan's 9 new tests plus no regressions.

## Next Phase Readiness

- The server-side half of D-15 (recurring-only filter) is complete for both tasks and events. Any client-side chip work (D-15's other half, called out in `07-RESEARCH-ADDENDUM.md` §5 as client-side filtering following the existing priority-chip pattern) is unaffected by and independent of this plan — it was explicitly out of this plan's `files_modified` list.
- `Prisma.TaskWhereInput`/`Prisma.EventWhereInput` are now the established typed-where pattern for both list endpoints; any future filter addition to either list should extend the same typed accumulator rather than reintroducing `Record<string, unknown>` + `as any`.
- Zero Prisma migrations, zero new dependencies, zero breaking API contract changes — the new `recurring` parameter is optional on both endpoints and all existing callers (client, tests) compile and pass unchanged.

## Self-Check: PASSED

- FOUND: `apps/api/test/recurrence/recurring-filter.int.test.ts`
- FOUND: commit `190f1e9`
- FOUND: commit `11ee939`

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-13*
