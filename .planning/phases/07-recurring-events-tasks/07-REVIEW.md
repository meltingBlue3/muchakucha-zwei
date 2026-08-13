---
phase: 07-recurring-events-tasks
reviewed: 2026-08-13T00:00:00Z
depth: standard
files_reviewed: 60
files_reviewed_list:
  - apps/api/prisma/migrations/20260813000000_recurrence_rules/migration.sql
  - apps/api/prisma/schema.prisma
  - apps/api/src/modules/events/dto/create-event.dto.ts
  - apps/api/src/modules/events/dto/update-event.dto.ts
  - apps/api/src/modules/events/events.controller.ts
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
  - apps/api/src/modules/tasks/tasks.controller.ts
  - apps/api/src/modules/tasks/tasks.service.ts
  - apps/api/src/openapi/generate-openapi.ts
  - apps/api/test/recurrence/lookahead.int.test.ts
  - apps/api/test/recurrence/materializer.int.test.ts
  - apps/api/test/recurrence/recurrence-rules-api.int.test.ts
  - apps/api/test/recurrence/recurrence-rules.int.test.ts
  - apps/api/test/recurrence/recurring-filter.int.test.ts
  - apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx
  - apps/client/app/(protected)/households/[id]/events/[eventId]/index.tsx
  - apps/client/app/(protected)/households/[id]/events/index.tsx
  - apps/client/app/(protected)/households/[id]/index.tsx
  - apps/client/app/(protected)/households/[id]/recurrence-rules/[ruleId]/index.tsx
  - apps/client/app/(protected)/households/[id]/recurrence-rules/index.tsx
  - apps/client/app/(protected)/households/[id]/tasks/[taskId]/edit.tsx
  - apps/client/app/(protected)/households/[id]/tasks/[taskId]/index.tsx
  - apps/client/app/(protected)/households/[id]/tasks/index.tsx
  - apps/client/app/(protected)/households/[id]/today.tsx
  - apps/client/jest.config.js
  - apps/client/src/features/events/event-card.tsx
  - apps/client/src/features/events/event-form.tsx
  - apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx
  - apps/client/src/features/recurrence/__tests__/recurrence-rule-row-test.tsx
  - apps/client/src/features/recurrence/__tests__/recurrence-summary-test.tsx
  - apps/client/src/features/recurrence/__tests__/recurring-filter-test.tsx
  - apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx
  - apps/client/src/features/recurrence/recurrence-badge.tsx
  - apps/client/src/features/recurrence/recurrence-kind-badge.tsx
  - apps/client/src/features/recurrence/recurrence-picker.tsx
  - apps/client/src/features/recurrence/recurrence-rule-row.tsx
  - apps/client/src/features/recurrence/recurrence-summary.tsx
  - apps/client/src/features/recurrence/recurring-filter.ts
  - apps/client/src/features/recurrence/series-scope-sheet.tsx
  - apps/client/src/features/tasks/__tests__/task-status-test.tsx
  - apps/client/src/features/tasks/task-card.tsx
  - apps/client/src/features/tasks/task-form.tsx
  - apps/client/src/ui/date-field.tsx
  - e2e/events/accessibility.spec.ts
  - e2e/events/recurrence-rules.spec.ts
  - e2e/events/recurrence.spec.ts
  - packages/api-client/openapi.json
  - packages/api-client/src/generated/client.ts
  - packages/api-client/src/generated/models.ts
  - scripts/check-required-tests.ps1
  - apps/client/src/features/recurrence/series-scope-mode.ts
findings:
  critical: 4
  warning: 14
  info: 6
  total: 24
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-08-13
**Depth:** standard
**Files Reviewed:** 60
**Status:** issues_found

## Summary

Reviewed the recurring events/tasks slice: the pure calendar walker, the materializer and its
scheduler, the rule/series services and controllers, the Prisma schema plus both recurrence
migrations, the Expo client (picker, summary, rule list/detail, series scope sheet, event/task
forms and the screens that drive them), the generated API client, and the phase's test inventory.

