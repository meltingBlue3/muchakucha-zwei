---
phase: 07-recurring-events-tasks
reviewed: 2026-08-12T00:00:00Z
depth: deep
files_reviewed: 50
files_reviewed_list:
  - apps/api/prisma/migrations/20260813000000_recurrence_rules/migration.sql
  - apps/api/prisma/schema.prisma
  - apps/api/src/app.module.ts
  - apps/api/src/modules/events/dto/create-event.dto.ts
  - apps/api/src/modules/events/dto/update-event.dto.ts
  - apps/api/src/modules/events/events.module.ts
  - apps/api/src/modules/events/events.service.ts
  - apps/api/src/modules/recurrence/dto/recurrence.dto.ts
  - apps/api/src/modules/recurrence/recurrence-date.test.ts
  - apps/api/src/modules/recurrence/recurrence-date.ts
  - apps/api/src/modules/recurrence/recurrence-materializer.service.ts
  - apps/api/src/modules/recurrence/recurrence-scheduler.ts
  - apps/api/src/modules/recurrence/recurrence.controller.ts
  - apps/api/src/modules/recurrence/recurrence.module.ts
  - apps/api/src/modules/recurrence/recurrence.service.ts
  - apps/api/src/modules/tasks/dto/create-task.dto.ts
  - apps/api/src/modules/tasks/dto/update-task.dto.ts
  - apps/api/src/modules/tasks/tasks.module.ts
  - apps/api/src/modules/tasks/tasks.service.ts
  - apps/api/src/openapi/generate-openapi.ts
  - apps/api/test/recurrence/materializer.int.test.ts
  - apps/api/test/recurrence/recurrence-rules.int.test.ts
  - apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx
  - apps/client/app/(protected)/households/[id]/events/[eventId]/index.tsx
  - apps/client/app/(protected)/households/[id]/events/index.tsx
  - apps/client/app/(protected)/households/[id]/tasks/[taskId]/edit.tsx
  - apps/client/app/(protected)/households/[id]/tasks/[taskId]/index.tsx
  - apps/client/app/(protected)/households/[id]/tasks/index.tsx
  - apps/client/app/(protected)/households/[id]/today.tsx
  - apps/client/src/features/events/event-card.tsx
  - apps/client/src/features/events/event-form.tsx
  - apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx
  - apps/client/src/features/recurrence/__tests__/recurrence-summary-test.tsx
  - apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx
  - apps/client/src/features/recurrence/recurrence-badge.tsx
  - apps/client/src/features/recurrence/recurrence-picker.tsx
  - apps/client/src/features/recurrence/recurrence-summary.tsx
  - apps/client/src/features/recurrence/series-scope-sheet.tsx
  - apps/client/src/features/tasks/__tests__/task-status-test.tsx
  - apps/client/src/features/tasks/task-card.tsx
  - apps/client/src/features/tasks/task-form.tsx
  - apps/client/src/ui/date-field.tsx
  - e2e/events/accessibility.spec.ts
  - e2e/events/calendar-api.spec.ts
  - e2e/events/recurrence.spec.ts
  - e2e/tasks/tasks-api.spec.ts
  - packages/api-client/openapi.json
  - packages/api-client/src/generated/client.ts
  - packages/api-client/src/generated/models.ts
  - scripts/check-required-tests.ps1
findings:
  critical: 5
  warning: 8
  info: 6
  total: 19
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-08-12
**Depth:** deep
**Files Reviewed:** 50
**Status:** issues_found

## Summary

Deep cross-file review of the recurring events/tasks implementation, tracing DTO → controller → service → materializer/scheduler on the server and form → picker → API client → server on the client.

**What the code genuinely gets right** (verified against the actual diff, not the summaries):

