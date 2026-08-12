---
phase: 07-recurring-events-tasks
plan: 09
subsystem: api
tags: [recurrence, scheduling, timezone, prisma, nestjs, vitest]

# Dependency graph
requires:
  - phase: 07-recurring-events-tasks (07-01..07-08)
    provides: RecurrenceRule model, materializeRule/materializeAllDue generation pipeline, series-scope mutation semantics, recurrence-date.ts calendar arithmetic
provides:
  - "currentCalendarDateIn(timeZone) — pure helper for a timezone's current calendar date, replacing server-UTC-date generation window checks"
  - "Per-frequency lookahead window (RECURRENCE_LOOKAHEAD_DAYS / lookaheadFor) anchored on each rule's own timezone, replacing the fixed 90-day RECURRENCE_HORIZON_DAYS window"
  - "Monotonic materializedThrough watermark (forward-only) so a narrower lookahead can never make a rule's reported coverage regress"
  - "Hourly recurrence tick (RECURRENCE_TICK_MS) matching the 0-day daily lookahead's latency bound"
  - "materializeAllDue excludes rules whose endsOn has already passed (IN-04), and household _min(materializedThrough) aggregation is scoped to still-advancing rules"
  - "Documented D-17 seed-row exception on both create paths (tasks.service.ts, events.service.ts)"
affects: [07-10, 07-11, 07-12, 07-13, 07-14, 07-15, 07-UI-SPEC.md generation-window empty states]

# Actuals (#2632)
actuals:
  tokens: 11284
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-rule timezone-anchored generation window: horizon is recomputed from currentCalendarDateIn(rule.timezone) on every call, so 'has this rule crossed its own local midnight' is emergent from the horizon formula rather than tracked as separate per-rule state."
    - "SQL-side prefilter as a conservative superset (UTC + max lookahead + 1 day) with the exact per-rule decision made inside the transaction — keeps the materialized_through index useful without needing a per-timezone SQL predicate."
    - "Forward-only (monotonic) watermark: max(existing, computed) written unconditionally, so any future window-narrowing change is automatically safe without a data migration."

key-files:
  created:
    - apps/api/test/recurrence/lookahead.int.test.ts
  modified:
    - apps/api/src/modules/recurrence/recurrence-date.ts
    - apps/api/src/modules/recurrence/recurrence-date.test.ts
    - apps/api/src/modules/recurrence/recurrence-materializer.service.ts
    - apps/api/src/modules/recurrence/recurrence-scheduler.ts
    - apps/api/src/modules/tasks/tasks.service.ts
    - apps/api/src/modules/events/events.service.ts
    - apps/api/test/recurrence/materializer.int.test.ts
    - apps/api/test/recurrence/recurrence-rules.int.test.ts

key-decisions:
  - "D-11: replaced the fixed 90-day rolling window with a per-frequency lookahead (daily=0, weekly/monthly/yearly=6), computed in each rule's own timezone via a new currentCalendarDateIn() helper."
  - "D-13: added a monotonic (max-of-existing-and-computed) guard on the materializedThrough write so the window narrowing this plan introduces can never make a legacy rule's reported coverage regress."
  - "D-18 + IN-04: tightened the scheduler tick from 6h to 1h, and excluded ended rules (endsOn in the past) from materializeAllDue's due-rule query — required together, since a faster tick would otherwise re-scan every ended rule every hour."
  - "D-17 (already locked in 07-RESEARCH-ADDENDUM.md): kept the create-time seed instance row as a deliberate, explicitly-commented exception to the lookahead — required because the materializer discriminates task-vs-event rules by which relation has a row, copies assignee/label templates from that row, and the create response contract returns its id for immediate label tagging."
  - "D-12 required zero code changes on the two create paths: since materializeRule now always recomputes today/horizon from the rule's own timezone, the existing post-commit materializeRule() call already IS 'one standard generation check' — no create-specific branch was needed or added."
  - "Household _min(materializedThrough) aggregation (tasks.service.ts, events.service.ts) is now scoped to rules whose endsOn is null or still in the future — otherwise the IN-04 exclusion would let an ended rule's now-frozen-in-the-past watermark permanently under-report the household's real coverage."