The calendar core (`recurrence-date.ts`) is the strongest part of the slice: DST resolution,
month-end clamping, count/endsOn termination and the walk caps are all correct and well covered by
`recurrence-date.test.ts`. Both known in-session fixes check out — `formatRuleRow`'s
`endsOn < nextDayIsoIn(rule.timezone, now)` cross-check correctly classifies a rule ended today as
ended (its `<` boundary is right: `endsOn` is the last active day, so "ended" is exactly
`endsOn <= today`), and `task-form.tsx`'s `isCreate` decoupling does fix the `startsOn: ''` create
failure.

The defects concentrate at the seams the walker does not own: what the series-edit path copies onto
the successor rule, what the write DTOs accept but the services ignore, and which inputs reach
Prisma or a Postgres CHECK constraint without validation. Four of those produce user-visible wrong
behaviour or a hard 500 on ordinary input; none of them is covered by the phase's integration tests
(every recurrence test supplies `startTimeLocal` explicitly, which is exactly the field the client
never sends on an edit).

## Critical Issues

### CR-01: A recurring event longer than 24 hours fails with a 500

**File:** `apps/api/src/modules/events/events.service.ts:182`
(constraint: `apps/api/prisma/migrations/20260813000000_recurrence_rules/migration.sql:26`)
**Issue:** `durationMinutes` is derived from the submitted start/end with no upper bound:

```ts
const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
```

while the table enforces `CHECK ("duration_minutes" IS NULL OR ("duration_minutes" >= 0 AND
"duration_minutes" <= 1440))`. Any recurring event spanning more than 24 hours — a two-day all-day
event from `EventForm` (`${endDate}T23:59:59` gives 4320 minutes for a 3-day span), or a plain
09:00→next-day-11:00 event (1560) — violates the CHECK inside the create transaction. The raw
Prisma error is not an `HttpException`, so `StableHttpExceptionFilter` maps it to
`500 INTERNAL_ERROR` with the generic "An unexpected error occurred." message. The event is not
saved and the user gets no actionable error. Nothing on the client caps the span either, and
`RecurrenceDto.durationMinutes` has `@Max(1440)` only for the *client-supplied* field, which this
path never uses.
**Fix:** Validate the derived duration before the transaction and return the project's standard
400 shape:

```ts
const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
if (durationMinutes > 1440) {
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed.',
    details: [{
      field: 'endTime',
      codes: ['recurring_duration_too_long'],
      message: '重复事件的单次时长不能超过 24 小时。',
    }],
  });
}
```

(and mirror the limit in `EventForm.handleSubmit` so the user is told before the round trip).

### CR-02: "此后所有" does not apply a time change to the following occurrences

**File:** `apps/api/src/modules/recurrence/recurrence.service.ts:304-305`
**Issue:** On the occurrence-level series edit the successor rule inherits the *old* clock fields:

```ts
startTimeLocal: recurrence?.startTimeLocal ?? occurrence.rule.startTimeLocal,
durationMinutes: recurrence?.durationMinutes ?? occurrence.rule.durationMinutes,
```

but the first instance row is written from the request body
(`startTime: input.startTime === undefined ? template.startTime : new Date(input.startTime)`,
line 361). The client never recomputes `startTimeLocal`: `recurrenceInputFromResponse`
(`recurrence-picker.tsx:51-53`) copies the value straight off the response and the picker has no
time control, so `eventSeriesUpdate` sends back the pre-edit `startTimeLocal`. Net effect: a user
moves a weekly event from 09:00 to 10:00, picks 此后所有, sees the edited occurrence at 10:00, and
every occurrence the materializer generates afterwards is back at 09:00. The same applies to
`durationMinutes` (length change silently reverts) and to a task's due time. No integration test
covers this — every fixture in `apps/api/test/recurrence/*` passes `startTimeLocal` explicitly.
**Fix:** Derive the successor's clock fields from the instance payload when the caller supplied one,
exactly as `EventsService.create` does:

