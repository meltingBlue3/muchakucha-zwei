---
phase: 07-recurring-events-tasks
fixed_at: 2026-08-12T22:05:00Z
review_path: .planning/phases/07-recurring-events-tasks/07-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-08-12
**Source review:** `.planning/phases/07-recurring-events-tasks/07-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (5 Critical + 8 Warning; the 6 Info findings were out of scope for this pass)
- Fixed: 13
- Skipped: 0

## Verification

**Where the gates ran:** the main checkout (`C:/Users/zhang/Desktop/Projects/FullStack/muchakucha-zwei`), on branch `main`, against the local PostgreSQL 17 test database. An isolated worktree was created first and then removed unused: it has no `node_modules`, so it cannot run `prisma generate`, `openapi:generate`, or any of the phase's gates — and CR-01 (new Prisma columns) and WR-02 (new DTO field + regenerated client) are only verifiable with those. No commits were made in the worktree; it was removed with `git worktree remove --force`, its temp branch deleted, and its recovery sentinel dropped, leaving no orphan state.

Baseline before any edits: API unit 21 passed, recurrence integration 16 passed.

| Gate | Command | Result |
|---|---|---|
| API unit | `pnpm --filter api test:quick` | **PASS** — 24 passed (2 files) |
| API integration (full) | `pnpm --filter api test:integration` | **PASS** — 222 passed (16 files) |
| Client | `cd apps/client && pnpm test` | **PASS** — 200 passed, 2 skipped (21 suites) |
| OpenAPI drift | `pnpm openapi:check` | **PASS** — generated client matches the committed tree |
| API typecheck | `pnpm --filter api typecheck` | **PASS** |
| Client typecheck | `cd apps/client && pnpm typecheck` | **PASS** |

Net new automated coverage: +3 API unit tests, +6 recurrence integration tests, +4 client tests.

The working tree is clean apart from the pre-existing untracked `.planning/quick/`.

## Fixed Issues

### CR-01: Generated occurrences inherit the first instance's mutable state

**Files modified:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260814000000_recurrence_template_fields/migration.sql` (new), `apps/api/src/modules/recurrence/recurrence-materializer.service.ts`, `apps/api/src/modules/recurrence/recurrence.service.ts`, `apps/api/src/modules/events/events.service.ts`, `apps/api/src/modules/tasks/tasks.service.ts`, `apps/api/test/recurrence/recurrence-rules.int.test.ts`
**Commit:** `3385ae5`
**Applied fix:** Took the reviewer's primary option rather than the minimum viable one. `recurrence_rules` gains `template_title` / `template_description` / `template_priority` / `template_location` / `template_all_day` (hand-authored migration with a backfill from each rule's earliest surviving instance, then `SET NOT NULL` on the title plus a priority CHECK constraint). The materializer now reads every generated field from the rule, and generated tasks are unconditionally `status: 'pending'` — no instance state can reach a future occurrence. Both write paths set the template: `EventsService.create`, `TasksService.create`, and the `this_and_following` split in `RecurrenceService`, where the successor's template is resolved before the rule is created so rule and first instance cannot disagree.
**Test:** new integration test `generates later occurrences from the rule template, never from an edited earlier instance` edits the earliest instance (title + `completed` + `urgent`), drops the tail of the series, rewinds the watermark, re-runs the materializer, and asserts the regenerated rows are `Daily original` / `pending` / `medium` while the edit itself survives. This is the test the review noted was missing — the old one at `recurrence-rules.int.test.ts:339-373` never created a row from a mutated template.
**Note:** requires human verification — this is a data-model change with a backfilling migration.

### CR-02: `walkOccurrences` restarts at `startsOn` and truncates at 400

**Files modified:** `apps/api/src/modules/recurrence/recurrence-date.ts`, `apps/api/src/modules/recurrence/recurrence-materializer.service.ts`, `apps/api/test/recurrence/materializer.int.test.ts`
**Commit:** `070025e`
**Applied fix:** `walkOccurrences` takes a `from` bound. Candidates before it are still *enumerated* — so `count` keeps its absolute series index — but are not emitted and do not consume the per-run cap, so the cap now truncates the tail instead of always keeping the oldest 400. The materializer anchors `from` at `materializedThrough + 1`, and a truncated run records the last occurrence it actually wrote instead of the horizon, leaving the remainder due. The `RECURRENCE_MAX_INSTANCES_PER_RUN` loop bounds were replaced with a separate `RECURRENCE_MAX_WALK_STEPS` safety net, since enumeration is now longer than the emitted slice.
**Test:** the contradictory test was replaced. `reaches every occurrence of a count-1000 daily rule across successive runs` ages a `count: 1000` daily rule to 950 days old, asserts the first run writes exactly 400 and records an honest watermark (the 400th occurrence, *not* the horizon), then loops until no rows are created and asserts the series reaches exactly 1000 occurrences ending on `startsOn + 999`.
**Note:** requires human verification — generator control flow.