patterns-established:
  - "Timezone-local 'today' for scheduling decisions: use currentCalendarDateIn(timeZone) rather than new Date().toISOString().slice(0,10), except in intentional SQL-side UTC-based superset prefilters (which must stay UTC and are commented as such)."

requirements-completed: [RECR-01]

coverage:
  - id: D1
    description: "Generation window is a per-frequency lookahead (daily=0, weekly/monthly/yearly=6 days) anchored on each rule's own IANA timezone, not server UTC — replacing the fixed 90-day rolling window."
    requirement: "RECR-01"
    verification:
      - kind: unit
        ref: "apps/api/src/modules/recurrence/recurrence-date.test.ts#currentCalendarDateIn cases (Kiritimati UTC+14, Midway UTC-11, UTC, New York DST day, invalid timezone throw)"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/lookahead.int.test.ts#a daily rule materializes through its own timezone's current calendar date, not the server UTC date"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/lookahead.int.test.ts#a weekly rule with an occurrence exactly 6 days out includes it — the boundary is inclusive"
        status: pass
    human_judgment: false
  - id: D2
    description: "materializedThrough watermark is forward-only (D-13): a narrower lookahead can never regress a rule's reported coverage, and the generate path never deletes rows."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/lookahead.int.test.ts#a watermark ahead of the new horizon never regresses (D-13)"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/materializer.int.test.ts#advances a rewound watermark without duplicating weekly occurrences"
        status: pass
    human_judgment: false
  - id: D3
    description: "Recurrence tick tightened from 6h to 1h (D-18) and ended rules (endsOn in the past) are excluded from materializeAllDue's due-rule scan (IN-04), so a faster tick does not re-scan dead rules forever."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/lookahead.int.test.ts#a rule whose endsOn has passed is never selected by materializeAllDue (IN-04)"
        status: pass
      - kind: other
        ref: "apps/api/src/modules/recurrence/recurrence-scheduler.ts — RECURRENCE_TICK_MS = 60 * 60 * 1000, grep-verified; NODE_ENV=test early-return path unchanged"
        status: pass
    human_judgment: false
  - id: D4
    description: "Household-level _min(materializedThrough) watermark (task and event list responses) only reflects rules that can still advance, so an ended rule's frozen-in-the-past watermark cannot permanently under-report a household's real generation coverage."
    requirement: "RECR-01"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/lookahead.int.test.ts#the household watermark only reflects rules that can still advance"
        status: pass
    human_judgment: false
  - id: D5
    description: "Create-time behavior: D-12's 'create = one standard generation check' now holds with zero create-path code changes (the post-commit materializeRule call already recomputes the window from scratch), and the D-17 seed-row exception is explicitly documented at both write sites."
    requirement: "RECR-01"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/lookahead.int.test.ts#a daily rule starting today materializes exactly 1 row, dated today — creation is a standard generation check (D-12)"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/lookahead.int.test.ts#a weekly rule created outside its lookahead window keeps only the D-17 seed row, with the watermark trailing behind it"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/lookahead.int.test.ts#the create response contract still exposes a usable task id and recurrence id (D-17)"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-08-13
status: complete
---

# Phase 7 Plan 9: Per-Rule Timezone-Anchored Lookahead Generation Window Summary

**Replaced the fixed 90-day rolling generation window with a per-frequency (daily=0, weekly/monthly/yearly=6 days), per-rule-timezone lookahead — plus the monotonic watermark, hourly tick, and ended-rule exclusion needed to make that narrowing safe.**

## Performance

- **Duration:** 22 min
- **Tasks:** 3
- **Files modified:** 8 (+1 created)
- **Commits:** 3 task commits

## Accomplishments