```ts
const successorTimezone = recurrence?.timezone ?? occurrence.rule.timezone;
const nextStartTimeLocal = recurrence?.startTimeLocal
  ?? (kind === 'event' && input.startTime !== undefined
    ? localTimeIn(new Date(input.startTime), successorTimezone)   // Intl h23 hh:mm
    : occurrence.rule.startTimeLocal);
const nextDurationMinutes = recurrence?.durationMinutes
  ?? (kind === 'event' && input.startTime !== undefined && input.endTime !== undefined
    ? Math.round((new Date(input.endTime).getTime() - new Date(input.startTime).getTime()) / 60_000)
    : occurrence.rule.durationMinutes);
```

and add an integration assertion that a materialized occurrence after the split carries the new
wall time.

### CR-03: Turning recurrence off on an existing series silently keeps it recurring

**File:** `apps/api/src/modules/recurrence/recurrence.service.ts:295-305`
(client side: `apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx:46`,
`.../tasks/[taskId]/edit.tsx:54`)
**Issue:** Selecting 不重复 in `RecurrencePicker` sets the form value to `null`, so
`EventForm`/`TaskForm` omit `recurrence` from the payload
(`...(form.recurrence === null ? {} : { recurrence: form.recurrence })`) and `eventSeriesUpdate`
omits it too. `seriesScopeModeFor(current, null)` correctly classifies this as `rule-change`, which
disables 仅此一次 and pushes the user to 此后所有 — and the server then reads `recurrence === undefined`
as "no recurrence fields supplied", so the successor rule copies `freq`, `interval`, `byWeekday`,
`endsOn`/`inheritedCount` from the old rule. The series is split and then continues unchanged. The
user is told the save succeeded, the sheet closes, and the recurrence they just removed keeps
generating. There is no other API to stop recurrence from the occurrence screen (`endRule` is
reachable only from the rule detail screen), so the UI affordance is a no-op.
**Fix:** Make "no recurrence" expressible and honoured. Minimal server-side option: treat an
explicit `recurrence: null` as "end the series at the anchor and detach this occurrence" —

```ts
// UpdateSeriesDto
@ApiPropertyOptional({ type: () => RecurrenceDto, nullable: true })
@IsOptional() @ValidateNested() @Type(() => RecurrenceDto)
recurrence?: RecurrenceDto | null;

// service, before building the successor
if (input.recurrence === null) {
  await this.endSeriesAt(tx, occurrence.rule.id, splitDate);
  // re-create the edited occurrence as a standalone row (recurrenceRuleId: null)
  return null;
}
```

and have the two edit screens send `recurrence: null` when the picker value is `null` and the
entity currently has a rule. If detaching is out of scope for this phase, disable the 不重复 chip
for an existing series and point the user at 结束此重复 instead of accepting an edit that does nothing.

### CR-04: `recurrence.endsOn` is written without calendar validation on the series path

**File:** `apps/api/src/modules/recurrence/recurrence.service.ts:301`
**Issue:**

```ts
endsOn: recurrence === undefined
  ? occurrence.rule.endsOn
  : recurrence.endsOn === undefined ? null : new Date(`${recurrence.endsOn}T00:00:00.000Z`),
```

`RecurrenceDto.endsOn` is only `@Matches(/^\d{4}-\d{2}-\d{2}$/)` (`recurrence.dto.ts:76`), which
accepts non-existent dates. Two bad outcomes, both reachable from any client:

- `"2026-02-30"` → `new Date(...)` rolls over to **2026-03-02** and is stored as the series end
  date. The user asked for one date and the series ends on another, with no error.
- `"2026-13-45"` → `Invalid Date` → Prisma rejects the write → raw error → `500`, after the old
  rule's `endsOn`/`count` have already been mutated in the same transaction (rolled back, but the
  caller sees an opaque 500).

Every other call site guards this with `parseIsoDate`, which rejects both
(`events.service.ts:158`, `tasks.service.ts:166`, `recurrence.service.ts:474`) — this path is the
outlier.
**Fix:** Validate through the same helper and reject in the standard shape:

```ts
const successorEndsOn = recurrence?.endsOn === undefined ? null : parseIsoDate(recurrence.endsOn);
// ...
endsOn: recurrence === undefined
  ? occurrence.rule.endsOn
  : successorEndsOn === null ? null : databaseDate(successorEndsOn),
```

and wrap `parseIsoDate` failures into a `BadRequestException` (see WR-02) so the 400 is deterministic.

## Warnings

### WR-01: `recurrence` is accepted on both update DTOs and silently ignored

**File:** `apps/api/src/modules/events/dto/update-event.dto.ts:40-44`,
`apps/api/src/modules/tasks/dto/update-task.dto.ts:43-47`;
services `apps/api/src/modules/events/events.service.ts:364-381`,
`apps/api/src/modules/tasks/tasks.service.ts:331-391`
**Issue:** Both DTOs declare `recurrence?: RecurrenceDto`, documented as
"重复规则；省略即不改变当前重复设置" — which states that *supplying* it does change the setting. Neither
`EventsService.update` nor `TasksService.update` ever reads `input.recurrence`; the field is
whitelisted, validated, then dropped, and the endpoint returns `200` with the unchanged entity. The
client actually exercises this: the 仅此一次 branch of both edit screens posts the full payload
including `recurrence` (`edit.tsx:170`, `edit.tsx:206`).
**Fix:** Either remove `recurrence` from both update DTOs (`forbidNonWhitelisted` will then return a
400 that says the field is not accepted here), or reject it explicitly:

```ts
if (input.recurrence !== undefined) {
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed.',
    details: [{ field: 'recurrence', codes: ['use_series_endpoint'] }],
  });
}
```

### WR-02: Regex-valid but non-existent dates produce a 500 instead of a 400

**File:** `apps/api/src/modules/events/events.service.ts:151,158`,
`apps/api/src/modules/tasks/tasks.service.ts:159,166`,
`apps/api/src/modules/recurrence/recurrence.service.ts:474`
**Issue:** `parseIsoDate` throws a plain `Error('invalid ISO calendar date')`, which is not an
`HttpException`, so `StableHttpExceptionFilter` returns `500 INTERNAL_ERROR`. `startsOn: "2026-02-30"`
or `"2026-13-45"` passes the DTO regex and reaches these call sites, so a malformed create request
is reported as a server fault rather than a client error, and the 5xx is logged as an unhandled
request error.
**Fix:** Wrap the parse at the module boundary:

```ts
function parseRequestDate(value: string, field: string): CalendarDate {
  try { return parseIsoDate(value); } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      details: [{ field, codes: ['invalid_date'] }],
    });
  }
}
```

or add a calendar-aware custom validator next to `IsIanaTimeZone` in `recurrence.dto.ts`.

### WR-03: Unvalidated `startDate`/`endDate` query params reach Prisma

**File:** `apps/api/src/modules/events/events.service.ts:278-299`
**Issue:** `new Date(startDate)` on an arbitrary query string yields `Invalid Date`;
`startUtc.setUTCDate(NaN)` keeps it invalid and it is handed to Prisma as `startTime.gte`, which
throws → 500. `GET /events?startDate=abc` is a one-line reproduction.
**Fix:** Validate in the controller with a query DTO (`@Matches(/^\d{4}-\d{2}-\d{2}$/)`), or guard in
the service and ignore/400 on an unparseable bound before building the `where`.

### WR-04: Series split and end do not take the rule's advisory lock