- **Item 1 (advisory lock):** `pg_try_advisory_xact_lock` is used, is transaction-scoped, and sits inside a Prisma *interactive* `$transaction` callback (`recurrence-materializer.service.ts:57-60`) — correct for a pooled `@prisma/adapter-pg` setup. Idempotency is genuinely backed by the `Task_rule_occurrence_key` / `Event_rule_occurrence_key` unique indexes plus `skipDuplicates`, not by a comment.
- **Item 3 (first `$queryRaw`):** parameterized tagged template. No string concatenation. No injection.
- **Item 4 (`endsOn` XOR `count`):** enforced at all three layers — DTO/service (`events.service.ts:122`, `tasks.service.ts:139`, `recurrence.service.ts:119`) and DB `recurrence_rules_ends_on_count_ck`. The int test at `recurrence-rules.int.test.ts:164-178` exercises both the API and the raw DB constraint.
- **Item 5 (`cancelled` six-site fan-out):** all six sites are actually touched — `TASK_STATUSES` (create-task.dto.ts:7), service reuse of that constant, `task-form.tsx:177` dedicated cancelled chip + restore affordance, `today.tsx:42` completion filter, `today.tsx:57-62` status cycle returning `null`, and `Event.cancelledAt` column + `events.service.ts:238` list filter.
- **Item 6 (atomic split):** interactive `$transaction` callback (`recurrence.service.ts:102`), and `recurrence-rules.int.test.ts:431-464` proves rollback by triggering the mutual-exclusion failure *after* the `endsOn` write and asserting the old rule and future rows are byte-identical.
- **Item 7 (IDOR):** every `/series` route scopes by path `householdId`; `resolveRuleForOccurrence` re-verifies both `occurrence.householdId` and `rule.householdId` (`recurrence.service.ts:49-63`). No `recurrenceRuleId` is ever accepted from a request body.
- **Item 8 (`@db.Date`):** `occurrenceDate`, `startsOn`, `endsOn`, `materializedThrough` are all `@db.Date` in `schema.prisma` and `DATE` in the migration.
- **Item 9 (month-end clamping):** `addMonths` clamps from the *original* anchor, so Jan 31 → Feb 28 → Mar 31 (anchor restored, month never skipped). Tests assert the actual dates, including leap/non-leap and the yearly Feb-29 anchor.
- **Item 10 (DST):** real `Intl` `longOffset` two-pass resolution. No `setUTCDate` offset arithmetic anywhere in the conversion path.
- **Item 11 (OpenAPI):** I ran `scripts/check-openapi-drift.mjs` end to end — it regenerates from the template-literal source and passed: *"PASS: generated OpenAPI client matches the committed 'packages/api-client' tree."* `git status packages/` is clean. No drift.
- **Item 12 (scheduler):** guarded by `NODE_ENV === 'test'`, `unref()`d, and cleared in `onModuleDestroy`. No dangling handle.
- **Item 13 (SeriesScopeSheet):** genuinely zero writes before a scope is picked (`handleSubmit` only sets `pendingSeriesAction`), and a failed split keeps the sheet mounted with an explicit `Banner` error and re-enabled actions.

**What is broken.** Five blockers, all in the materialize/edit loop rather than in the schema or the crypto-adjacent parts. Three of them (CR-01, CR-02, CR-03) share a root cause: the materializer treats *"the earliest surviving instance row"* as a mutable series template and re-walks the entire history from `startsOn` on every run. That is safe on the create path (which is what every existing test exercises — the materializer is only ever re-run in tests when the horizon already covers all occurrences, so `created === 0`) and unsafe on every subsequent scheduler tick. CR-02 in particular is enshrined by `materializer.int.test.ts:160-173`, which asserts a `count: 1000` rule produces `<= 400` rows and treats permanent under-generation as the correct behavior.

## Critical Issues

### CR-01: Generated occurrences inherit the first instance's mutable state, so single-occurrence edits leak forward and completed/cancelled state silently suppresses future tasks