- `currentCalendarDateIn(timeZone)` pure helper (`recurrence-date.ts`) computes "today" in any IANA timezone via `Intl.DateTimeFormat('en-CA', ...)`, unlocking timezone-correct generation timing without any per-rule "last checked" state — a rule becomes eligible on the first tick after its own local midnight purely because the horizon formula recomputes from scratch every call.
- `RECURRENCE_LOOKAHEAD_DAYS` / `lookaheadFor(freq)` replace the flat `RECURRENCE_HORIZON_DAYS = 90` constant with daily=0, weekly/monthly/yearly=6. `materializeAllDue`'s SQL prefilter stays a conservative UTC-based superset (`max lookahead + 1` day); the exact per-rule decision happens inside `materializeRule`, keeping `RecurrenceRule_materialized_through_idx` useful.
- Per-rule materialization failures no longer abort the whole tick — `materializeAllDue`'s loop wraps each rule in try/catch and logs via `this.logger.error`, so one rule with an unresolvable timezone can't block every other household's generation.
- The `materializedThrough` watermark is now forward-only (monotonic max of existing vs. computed): narrowing the window can never make a rule's reported coverage regress, satisfying D-13's no-retroactive-cleanup guarantee for legacy rules materialized under the old 90-day window.
- `RECURRENCE_TICK_MS` tightened from 6h to 1h (D-18), paired with an ended-rule exclusion in `materializeAllDue`'s due-rule query (IN-04) so the faster tick doesn't re-lock and re-walk rules that can never generate again.
- Household `_min(materializedThrough)` aggregation in both `tasks.service.ts` and `events.service.ts` is now scoped to still-advancing rules (`endsOn` null or in the future) — otherwise an ended rule's now-frozen watermark would permanently under-report a household's real generation coverage once IN-04 excludes it from further ticks.
- Confirmed D-12 needed zero code changes on either create path: the existing post-commit `materializeRule()` call already recomputes `today`/`horizon` from scratch, so it automatically became "one standard generation check" once D-11 landed. Documented the D-17 seed-row exception with an explicit comment at both `tx.task.create` and `tx.event.create` call sites.
- 15 new integration tests in a new `lookahead.int.test.ts` file cover cross-timezone daily generation, the 6-day weekly boundary (inclusive), watermark monotonicity, ended-rule exclusion, household-aggregation scoping, and the D-12/D-17 create-time behavior.

## Task Commits

1. **Task 1: 按规则时区的按频率提前量窗口（端到端一条路径）** - `f000a6f` (feat)
2. **Task 2: 水位线只增不减、1 小时 tick、已结束规则退出扫描与家庭聚合口径** - `53eb0e6` (feat)
3. **Task 3: 创建即一次标准生成检查（零特判）与种子行的刻意例外说明** - `83845e5` (docs)

_Note: Task 3 is `docs` because its only executable-code-adjacent change was comments; the behavioral D-12 requirement was already satisfied by Task 1's changes._

## Files Created/Modified

- `apps/api/src/modules/recurrence/recurrence-date.ts` - Added `currentCalendarDateIn(timeZone, now?)` pure helper
- `apps/api/src/modules/recurrence/recurrence-date.test.ts` - 5 new unit tests for `currentCalendarDateIn` (UTC+14/-11 cross-midnight cases, UTC, DST day, invalid-timezone throw)
- `apps/api/src/modules/recurrence/recurrence-materializer.service.ts` - Removed `RECURRENCE_HORIZON_DAYS`; added `RECURRENCE_LOOKAHEAD_DAYS`/`RECURRENCE_MAX_LOOKAHEAD_DAYS`/`lookaheadFor`; per-rule timezone-anchored horizon; UTC superset prefilter; per-rule try/catch; monotonic watermark write; ended-rule exclusion predicate
- `apps/api/src/modules/recurrence/recurrence-scheduler.ts` - `RECURRENCE_TICK_MS`: 6h → 1h
- `apps/api/src/modules/tasks/tasks.service.ts` - Household watermark aggregation scoped to still-active rules; D-17 seed-row comment
- `apps/api/src/modules/events/events.service.ts` - Same as tasks.service.ts (aggregation scope + D-17 comment)
- `apps/api/test/recurrence/materializer.int.test.ts` - Updated the two horizon-dependent tests to the new per-frequency lookahead semantics
- `apps/api/test/recurrence/recurrence-rules.int.test.ts` - Fixed 10 pre-existing tests broken by the window narrowing (backdated `startsOn` fixtures so count/index-based assertions still hold under the new lookahead — see Deviations)
- `apps/api/test/recurrence/lookahead.int.test.ts` - New file: 15 integration tests for D-11/D-12/D-13/D-18/IN-04

## Decisions Made