**File:** `apps/api/src/modules/recurrence/recurrence.service.ts:633-651` (`endSeriesAt`),
`:562-570` (`updateRuleFromAnchor` delete), vs
`apps/api/src/modules/recurrence/recurrence-materializer.service.ts:117-123`
**Issue:** `materializeRule` serialises writers with `pg_try_advisory_xact_lock`, but every
destructive path in `RecurrenceService` opens a transaction that never takes that lock. Under READ
COMMITTED, a materialization tick that read the rule before the split commits can insert
occurrences beyond the new `endsOn` *after* the split's `deleteMany` ran; its own `UPDATE` of the
rule row blocks until the split commits and then succeeds, leaving future rows attached to a series
the user just ended. The hourly tick (`RECURRENCE_TICK_MS`) plus the create-time
`materializeRule` call make the window real, and the symptom ("I ended it and next week's item came
back") is precisely what D-13/D-17 are trying to prevent.
**Fix:** Take the same lock at the top of `endSeriesAt`, `updateSeriesFromOccurrence` and
`updateRuleFromAnchor`:

```ts
const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`
  SELECT pg_advisory_xact_lock(${RECURRENCE_LOCK_NAMESPACE}, hashtext(${ruleId})) IS NULL AS locked
`;
```

(blocking `pg_advisory_xact_lock` rather than `try`, since a user-initiated write must not silently
skip), and add an integration test that interleaves `endRule` with `materializeRule`.

### WR-05: One unresolvable timezone breaks the whole rule list

**File:** `apps/api/src/modules/recurrence/recurrence.service.ts:86` (`toListItem`), used by
`listRules:121` and `getRule:151`
**Issue:** `currentCalendarDateIn(rule.timezone)` throws for a timezone Intl cannot resolve — a case
the codebase explicitly anticipates: `materializeAllDue` wraps every rule in try/catch because
"One rule's timezone becoming unresolvable (e.g. an ICU data change) must not abort the tick for
every other household." The list endpoint has no equivalent guard, so a single bad row 500s
`GET /recurrence-rules` for the entire household and makes the rule screen unusable — including the
screen you would use to fix or end that rule.
**Fix:** Degrade per row instead of failing the request:

```ts
let next: CalendarDate | null = null;
try {
  next = nextOccurrenceFor(walkRule, currentCalendarDateIn(rule.timezone));
} catch (error: unknown) {
  this.logger.error(`next occurrence unavailable for rule ${rule.id}`, error);
}
```

returning `nextOccurrenceDate: null` (which the client already renders as "这个重复已经结束").

### WR-06: Path params are not UUID-validated on the events and tasks controllers

**File:** `apps/api/src/modules/events/events.controller.ts:77,87,99`,
`apps/api/src/modules/tasks/tasks.controller.ts:46,61,75-76,85-86,99-100`
**Issue:** `recurrence.controller.ts:18-23` documents the exact trap and avoids it with a
per-parameter `ParseUUIDPipe`:

> TypeScript emits `Object` as the design:paramtypes metadata for an intersection type, and Nest's
> ValidationPipe exempts `Object` — so a param class's class-validator decorators never run and a
> malformed id reaches Prisma, surfacing as a 500 instead of a 400.

`EventsController.getById/update/delete` use exactly that intersection form
(`@Param() params: HouseholdIdParam & { eventId: string }`), and `TasksController` uses bare
`@Param('taskId') taskId: string` with no pipe at all. A non-UUID id therefore reaches
`prisma.*.findUnique` on a `@db.Uuid` column and surfaces as `500 INTERNAL_ERROR` instead of `404`.
**Fix:** Reuse the recurrence controller's pattern in both files:

```ts
const uuidParam = new ParseUUIDPipe({ version: '4' });
// ...
@Param('householdId', uuidParam) householdId: string,
@Param('eventId', uuidParam) eventId: string,
```

### WR-07: Editing a recurring task with no due date sends `startsOn: ""`

**File:** `apps/client/src/features/tasks/task-form.tsx:326` +
`apps/client/src/features/recurrence/recurrence-picker.tsx:170-177`
**Issue:** The create-path fix is scoped to `isCreate`, so the edit path still feeds the picker
`startDate={form.dueDate}`, and `form.dueDate` is `''` whenever the task has no due date
(`initial.dueDate?.split('T')[0] ?? ''`). The picker's sync effect then rewrites the value to
`{ ...value, startsOn: '' }` and pushes it upstream, so enabling recurrence on an undated task — or
re-saving a recurring task whose due date was cleared — posts `startsOn: ''`, which fails the
server's `@Matches` and surfaces as the generic "重复规则没有保存成功。请检查网络后重试。" The exact failure
mode the create-path comment describes is still live on the edit path.
**Fix:** Use the same fallback the create path uses, for any empty due date:

```ts
startDate={form.dueDate === '' ? todayIso : form.dueDate}
```

and guard the picker against propagating an empty anchor:

```ts
if (value === null || startDate === '' || value.startsOn === startDate) return;
```

### WR-08: Nested validation errors never reach the client's per-field mapping

**File:** `apps/api/src/main.ts:110-115` (`validationDetails`) +
`apps/client/src/features/recurrence/recurrence-picker.tsx:60-85` (`recurrenceErrorsFromApi`)
**Issue:** `validationDetails` maps only the top level:
`errors.map((error) => ({ field: error.property, codes: Object.keys(error.constraints ?? {}) }))`.
For a `@ValidateNested()` failure the parent has no `constraints` and its `children` are dropped, so
the response carries `{ field: 'recurrence', codes: [] }`. `recurrenceErrorsFromApi` only keeps
details whose `field` starts with `recurrence.`, so every pipe-level recurrence failure collapses to
the generic banner and the picker's carefully written per-field copy (`DATE_REQUIRED_ERROR`,
`COUNT_ERROR`, `TIMEZONE_ERROR`, the byWeekday message) only ever fires for the handful of manually
thrown service errors. Nothing focuses the offending field either
(`recurrence-picker.tsx:218-224`).
**Fix:** Flatten recursively, preserving the dotted path:

```ts
function validationDetails(errors: ValidationError[], prefix = ''): Array<{ field: string; codes: string[] }> {
  return errors.flatMap((error) => {
    const field = `${prefix}${error.property}`;
    const own = error.constraints === undefined
      ? []
      : [{ field, codes: Object.keys(error.constraints).sort() }];
    return [...own, ...validationDetails(error.children ?? [], `${field}.`)];
  });
}
```

### WR-09: The successor's seed occurrence can be a date the new rule never produces

**File:** `apps/api/src/modules/recurrence/recurrence.service.ts:333-367`
**Issue:** `updateSeriesFromOccurrence` always writes the seed instance at `splitDate`, even when
the request changes the pattern so `splitDate` is no longer an occurrence (e.g. splitting a daily
series on a Monday into `weekly, byWeekday: [2,3,5]`). The result is one stray row that no
subsequent generation would ever produce, and — when the successor is count-bounded — an extra row
beyond `count`, because the materializer's walk (which anchors `count` on `startsOn`) never counts
that seed. The sibling rule-level path does this correctly: `updateRuleFromAnchor:479-500` computes
`nextOccurrenceFor(...)` first, rejects a rule that can produce nothing (`no_occurrence_in_range`),
and seeds at that date.
**Fix:** Mirror the rule-level path — compute the successor's first occurrence from the *new*
pattern starting at `splitDate`, reject with `no_occurrence_in_range` when it is `null`, and seed at
that date instead of unconditionally at `splitDate`.

### WR-10: `RECURRENCE_MAX_LOOKAHEAD_DAYS` is a hardcoded duplicate of the lookahead map