**File:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts:66-73, 106-119, 136-153`

**Issue:** The "template" is re-derived on every run as `findFirst({ where: { recurrenceRuleId }, orderBy: { occurrenceDate: 'asc' } })` — i.e. the earliest surviving instance, a row the user is explicitly allowed to edit independently (D-02, D-07). Every materialization run then copies that row's `status`, `title`, `description`, `priority`, `location`, and `allDay` into the newly created rows.

Failure scenario (D-04, the core "倒垃圾" semantic): create a daily recurring task with no end. Mark the **first** occurrence 已完成. Six hours later the scheduler tick runs; `horizon` has advanced by a day, so one new occurrence is inserted — with `status: 'completed'` copied from the template (line 111). `partitionTodayTasks` (`today.tsx:42`) drops `completed`/`cancelled`, so the task silently never appears again. `status: 'cancelled'` behaves identically, and is directly reachable via the `/series?scope=this_only` cancel path when the cancelled occurrence happens to be the earliest one.

Second failure: edit the first occurrence's title "仅此一次". Every occurrence generated from that point on carries the new title, which is exactly the propagation D-07 forbids. `recurrence-rules.int.test.ts:339-373` looks like it covers this but edits `series.tasks[1]`, never `tasks[0]`, and re-runs the materializer when the horizon is already saturated (`created === 0`) — so no new row is ever produced from a mutated template.

**Fix:** Do not derive the template from a mutable instance row. Persist the series-level fields on `RecurrenceRule` at creation time and read them back:

```ts
// materializeTaskOccurrences — never copy per-instance mutable state
data: occurrences.map((occurrence) => ({
  householdId: rule.householdId,
  title: rule.templateTitle,          // new columns on recurrence_rules
  description: rule.templateDescription,
  status: 'pending',                  // NEVER template.status
  priority: rule.templatePriority,
  dueDate: localDateTimeToInstant(occurrence, time.hour, time.minute, rule.timezone),
  createdBy: rule.createdBy,
  recurrenceRuleId: rule.id,
  occurrenceDate: databaseDate(occurrence),
})),
```

If adding columns is too large a change, the minimum viable fix is `status: 'pending'` (unconditionally) plus selecting the template by `occurrenceDate === rule.startsOn` and refusing to let per-instance edits reach it.

### CR-02: `walkOccurrences` always restarts at `startsOn` and truncates at 400, so long-lived rules permanently stop generating while `materializedThrough` still claims full coverage

**File:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts:78-94`; `apps/api/src/modules/recurrence/recurrence-date.ts:109`

**Issue:** The walk has no lower bound — it always enumerates from `rule.startsOn` forward and `appendOccurrence` stops the instant `occurrences.length` reaches `RECURRENCE_MAX_INSTANCES_PER_RUN` (400). The 400 kept are therefore always the **oldest** 400, not the ones near the horizon.

Failure scenario: a daily rule with no end date. `horizon = today + 90`, so the candidate span is `startsOn .. startsOn + (age + 90)`. At age 309 that is exactly 400 candidates. At age **310** the walk yields only `startsOn .. startsOn+399` while the horizon is `startsOn+400` — the newest day is dropped. Every subsequent day drops one more. `created` is 0 because all 400 already exist, and lines 91-94 then unconditionally write `materializedThrough = databaseDate(horizon)` regardless. From roughly day 310 the series never extends again, and `EventsService.list` / `TasksService.list` keep reporting a `materializedThrough` watermark (`events.service.ts:279`, `tasks.service.ts:251`) that is false.

The same mechanism caps every `count` rule at 400: a `count: 1000` daily rule can never produce more than 400 rows, ever, even though the DTO `@Max(1000)` and the `recurrence_rules_count_range_ck` constraint both advertise 1000. `materializer.int.test.ts:160-173` asserts `dates.length <= RECURRENCE_MAX_INSTANCES_PER_RUN` and labels this "capped at the per-run hard limit", locking the defect in as expected behavior.

**Fix:** Anchor the walk at the watermark and make the watermark honest when the cap bites:

```ts
const walkStart = rule.materializedThrough === null
  ? calendarDate(rule.startsOn)
  : addDays(calendarDate(rule.materializedThrough), 1);

// walkOccurrences must accept a `from` bound and an `emittedBefore` count so
// `count` still terminates the series at the right absolute occurrence index.
const occurrences = walkOccurrences(
  { ...ruleShape, startsOn: calendarDate(rule.startsOn) },
  { horizon, from: walkStart, alreadyEmitted: priorOccurrenceCount },
);

const truncated = occurrences.length === RECURRENCE_MAX_INSTANCES_PER_RUN;
await tx.recurrenceRule.update({
  where: { id: ruleId },
  // Never claim coverage past what was actually written.
  data: { materializedThrough: databaseDate(
    truncated ? occurrences[occurrences.length - 1]! : horizon,
  ) },
});
```

and update `materializer.int.test.ts:160-173` to assert the rule *eventually* reaches 1000 occurrences across runs rather than asserting it is permanently capped.