See `key-decisions` in frontmatter — all six were the plan's own locked decisions (D-11 through D-18, IN-04) being implemented, not new decisions made during execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 10 pre-existing tests in `recurrence-rules.int.test.ts` broken by the window narrowing**
- **Found during:** Task 1, running the plan's own `<verification>` gate (`pnpm --filter api test:integration` — required to be "全绿")
- **Issue:** `recurrence-rules.int.test.ts` (a pre-existing file from plans 07-01..07-08, not in this plan's `files_modified` list) encodes several fixtures that implicitly depended on the old 90-day window: a `count: 5` daily tracer expecting 5 immediate rows, a `count: 6` weekly event series with a hardcoded `startsOn: '2026-08-18'` and a matching hardcoded list query range, several open-ended daily series indexing into `ordered[3]`/`OFFSET 10` (needing ≥4/≥11 rows to exist immediately), and a `createDailySeries` test helper with a fixed future `startsOn` producing only 1 row (the seed) under the new daily lookahead=0. All 10 tests failed once Task 1's per-frequency lookahead landed. Downstream plans 07-12/07-13 explicitly assume this file is green ("既有的 `/series` 用例零回归"), confirming it is this plan's responsibility to keep it passing.
- **Fix:** Backdated each affected `startsOn` (and the weekly event's list-query date range) so the walk from `startsOn` to `today + lookahead` naturally produces the row count each test's index-based assertions require, using `currentCalendarDateIn`/`addDays`/`formatIsoDate` from `recurrence-date.ts` instead of hardcoded calendar dates. No assertion's protective intent (D-04/D-07/D-08 semantics) was weakened — only the fixture dates that drove row counts changed.
- **Files modified:** `apps/api/test/recurrence/recurrence-rules.int.test.ts`
- **Verification:** `pnpm --filter api test:integration` — all 3 recurrence test files green (31 tests) after Task 3; full suite green except 2 pre-existing unrelated failures (see below).
- **Committed in:** `f000a6f` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — pre-existing test fixtures broken by an intentional, plan-mandated behavior change)
**Impact on plan:** Necessary to satisfy the plan's own "test:integration 全绿" verification criterion and to keep the downstream 07-12/07-13 plans' zero-regression assumption true. No scope creep beyond adjusting fixture dates.

## Issues Encountered

- **Two pre-existing, out-of-scope integration test failures remain** (`test/security/asvs-v5-l1.test.ts` and `test/auth/password-reset.int.test.ts`), both traced to a CRLF-corrupted SecLists denylist fixture on this Windows worktree — unrelated to any file this plan touches. Logged to `.planning/phases/07-recurring-events-tasks/deferred-items.md` per the executor's scope-boundary rule rather than fixed.
- Local execution required `pnpm install` and `pnpm prisma:generate` (worktree had no `node_modules`/generated Prisma client) and confirmed a local PostgreSQL 17 service (not the documented Docker Compose stack, which wasn't running) was already listening on the default test port/credentials — both routine environment bring-up, not deviations from the plan's own scope.

## Next Phase Readiness

- `currentCalendarDateIn`, `RECURRENCE_LOOKAHEAD_DAYS`/`lookaheadFor`, and the monotonic-watermark/ended-rule-exclusion machinery are now available for 07-10 (client-side D-15 filter), 07-11 (API-side D-15 filter + OpenAPI), and 07-12/07-13 (D-14/D-16 rule-scoped endpoints and management screens) to build on.
- **07-UI-SPEC.md D-19 follow-up is still outstanding**: the plan's context notes that `07-UI-SPEC.md` lines 320 and 364 byte-lock "90 天" copy for the `beyondGenerationWindow` empty state, which this plan's window narrowing makes stale. This plan's `files_modified` list did not include `07-UI-SPEC.md` or any client files, so that text/logic update is deferred to whichever of 07-10 through 07-15 owns the client-side generation-window empty state (07-10 is the most likely owner, given its D-15 client-filter scope touches the same screens).
- Zero Prisma migrations, zero new dependencies, zero external API contract changes — confirmed via `git status` (no new `apps/api/prisma/migrations/` directory) and `grep -rn "RECURRENCE_HORIZON_DAYS" apps packages e2e` (no hits).

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-13*