### CR-03: Association fan-out re-applies template assignees/labels to every instance

**Files modified:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts`, `apps/api/test/recurrence/recurrence-rules.int.test.ts`
**Commit:** `a5e5b94`
**Applied fix:** Used `createManyAndReturn` (PostgreSQL, with `skipDuplicates`) instead of `createMany` + a follow-up `findMany` over the whole series. That yields the exact set of rows this run wrote, so the fan-out targets only those — no `createdAt >= runStartedAt` timestamp heuristic, which would have been vulnerable to app/DB clock skew. The association pass is skipped entirely when the run created nothing.
**Test:** new integration test removes an assignee from one occurrence, forces a run that genuinely creates rows, and asserts the removal is still in place.

### CR-04: Hard-deleting a single occurrence resurrects it

**Files modified:** `apps/api/src/modules/events/events.service.ts`, `apps/api/src/modules/tasks/tasks.service.ts`, `apps/api/test/recurrence/recurrence-rules.int.test.ts`
**Commit:** `0d636ea`
**Applied fix:** Both `delete` methods are recurrence-aware: a row with `recurrenceRuleId !== null` is cancelled (`cancelledAt` for events, `status: 'cancelled'` for tasks) instead of removed, matching D-07 and the `/series?scope=this_only` path. One-time rows still hard-delete.
**Test:** two new integration tests (task and event) delete a mid-series occurrence through the plain endpoint, rewind the watermark so the walk re-enumerates that date, run `materializeRule`, and assert exactly one row still exists for that date and it is still cancelled.

### CR-05: The edit screen always classifies a recurring edit as `rule-change`

**Files modified:** `apps/client/src/features/recurrence/series-scope-mode.ts` (new), `apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx`, `apps/client/app/(protected)/households/[id]/tasks/[taskId]/edit.tsx`, `apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx`
**Commit:** `c2b28d6`
**Applied fix:** The duplicated `recurrenceChanged` in both screens was replaced by a shared `seriesScopeModeFor`, which compares a canonical rule with the occurrence-anchored `startsOn` excluded. It also folds optional-vs-null, the `interval` default and weekday order together, so key order or `undefined`-vs-`null` differences between the response and form shapes cannot masquerade as a rule change either.
**Test:** the review suggested rendering the edit screen, but the client's `testMatch` only collects `src/**/__tests__/**`, so screens under `app/` are not reachable from the suite. The classifier was extracted instead and tested directly in `series-scope-dialog-test.tsx`: a mid-series occurrence with an unchanged rule resolves to `edit`, a weekly rule whose first occurrence trails `startsOn` resolves to `edit`, and genuine freq/interval/count changes plus recurrence removal still resolve to `rule-change`.

### WR-01: `@Param()` validation never runs on the `/series` routes

**Files modified:** `apps/api/src/modules/recurrence/recurrence.controller.ts`, `apps/api/test/recurrence/recurrence-rules.int.test.ts`, `packages/api-client/openapi.json`
**Commit:** `c4cd7e1`
**Applied fix:** Replaced the intersection-typed param DTO with `@Param('householdId', new ParseUUIDPipe({ version: '4' }))` per parameter on all four handlers, and removed the now-dead `HouseholdIdParam` class. As a side effect the regenerated OpenAPI document now declares the path parameters, which the param-DTO form had left as `"parameters": []`; that regeneration is committed with the fix so `openapi:check` stays green.
**Test:** new integration test asserts a malformed `householdId` and a malformed `taskId` each return 400 rather than a driver-level 500.

### WR-02: Label edits silently discarded on the "此后所有" path

**Files modified:** `apps/api/src/modules/recurrence/dto/recurrence.dto.ts`, `apps/api/src/modules/recurrence/recurrence.service.ts`, `apps/api/src/openapi/generate-openapi.ts`, `packages/api-client/openapi.json`, `packages/api-client/src/generated/models.ts`, `apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx`, `apps/client/app/(protected)/households/[id]/tasks/[taskId]/edit.tsx`, `apps/api/test/recurrence/recurrence-rules.int.test.ts`
**Commit:** `2b30ad1`
**Applied fix:** Took the server-side option from the finding — the client-side alternative cannot work, because a split replaces the occurrence row with a new id, so there is nothing for a follow-up `tagEvent`/`tagTask` to target. `UpdateSeriesDto` gains `labelIds`, the split applies it to the successor template (falling back to the pre-edit occurrence's labels when absent), and both edit screens forward the current selection through their projections. Supplied label ids are verified to belong to the same household, so this cannot become a cross-household label attach. The OpenAPI template literal was updated and the client regenerated.
**Test:** new integration test tags an occurrence with two labels, splits with only one retained, and asserts the successor series carries exactly that one; it also asserts an unknown label id is rejected with a 400 on the `labelIds` field.

### WR-03: A post-commit `materializeRule` failure turns a successful create into a 500

**Files modified:** `apps/api/src/modules/events/events.service.ts`, `apps/api/src/modules/tasks/tasks.service.ts`
**Commit:** `3804210`
**Applied fix:** The post-transaction `materializeRule` call in both create paths is wrapped in try/catch and logged via a per-service Nest `Logger`, matching `RecurrenceScheduler`'s existing convention. D-03's immediate generation stays a latency optimisation; the scheduler catches up.

### WR-04: `materializeRule` silently returns 0 when the advisory lock is not acquired

**Files modified:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts`, `apps/api/src/modules/events/events.service.ts`, `apps/api/src/modules/tasks/tasks.service.ts`, `apps/api/test/recurrence/materializer.int.test.ts`, `apps/api/test/recurrence/recurrence-rules.int.test.ts`
**Commit:** `5a95c9e`
**Applied fix:** Adopted both halves of the suggestion. `materializeRule` returns `MaterializationResult { skipped, created }` and logs a warning on the lock skip; `materializeAllDue` keeps its numeric contract by summing `.created`. Both create paths log when the rule was locked at create time, which is the case where a user would otherwise see a series with a single instance and no explanation. Existing test call sites were updated to read `.created`.

### WR-05: Nonexistent local wall times (spring-forward gap) silently shift by one hour

**Files modified:** `apps/api/src/modules/recurrence/recurrence-date.ts`, `apps/api/src/modules/recurrence/recurrence-date.test.ts`
**Commit:** `b81c87c`
**Applied fix:** Policy chosen and documented on `localDateTimeToInstant`: RFC 5545 §3.3.5 — gap times shift forward by the gap, ambiguous times resolve to the first (pre-transition) occurrence. Implemented via a fixed-point test rather than an offset comparison: a valid wall time satisfies `naive - offsetAt(resolved) === resolved`; inside a gap no fixed point exists and the first-pass result is exactly the requested time shifted forward by the gap.
**Test:** `2027-03-14 02:30 America/New_York` now resolves to `07:30Z` and renders as 03:30 EDT (previously `06:30Z` / 01:30 EST), and `2027-11-07 01:30` resolves to `05:30Z` and round-trips — the two cases the finding named.
**Note:** requires human verification — timezone arithmetic.

### WR-06: `offsetMinutesAt` silently falls back to UTC

**Files modified:** `apps/api/src/modules/recurrence/recurrence-date.ts`, `apps/api/src/modules/recurrence/recurrence-date.test.ts`
**Commit:** `5ef11f1`
**Applied fix:** Throwing was preferred per the finding. The zero-offset spellings Intl actually emits (`GMT`, and `UTC` in some ICU builds) are handled explicitly; anything else that fails the `GMT±HH:MM` pattern throws with the zone and the unparsed value. A round-trip test pins the `UTC` path that depends on the explicit branch.

### WR-07: Yearly Feb-29 anchors clamp without a user-facing note

**Files modified:** `apps/client/src/features/recurrence/recurrence-summary.tsx`, `apps/client/src/features/recurrence/__tests__/recurrence-summary-test.tsx`
**Commit:** `84cb859`
**Applied fix:** Added the yearly `month === 2 && day === 29` branch. It uses dedicated copy (`平年没有 2 月 29 日，会自动改到 2 月 28 日。`) rather than reusing the monthly note, whose "有些月份" wording does not describe a yearly rule; the monthly note's copy and condition are byte-identical to what 07-UI-SPEC.md line 226 locks down.
**Test:** new case asserts the note for a `2028-02-29` yearly anchor; the existing "no note for other frequencies" case still passes.

### WR-08: The event edit screen posts a raw `CreateEventDto` to the `UpdateSeriesDto` endpoint

**Files modified:** `apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx`
**Commit:** `43dc6e9`
**Applied fix:** Added an `eventSeriesUpdate(data, labelIds): UpdateSeriesDto` projection mirroring the existing `taskSeriesUpdate`, naming each forwarded field so a future `CreateEventDto` field cannot silently become a runtime 400 under `forbidNonWhitelisted`.

## Notes for the reviewer

- **Incidentally resolved:** IN-01 (the `void newTemplate` dead binding) disappeared as part of the CR-01 restructuring of the same statement. The other five Info findings were left untouched as out of scope.
- **Deliberate deviations from the suggested fixes**, all argued above: CR-03 uses `createManyAndReturn` instead of a `createdAt` timestamp filter; CR-05 tests the extracted classifier because the client suite cannot reach screens under `app/`; WR-02 is server-side because a split replaces the occurrence id; WR-07 uses leap-day-specific copy.
- **Migration:** `20260814000000_recurrence_template_fields` is hand-authored SQL per the phase's convention and was applied by the integration harness (`prisma migrate deploy`) during every run above.

---

_Fixed: 2026-08-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