### CR-03: Association fan-out re-applies the template's assignees and labels to every existing instance on every run, silently reverting per-instance edits

**File:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts:120-124, 154-161, 165-182`

**Issue:** After `createMany`, the code collects instance ids with `findMany({ where: { recurrenceRuleId: rule.id } })` — **all** instances of the series, not the ones just created — and then `materializeTaskAssociations` / the `eventLabel.createMany` block writes the template's assignee and label rows against every one of them.

Failure scenario: a weekly chore assigned to 妈妈. The user opens next Tuesday's instance and removes 妈妈 (`TasksService.update` deletes the `TaskAssignee` row at `tasks.service.ts:360-362`). On the next 6-hour tick, `materializeTaskAssociations` re-inserts `{ taskId: <next Tuesday>, userId: <妈妈> }` via `createMany({ skipDuplicates: true })` — the deletion is undone with no user action and no audit trail. Identical behavior for `TaskLabel` and `EventLabel`. This violates D-02's guarantee that each instance is independently assignable.

**Fix:** Restrict the id set to rows created in this run:

```ts
const createdIds = (await tx.task.findMany({
  where: {
    recurrenceRuleId: rule.id,
    occurrenceDate: { in: occurrences.map(databaseDate) },
    createdAt: { gte: runStartedAt },   // captured before createMany
  },
  select: { id: true },
})).map(({ id }) => id);
await this.materializeTaskAssociations(tx, template.id, createdIds);
```

Skip the association pass entirely when `result.count === 0`.

### CR-04: Hard-deleting a single recurring occurrence resurrects it on the next materialization tick

**File:** `apps/api/src/modules/events/events.service.ts:363`; `apps/api/src/modules/tasks/tasks.service.ts:403`

**Issue:** `DELETE /households/:householdId/events/:eventId` (and the task equivalent) calls `prisma.event.delete()` unconditionally, including when `recurrenceRuleId !== null`. Because `walkOccurrences` re-enumerates that occurrence date on every run and `createMany({ skipDuplicates: true })` only skips rows that still exist, the deleted occurrence is re-inserted on the next tick.

This is precisely why D-07 specifies `status = 'cancelled'` / `cancelledAt` for single-occurrence removal — the generator's dedupe key is the row itself, so a missing row reads as "not yet generated". The client happens to route recurring deletes through `/series?scope=this_only`, which masks the bug in the UI, but the plain delete endpoint is authenticated, in the OpenAPI contract, and reachable by any member who created the task.

**Fix:** Make delete recurrence-aware in both services:

```ts
if (event.recurrenceRuleId !== null) {
  await this.prisma.event.update({
    where: { id: eventId },
    data: { cancelledAt: new Date() },
  });
  return;
}
await this.prisma.event.delete({ where: { id: eventId } });
```

(For tasks: `data: { status: 'cancelled' }`.) Add an int test that hard-deletes a mid-series occurrence, runs `materializeRule`, and asserts the occurrence does not come back.

### CR-05: The edit screen always classifies a recurring edit as `rule-change`, disabling "仅此一次" and making per-occurrence edits impossible

**File:** `apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx:24-31`; `apps/client/app/(protected)/households/[id]/tasks/[taskId]/edit.tsx:35-42`; `apps/client/src/features/recurrence/recurrence-picker.tsx:170-177`; `apps/client/src/features/recurrence/series-scope-sheet.tsx:63`

**Issue:** `recurrenceChanged` JSON-compares `recurrenceInputFromResponse(event.recurrence)` against the form's recurrence value. The left side's `startsOn` is the **rule's** start date. The right side's `startsOn` has been overwritten by `RecurrencePicker`'s effect:

```ts
// recurrence-picker.tsx:170-177
if (value === null || value.startsOn === startDate) return;
const next = { ...value, startsOn: startDate };   // startDate = THIS occurrence's date
onChange(next);
```

so for every occurrence after the series start the two `startsOn` values differ and `recurrenceChanged` returns `true` unconditionally. That sets `mode: 'rule-change'`, and `SeriesScopeSheet` computes `thisOnlyDisabled = busy || mode === 'rule-change'` (line 63). The user editing only the title of the 5th occurrence is shown "更改重复规则？ / 重复规则的改动只能应用到这一次和之后。" with 仅此一次 greyed out.

It also misfires on the *first* occurrence whenever weekly `byWeekday` pushes the first real occurrence past `startsOn` — e.g. `startsOn: 2026-08-12` (Wed) with `byWeekday: [2,4]` materializes 2026-08-13, so `startDate !== rule.startsOn` there too. In practice "仅此一次" is unreachable for essentially every recurring edit, which defeats D-07's entire single-instance edit path.

**Fix:** Exclude the occurrence-anchored `startsOn` from the comparison in both edit screens:

```ts
function recurrenceChanged(
  current: EventResponseDto['recurrence'],
  next: RecurrenceDto | undefined,
): boolean {
  const strip = (rule: RecurrenceDto | null) =>
    rule === null ? null : { ...rule, startsOn: undefined };
  return JSON.stringify(strip(recurrenceInputFromResponse(current)))
    !== JSON.stringify(strip(next ?? null));
}
```

Add a test to `series-scope-dialog-test.tsx` that renders the edit screen against a mid-series occurrence with an unchanged rule and asserts `mode === 'edit'`.

## Warnings

### WR-01: `@Param()` validation never runs on the `/series` routes — `@IsUUID('4')` is dead and a malformed id yields a 500

**File:** `apps/api/src/modules/recurrence/recurrence.controller.ts:16-19, 33, 47, 68, 82`

**Issue:** The parameter is typed `HouseholdIdParam & { eventId: string }`. TypeScript emits `Object` for an intersection type — verified in the compiled output at `apps/api/dist/modules/recurrence/recurrence.controller.js:46`: `__metadata("design:paramtypes", [Object, Object, UpdateSeriesDto])`. Nest's `ValidationPipe.toValidate()` exempts `Object`, so the class is never instantiated and `@IsUUID('4')` never executes — despite `whitelist`/`forbidNonWhitelisted` being enabled globally (`main.ts:220-226`).

A non-UUID `householdId` therefore reaches `prisma.membership.findUnique` in `resolveActorRole`, which throws `PrismaClientKnownRequestError` P2023. There is no Prisma exception filter in `apps/api/src` (only `StableHttpExceptionFilter`, which handles `HttpException`), so the response is a 500 carrying driver detail instead of a 400/404. The `@Query() query: DeleteSeriesQueryDto` on the same handlers *is* validated correctly — only the path params are affected.

This pattern is inherited from `events.controller.ts:75,85,97`, so it is not newly invented, but the new controller reproduces it on both `/series` routes.

**Fix:** Use per-parameter pipes, which do not depend on emitted metadata:

```ts
@Param('householdId', new ParseUUIDPipe({ version: '4' })) householdId: string,
@Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
```

### WR-02: Label edits are silently discarded on the "此后所有" path

**File:** `apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx:157-162`; `apps/client/app/(protected)/households/[id]/tasks/[taskId]/edit.tsx:214-223`

**Issue:** The `this_only` branch syncs labels via `tagEvent`/`tagTask` with `selectedLabelIds`; the `this_and_following` branch calls only `updateEventSeries`/`updateTaskSeries`. Neither `UpdateSeriesDto` nor `RecurrenceService.updateSeriesFromOccurrence` accepts label ids — the server copies `template.labels` from the pre-edit row (`recurrence.service.ts:185, 209`). A user who removes a label, picks 此后所有, and sees the success `router.back()` gets the old labels back on every occurrence.

**Fix:** Either add `labelIds` to `UpdateSeriesDto` and apply it in the split, or issue the `tagEvent`/`tagTask` call for the new series template after the split returns (the response already carries `recurrenceRuleId`, so the new template id can be resolved).

### WR-03: A post-commit `materializeRule` failure turns a successful create into a 500

**File:** `apps/api/src/modules/events/events.service.ts:204`; `apps/api/src/modules/tasks/tasks.service.ts:206`

**Issue:** The rule and its first instance are committed inside `$transaction`, and only then is `await this.materializer.materializeRule(created.ruleId)` called, unguarded. Any transient failure there (lock contention path aside — see WR-04 — a statement timeout, a pool exhaustion) propagates out of `create` as a 500 while the series is already durably persisted. The client maps that to `'重复规则没有保存成功。请检查网络后重试。'` (`event-form.tsx:128`), telling the user nothing was saved when in fact a rule plus one occurrence were. A retry then creates a duplicate series.

**Fix:** The immediate-generation requirement in D-03 is a latency optimization, not a correctness invariant — the scheduler catches up. Wrap and log:

```ts
try {
  await this.materializer.materializeRule(created.ruleId);
} catch (error) {
  this.logger.error(`immediate materialization failed for rule ${created.ruleId}`, error);
}
```

### WR-04: `materializeRule` silently returns 0 when the advisory lock is not acquired

**File:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts:61`