**File:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts:25-35,77`
**Issue:** `RECURRENCE_LOOKAHEAD_DAYS` is a per-frequency map, `RECURRENCE_MAX_LOOKAHEAD_DAYS` is the
literal `6`, and `materializeAllDue`'s SQL prefilter relies on the latter being a true maximum
("A rule's local calendar date is at most 1 day ahead of the UTC date, so max lookahead + 1 is a
safe superset"). Raising any entry in the map — the comment invites doing so for monthly/yearly —
silently narrows the prefilter, and the affected rules simply stop being picked up by the tick with
no error anywhere.
**Fix:** Derive it:

```ts
export const RECURRENCE_MAX_LOOKAHEAD_DAYS = Math.max(...Object.values(RECURRENCE_LOOKAHEAD_DAYS));
```

### WR-11: The weekly `by_weekday` CHECK constraint never fires

**File:** `apps/api/prisma/migrations/20260813000000_recurrence_rules/migration.sql:24`
**Issue:**

```sql
CHECK ("by_weekday" <@ ARRAY[0,1,2,3,4,5,6] AND ("freq" <> 'weekly' OR array_length("by_weekday", 1) >= 1))
```

`array_length('{}', 1)` returns `NULL`, so for a weekly rule with an empty array the second
conjunct is `NULL`, the whole expression is `NULL`, and Postgres treats a `NULL` CHECK as satisfied.
The invariant the constraint exists to enforce is therefore unenforced — and the services do write
`byWeekday: recurrence.byWeekday ?? []` for weekly rules (`events.service.ts:192`,
`tasks.service.ts:190`, `recurrence.service.ts:508`), relying on the walker's
"empty ⇒ use the startsOn weekday" fallback. The code and the constraint disagree about what is
legal; whichever is right, the current state is a dead constraint.
**Fix:** Decide and align. If empty is legal (it is, per `walkOccurrences`), drop the second
conjunct so the constraint stops pretending. If it is not, use
`COALESCE(array_length("by_weekday", 1), 0) >= 1` and backfill the derived weekday on create.

### WR-12: The "generated" API client is hand-maintained and the task endpoints have no schema

**File:** `apps/api/src/openapi/generate-openapi.ts:9-427` (models), `:429-1318` (client);
`apps/api/src/modules/tasks/tasks.controller.ts:43,54,72,83`
**Issue:** `models.ts`/`client.ts` are emitted verbatim from string literals in the generator and
carry the header "Generated from openapi.json. Do not edit." — nothing derives them from the
document that is written next to them. The only protection is a hand-written list of
`operationId`/schema existence assertions, which cannot catch a shape drift (e.g. `CreateTaskDto.status`
is `string` in the model but `@IsIn(TASK_STATUSES)` on the server; `RecurrenceDto.freq` is `string`
in the model but an enum on the server). Compounding this, every task endpoint is annotated
`@ApiOkResponse({ type: Object as any })`, so the published contract documents no task response
schema at all while the client asserts a fully typed one.
**Fix:** Short term, replace `Object as any` with the real DTOs
(`@ApiOkResponse({ type: TaskResponseDto })`, `@ApiCreatedResponse({ type: TaskResponseDto })`) and
extend the generator's assertions to compare each declared model's property names against
`document.components.schemas[...]`. Longer term, generate `models.ts` from the document rather than
from a literal.

### WR-13: `dueDate` is validated then discarded on a recurring task create

**File:** `apps/api/src/modules/tasks/tasks.service.ts:137-147,219`
**Issue:** `dueDate` is parsed and range-checked at the top of `create`, but the recurrence branch
computes its own `dueDate: localDateTimeToInstant(firstOccurrence, hour, minute, ...)` and the
`dueDate` local is only used by the non-recurring branch — the user's submitted due date is accepted
with a 201 and silently dropped. The client works around this by hiding the field
(`task-form.tsx:308`), which documents the behaviour in the UI but not in the API.
**Fix:** Reject the combination rather than ignoring it:

```ts
if (input.recurrence !== undefined && input.dueDate) {
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed.',
    details: [{ field: 'dueDate', codes: ['not_allowed_with_recurrence'] }],
  });
}
```

### WR-14: Status-toggle failures are swallowed with no user-visible signal

**File:** `apps/client/app/(protected)/households/[id]/today.tsx:178-180`,
`apps/client/app/(protected)/households/[id]/tasks/index.tsx:205-207`
**Issue:** `catch { // silently ignore - failed status change }` — a 403 (member editing another
member's task), a 404 (occurrence cancelled by someone else) or an offline device all produce the
same outcome: the spinner stops, the card re-renders unchanged, and the user is left believing the
tap did not register. This matters more with recurring occurrences, where the card the user tapped
may legitimately have been cancelled or split away by another household member seconds earlier.
**Fix:** Surface it the way the edit screens already do — set an error string and render it (the
screens both have an error banner block), and refetch so the card reflects authoritative state:

```ts
} catch (error: unknown) {
  setError(error instanceof ApiClientError && error.status === 403
    ? '你没有权限修改这个任务。'
    : '状态没有更新成功，请重试。');
  void fetchData();
}
```

## Info

### IN-01: Four helpers are duplicated across three modules

**File:** `apps/api/src/modules/recurrence/recurrence.service.ts:30-46`,
`apps/api/src/modules/recurrence/recurrence-materializer.service.ts:50-61`,
`apps/api/src/modules/events/events.service.ts:19-21`,
`apps/api/src/modules/tasks/tasks.service.ts:26-29`
**Issue:** `calendarDate`, `databaseDate`, `localTime` and `utcMidnightToday` exist in two or three
copies each. The duplication is deliberately commented ("this is a deliberate local duplicate rather
than a cross-module import of a private implementation"), but the stated reason — the materializer's
copy is private — is solvable by exporting them.
**Fix:** Export the four from `recurrence-date.ts` (they are pure and already live next to
`parseIsoDate`/`formatIsoDate`) and delete the copies.

### IN-02: `RECURRENCE_LOCK_NAMESPACE` uses misleading digit grouping

**File:** `apps/api/src/modules/recurrence/recurrence-materializer.service.ts:17`
**Issue:** `1_907_070_1` reads as a mis-typed separator run; the value is `19070701`.
**Fix:** `export const RECURRENCE_LOCK_NAMESPACE = 19_070_701;` with a one-line comment on the
encoding (phase 07 / date), and note it must stay within `int4`.

### IN-03: Unused `err` bindings in catch blocks

**File:** `apps/client/app/(protected)/households/[id]/events/index.tsx:109`,
`apps/client/app/(protected)/households/[id]/tasks/index.tsx:158`,
`apps/client/app/(protected)/households/[id]/today.tsx:124`
**Issue:** `catch (err) { setError('…') }` never reads `err`.
**Fix:** Use a bare `catch {` (as the recurrence screens already do), or log the error.

### IN-04: Test database credentials are hardcoded as an env fallback

**File:** `e2e/events/recurrence-rules.spec.ts:12-15`, `e2e/events/recurrence.spec.ts` (same block)
**Issue:** `process.env.DATABASE_URL ?? 'postgresql://muchakucha_test:muchakucha_test_only@…'` plus a
literal `password` constant. Test-only and consistent with the rest of the E2E suite, and the
duplication is deliberately justified in-file (T-07-49) — noted only so it is not mistaken for a
production credential during a future scan.
**Fix:** None required; consider failing fast when `DATABASE_URL` is unset in CI rather than falling
back, so a misconfigured runner cannot silently target something else.

### IN-05: The client re-implements the recurring filter the API already provides

**File:** `apps/client/src/features/recurrence/recurring-filter.ts:26-32`, used by
`tasks/index.tsx:117` and `events/index.tsx:154`
**Issue:** Both list screens fetch everything and filter in memory, while the API exposes a
`recurring` query parameter (`events.service.ts:301-302`, `tasks.service.ts:265-266`) that the
generated client already supports (`listEvents(..., recurring?)`). Two mechanisms for one behaviour;
the server-side one is currently dead code from the app's point of view.
**Fix:** Either pass `recurring` through from the screens and delete `applyRecurringFilter`, or
document the client-side choice (it keeps the count badges consistent across filters) and drop the
unused server parameter.

### IN-06: Redundant `mayInclude` check in three walk branches

**File:** `apps/api/src/modules/recurrence/recurrence-date.ts:148-151,183-186,192-200`
**Issue:** The daily/monthly/yearly loops call `mayInclude(...)` and then `appendOccurrence(...)`,
which calls `mayInclude` again on the same date as its first statement. Harmless, but it makes the
termination conditions harder to reason about than the weekly branch, which needs the explicit
check.
**Fix:** Drop the outer call and rely on `appendOccurrence`'s return value, or have
`appendOccurrence` return a discriminated result (`'emitted' | 'skipped' | 'stop'`) so each branch
has one place to look.

---

_Reviewed: 2026-08-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