**Issue:** `if (lock[0]?.locked !== true) return 0;` is indistinguishable from "nothing to generate". On the create path (`events.service.ts:204`, `tasks.service.ts:206`) that means a user who loses the race against a concurrent scheduler tick sees a series with exactly one instance and no error, until the next tick. It also makes the return value of `materializeAllDue` unreliable as an operational signal.

**Fix:** Log at debug/warn on the skip, and consider returning a discriminated result (`{ skipped: true }` vs `{ created: n }`) so callers can distinguish contention from a genuine no-op.

### WR-05: Nonexistent local wall times (spring-forward gap) silently shift by one hour, and are untested

**File:** `apps/api/src/modules/recurrence/recurrence-date.ts:189-193`; `apps/api/src/modules/recurrence/recurrence-date.test.ts:190-209`

**Issue:** The two-pass offset resolution has no handling for the DST gap. For `America/New_York`, `2027-03-14 02:30` does not exist (clocks jump 02:00 EST → 03:00 EDT). `localDateTimeToInstant` computes `naive = 02:30Z`, resolves the first offset as EST (−300), probes `07:30Z` which is EDT (−240), and returns `06:30Z`. But DST does not begin until `07:00Z`, so `06:30Z` renders as **01:30 EST** — an hour earlier than the requested wall time, silently, for one occurrence per year on any series whose `startTimeLocal` falls in the gap.

The DST tests are real and correct but only probe `09:30` and `00:00` across the boundary — never a gap time, and never an ambiguous fall-back time.

**Fix:** Pick and document a policy (RFC 5545 shifts gap times forward by the gap length) and implement it explicitly by detecting `offsetMinutesAt(first) !== offsetMinutesAt(naive)` combined with a round-trip check, then add `expectLocalRoundTrip`-style assertions for `2027-03-14 02:30` and `2027-11-07 01:30` in `recurrence-date.test.ts`.

### WR-06: `offsetMinutesAt` silently falls back to UTC when the offset string does not match

**File:** `apps/api/src/modules/recurrence/recurrence-date.ts:183-186`

**Issue:** `if (match === null) return 0;` treats an unparsed `timeZoneName` as UTC. It is coincidentally correct for the one real case that reaches it today (`Intl` emits the bare string `"GMT"` for UTC, which the `GMT±HH:MM` regex rejects), which is exactly what makes the bug invisible. Any ICU output change, or a zone rendering a sub-minute historical offset, would silently reinterpret every occurrence in that timezone as UTC — a multi-hour data error with no log line.

**Fix:** Handle the `"GMT"` case explicitly and throw otherwise:

```ts
if (zone === 'GMT') return 0;
const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zone ?? '');
if (match === null) throw new Error(`unresolvable UTC offset for time zone ${timeZone}`);
```

### WR-07: Yearly Feb-29 anchors clamp without any user-facing note

**File:** `apps/client/src/features/recurrence/recurrence-summary.tsx:59`

**Issue:** `clampNote` fires only for `rule.freq === 'monthly' && day >= 29`. A yearly rule anchored on 02-29 genuinely clamps to 02-28 in non-leap years — `recurrence-date.test.ts:153-166` asserts exactly that (`2028-02-29 → 2029-02-28 → … → 2032-02-29`) — but the summary shows a bare `每年 2 月 29 日重复` with no warning. D-09 requires clamping be explicit rather than silent, and the UI is the only place the user learns about it.

**Fix:**

```ts
clampNote:
  (rule.freq === 'monthly' && day >= 29) ||
  (rule.freq === 'yearly' && month === 2 && day === 29)
    ? CLAMP_NOTE : null,
```

### WR-08: The event edit screen posts a raw `CreateEventDto` to the `UpdateSeriesDto` endpoint

**File:** `apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx:161`

**Issue:** `updateEventSeries(token, id, eventId, pendingSeriesAction.data)` passes a `CreateEventDto` straight through. It works today only because every `CreateEventDto` field happens to also exist on `UpdateSeriesDto` — and because the two types are structurally assignable, TypeScript reports nothing. Since the global pipe sets `forbidNonWhitelisted: true` (`main.ts:221`), the first field added to `CreateEventDto` turns every "此后所有" event edit into a runtime 400 with no compile-time signal. The task screen already does this correctly via the explicit `taskSeriesUpdate` projection (`tasks/[taskId]/edit.tsx:47-63`).

**Fix:** Mirror `taskSeriesUpdate` with an `eventSeriesUpdate(data: CreateEventDto): UpdateSeriesDto` projection that names each forwarded field.

## Info

### IN-01: Dead binding in the split path

**File:** `apps/api/src/modules/recurrence/recurrence.service.ts:173-188`
**Issue:** `const newTemplate = await tx.task.create({...}); void newTemplate;` — the result is bound and immediately discarded via a `void` statement. The event branch (line 197) correctly does not bind at all.
**Fix:** Drop the binding and the `void` line.

### IN-02: Misgrouped numeric separators in the lock namespace

**File:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts:16`
**Issue:** `RECURRENCE_LOCK_NAMESPACE = 1_907_070_1` evaluates to `19070701`, but the separators are grouped so as to read like a different number at a glance. It is a magic constant that appears in exactly one `$queryRaw`.
**Fix:** `export const RECURRENCE_LOCK_NAMESPACE = 19_070_701;` with a comment noting it is an arbitrary namespace for `pg_advisory_xact_lock(int, int)`.

### IN-03: `where as any` casts discard Prisma type checking on the changed list queries

**File:** `apps/api/src/modules/events/events.service.ts:265, 269`; `apps/api/src/modules/tasks/tasks.service.ts:237, 241`
**Issue:** `where` is built as `Record<string, unknown>` and cast with `as any` at the call site. These are exactly the queries this phase changed (adding `cancelledAt: null` and the watermark aggregate), so the cast removes type checking precisely where it would have been most useful.
**Fix:** Type the accumulator as `Prisma.EventWhereInput` / `Prisma.TaskWhereInput` and drop the casts.

### IN-04: `materializeAllDue` re-selects every rule that ever existed, forever

**File:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts:40-49`
**Issue:** `materializedThrough` is set to `today + 90`, so the next day's horizon is always strictly greater and the `lt: horizon` predicate matches again. Rules whose `endsOn` passed years ago are re-locked, re-walked from `startsOn`, and re-queried on every tick.
**Fix:** Add `OR: [{ endsOn: null }, { endsOn: { gte: databaseDate(today) } }]` to the `where`, and skip rules whose `count` is already satisfied.

### IN-05: `updateCount` writes `NaN` into the recurrence value

**File:** `apps/client/src/features/recurrence/recurrence-picker.tsx:311-317`
**Issue:** `next.count = Number(text)` produces `NaN` for non-numeric input and `0` for empty input. `NaN` serializes to `null` in the request body. Submission is currently blocked by `recurrenceValid`, so this is latent rather than live, but the form state is malformed in the meantime and any future caller that bypasses the validity gate ships it.
**Fix:** Only assign when `Number.isInteger(parsed)`; otherwise clear `count` and let the existing `COUNT_ERROR` render.

### IN-06: The form's server-error branch is unreachable from the edit screens

**File:** `apps/client/src/features/events/event-form.tsx:121-130`
**Issue:** `handleSubmit` wraps `await onSubmit(data)` in a try/catch that feeds `recurrenceErrorsFromApi`, but the edit screens' `handleSubmit` catches its own errors and never re-throws (`events/[eventId]/edit.tsx:99-104`), and the recurring path returns early without awaiting anything. Server-side recurrence field errors therefore never populate `recurrenceErrors` on the edit screen — only on create.
**Fix:** Have the edit screens re-throw after setting their own error state, or lift recurrence field-error mapping into the screens where the API call actually happens.

---

_Reviewed: 2026-08-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
