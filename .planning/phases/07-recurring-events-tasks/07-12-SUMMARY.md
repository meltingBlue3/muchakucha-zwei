---
phase: 07-recurring-events-tasks
plan: 12
subsystem: api
tags: [recurrence, rules, openapi, authorization, timezone]

# Dependency graph
requires:
  - phase: 07-recurring-events-tasks (07-09)
    provides: walkOccurrences / currentCalendarDateIn / per-frequency lookahead — the rule-walking machinery nextOccurrenceFor and the end anchor are built on
  - phase: 07-recurring-events-tasks (07-11)
    provides: the generate-openapi.ts assertion-block and clientSource conventions this plan extends
provides:
  - "GET /households/:householdId/recurrence-rules — rule-level list, sorted unresolved-first by nextOccurrenceDate then ended-by-title, with kind derived from the tasks/events _count relations"
  - "GET /households/:householdId/recurrence-rules/:ruleId — rule detail, 404 RECURRENCE_RULE_NOT_FOUND across households, 404 HOUSEHOLD_NOT_FOUND for non-members"
  - "POST /households/:householdId/recurrence-rules/:ruleId/end (204) — end a recurrence without first selecting an occurrence"
  - "nextOccurrenceFor(rule, from, lookaheadDays=400) — pure walk-based next-occurrence lookup that does not query generated rows"
  - "RecurrenceService.endSeriesAt(tx, ruleId, anchor) — the single shared end-a-series transaction body, used by both deleteSeriesFromOccurrence(this_and_following) and endRule"
  - "packages/api-client: listRecurrenceRules / getRecurrenceRule / endRecurrenceRule"
affects: [07-13, 07-14, 07-15 (any client-side recurrence management UI consuming the rule sub-resource), any future change to series-ending semantics — it now has exactly one implementation site]

# Actuals (#2632)
actuals:
  tokens: 15600
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Answer 'when is this rule due next' by walking the RULE, never by querying generated instance rows: under D-11's per-frequency lookahead a healthy weekly rule routinely has zero future rows, so a row query answers 'never' for a perfectly healthy rule."
    - "One shared transaction body for series-ending (endSeriesAt), called by every path that ends a series. Both tx.task.deleteMany and tx.event.deleteMany run unconditionally — a rule owns rows in only one relation, so the other is a deliberate zero-row no-op, which lets the shared body avoid knowing the rule's kind and removes any way for two callers to drift on kind detection (CR-05)."
    - "Rule-level authorization ordering: resolveActorRole → 404 HOUSEHOLD_NOT_FOUND, then rule lookup + householdId equality → 404 RECURRENCE_RULE_NOT_FOUND, then canMutate → 403 FORBIDDEN. Existence is hidden before permission is evaluated, but never for a rule the actor can already legitimately see."

key-files:
  created:
    - apps/api/test/recurrence/recurrence-rules-api.int.test.ts
  modified:
    - apps/api/src/modules/recurrence/recurrence-date.ts
    - apps/api/src/modules/recurrence/recurrence-date.test.ts
    - apps/api/src/modules/recurrence/dto/recurrence.dto.ts
    - apps/api/src/modules/recurrence/recurrence.service.ts
    - apps/api/src/modules/recurrence/recurrence.controller.ts
    - apps/api/src/modules/recurrence/recurrence.module.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts
    - packages/api-client/src/generated/models.ts

key-decisions:
  - "The end-anchor integration tests use a WEEKLY rule covering both today's and tomorrow's weekday rather than the plan's literal 'daily rule with a today row and a tomorrow row'. The daily lookahead is 0 days (D-11), so a daily rule can never materialize a tomorrow row — there would be nothing on the far side of the anchor to assert against. The weekly straddling rule materializes exactly the two rows the anchor sits between, so the assertion the plan wanted is preserved and actually meaningful. See Deviations."
  - "The 'ended rule stays in the list with a null nextOccurrenceDate' test uses a rule whose occurrences fall strictly after today. nextOccurrenceFor is documented as on-or-after `from`, and endRule deliberately preserves today's occurrence, so a rule that still has a today occurrence correctly reports nextOccurrenceDate = today after ending — null would require making nextOccurrenceFor strictly-after, which would break Task 1's contract. See Deviations."
  - "endSeriesAt computes its endsOn through the file's existing calendarDate + the new databaseDate helpers instead of the plan's inline `new Date(`${formatIsoDate(...)}T00:00:00.000Z`)` template. Identical value, one construction idiom in the file rather than two."
  - "POST .../end rather than DELETE: ending a recurrence is not deleting the rule — the rule stays readable and stays in the list, only its future occurrences stop (D-14)."

requirements-completed: [RECR-01, RECR-02]

coverage:
  - id: D1
    description: "The rule list returns a correct nextOccurrenceDate for a healthy rule that has zero future instance rows (the core D-16 regression: the answer comes from walking the rule, not from querying generated rows)."
    requirement: "RECR-01"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#returns the correct nextOccurrenceDate for a healthy weekly rule with zero future instance rows"
        status: pass
      - kind: unit
        ref: "apps/api/src/modules/recurrence/recurrence-date.test.ts#nextOccurrenceFor (5 cases: weekly nearest weekday, monthly 31-day clamp, count exhausted, from after endsOn, yearly at +300 days inside the 400-day window)"
        status: pass
    human_judgment: false
  - id: D2
    description: "kind is derived from the tasks/events relation counts with no new column and no migration; a rule with zero rows on both sides returns null rather than a guess."
    requirement: "RECR-01"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#merges a task rule and an event rule into one list with correctly derived kinds"
        status: pass
      - kind: other
        ref: "git status --porcelain apps/api/prisma/migrations — empty (no new migration)"
        status: pass
    human_judgment: false
  - id: D3
    description: "List and detail responses never include createdBy or householdId — the client cannot copy the permission decision or infer household membership from rule data."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#never includes createdBy or householdId in list items"
        status: pass
    human_judgment: false
  - id: D4
    description: "T-07-32 (cross-household rule disclosure): a ruleId from another household yields 404 RECURRENCE_RULE_NOT_FOUND and a non-member yields 404 HOUSEHOLD_NOT_FOUND, on both the read path and the end path, before any role evaluation."
    requirement: "RECR-02"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#returns 404 RECURRENCE_RULE_NOT_FOUND for a ruleId from another household / #returns 404 HOUSEHOLD_NOT_FOUND for a non-member before any rule lookup (GET detail)"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#returns 404 RECURRENCE_RULE_NOT_FOUND for a ruleId belonging to another household / #returns 404 HOUSEHOLD_NOT_FOUND for a non-member before any rule lookup (POST end) — both also assert the rule's endsOn is still NULL, i.e. the rejected attempt wrote nothing"
        status: pass
    human_judgment: false
  - id: D5
    description: "T-07-34 (malformed UUID reaching Prisma): a malformed ruleId is rejected with 400 by ParseUUIDPipe rather than surfacing as a driver-level 500."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#rejects a malformed ruleId with 400 rather than a driver-level 500"
        status: pass
    human_judgment: false
  - id: D6
    description: "T-07-33 (member ending another member's rule): a MEMBER ending a rule they did not create gets 403 FORBIDDEN with no data written; the same member ending their own rule gets 204."
    requirement: "RECR-02"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#rejects a member ending another member's rule with 403 FORBIDDEN"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#lets a member end a rule they created themselves"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-14 anchor semantics: ending anchors on TOMORROW in the rule's own timezone, so today's (possibly already completed) occurrence survives while tomorrow's is removed, and endsOn lands on today."
    requirement: "RECR-02"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#keeps today's occurrence, removes tomorrow's, and ends the rule on today"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#applies identically to an event rule"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#preserves every historical occurrence row that existed before the end"
        status: pass
    human_judgment: false
  - id: D8
    description: "T-07-37 (two drifting copies of the end logic): endSeriesAt is the only implementation, called by deleteSeriesFromOccurrence's this_and_following branch and by endRule; the pre-existing /series suite regresses zero cases."
    verification:
      - kind: other
        ref: "grep -c 'endSeriesAt' apps/api/src/modules/recurrence/recurrence.service.ts — 3 (1 definition + 2 call sites); deleteSeriesFromOccurrence's branch contains no direct tx.recurrenceRule.update or deleteMany"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules.int.test.ts — pre-existing /series suite, all cases pass unchanged (59/59 across the 5 recurrence integration files)"
        status: pass
    human_judgment: false
  - id: D9
    description: "endsOn and count stay mutually exclusive across the end operation: a count-bounded rule ends with count NULL and endsOn set."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#clears a count bound to NULL and replaces it with an endsOn date"
        status: pass
    human_judgment: false
  - id: D10
    description: "Ending is not hiding: an ended rule stays in the list response, and ending is idempotent (a second end returns 204 and changes no rows or bounds)."
    requirement: "RECR-02"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#keeps an ended rule in the list with a null nextOccurrenceDate"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#is idempotent: ending an already ended rule changes nothing"
        status: pass
    human_judgment: false
  - id: D11
    description: "All three operations have stable operationIds produced by generate-openapi.ts's templates and assertion block; the generated client matches the committed tree with zero drift."
    verification:
      - kind: other
        ref: "pnpm openapi:check — PASS: generated OpenAPI client matches the committed 'packages/api-client' tree"
        status: pass
      - kind: other
        ref: "generate-openapi.ts assertion block throws 'OpenAPI recurrence rule operations or schemas are missing or unstable.' unless listRecurrenceRules/getRecurrenceRule/endRecurrenceRule operationIds and both schemas are present"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-08-13
status: complete
---

# Phase 7 Plan 12: Recurrence Rule Sub-Resource Summary

**Added a rule-level sub-resource — list every recurrence in a household, read one by id, and end one without first hunting down an occurrence to select — and collapsed the two copies of "end a series" into a single shared `endSeriesAt` transaction body.**

## Performance

- **Duration:** ~30 min for Task 2 (this session). Task 1 was executed in a prior session that was interrupted before its summary was written; its duration was not recorded.
- **Tasks:** 2
- **Files modified:** 10 (+1 created)
- **Commits:** 2 task commits (`083141a` Task 1, prior session; `856d38b` Task 2, this session)

## Execution Note (session continuity)

This plan was executed across two sessions in the same worktree. Task 1 was fully implemented and committed as `083141a` in a prior session that was then interrupted. That session had also left an **uncommitted partial draft of Task 2** in `recurrence.service.ts` (the extracted `endSeriesAt` plus `endRule`, with the controller endpoint, OpenAPI client method, and all Task 2 tests still missing).

This session reviewed that draft against the plan's Task 2 spec before building on it, and found it correct: `endSeriesAt` matched the specified body, both callers were wired to it, and `endRule`'s error ordering (404 HOUSEHOLD_NOT_FOUND → 404 RECURRENCE_RULE_NOT_FOUND → 403 FORBIDDEN) and tomorrow-in-the-rule's-timezone anchor matched the spec. One reuse cleanup was applied (see Decisions), then the missing controller endpoint, OpenAPI contract, and ten integration cases were written and the whole of Task 2 committed as one commit.

## Accomplishments

### Task 1 (`083141a`, prior session)

- `nextOccurrenceFor(rule, from, lookaheadDays = 400)` in `recurrence-date.ts` — one line over `walkOccurrences`, but the point is what it deliberately does *not* do: it never queries generated rows. Under D-11's per-frequency lookahead a healthy weekly rule routinely has zero future instance rows, so "when is this due next" answered by row query returns "never" for a perfectly healthy rule. 5 unit cases pin the behavior (weekly nearest weekday, monthly 31-day clamp, count exhausted, `from` past `endsOn`, yearly at +300 days proving the 400-day window suffices).
- `RecurrenceRuleListItemDto` / `RecurrenceRuleListResponseDto` — deliberately omit `createdBy`, `householdId`, and `materializedThrough`. `title` comes from the rule's `templateTitle`, never from an instance (instances are independently renameable).
- `RecurrenceService.listRules` / `getRule` — `kind` derived from `_count.tasks` / `_count.events` (zero new columns, zero migrations; null when both are 0 rather than a guess), `today` computed per-rule in **that rule's** timezone rather than once for the whole list, and the contract sort (unresolved rules first by `nextOccurrenceDate` asc then title; ended rules after by title) done server-side.
- `RecurrenceRulesController` with per-parameter `ParseUUIDPipe({ version: '4' })` (never an intersection-type param DTO, whose `design:paramtypes` is `Object` and whose validators therefore never run).
- OpenAPI: `listRecurrenceRules` + `getRecurrenceRule` operations, both DTO schemas, generated client regenerated, assertion block extended.
- 9 integration cases including the plan's designated core regression (window-external weekly rule still reports the right `nextOccurrenceDate`).

### Task 2 (`856d38b`, this session)

- **`private endSeriesAt(tx, ruleId, anchor)`** — the single implementation of "end this series at this anchor": set `endsOn` to the day before the anchor, clear `count` to NULL (the two bounds are mutually exclusive), then `deleteMany` from **both** `tx.task` and `tx.event` for `occurrenceDate >= anchor`. Both deletes run unconditionally on purpose: a rule owns rows in only one relation, so the other is a zero-row no-op, and that is exactly what lets this body avoid knowing the rule's kind — removing any way for the two callers to drift on kind detection (CR-05 / T-07-37).
- `deleteSeriesFromOccurrence`'s `this_and_following` branch now delegates to `endSeriesAt` after its permission check. Its external behavior, error codes, and error strings are byte-identical, and the pre-existing `/series` integration suite passes unchanged.
- **`endRule(actorId, householdId, ruleId)`** — resolves the actor's role (404 `HOUSEHOLD_NOT_FOUND` for non-members), then inside the transaction loads the rule and asserts `rule.householdId === householdId` (404 `RECURRENCE_RULE_NOT_FOUND`, **before** any role evaluation — SAFE-01, and the most important check in this plan because a client-supplied `ruleId` has no resolved occurrence to cross-check ownership against), then `canMutate` (403 `FORBIDDEN`). The anchor is `databaseDate(addDays(currentCalendarDateIn(rule.timezone), 1))` — tomorrow in the **rule's own** timezone, because today's occurrence may already be completed and anchoring on today would silently delete it, contradicting the operation's name.
- `POST /households/:householdId/recurrence-rules/:ruleId/end` → `@HttpCode(204)` + `@ApiOperation({ operationId: 'endRecurrenceRule' })` + `@ApiNoContentResponse()`, both path params through the module-level `uuidParam`.
- `generate-openapi.ts`: `endRecurrenceRule(accessToken, householdId, ruleId, signal?)` added to `clientSource` (shaped like `deleteTaskSeries` but `POST` with an `undefined` body), and Task 1's recurrence-rule assertion extended to also require the `/recurrence-rules/{ruleId}/end` `post.operationId`. Regenerated via `pnpm openapi:generate`; the generated diff is exactly the one new client method and the one new path object — nothing hand-edited.
- 10 new integration cases (test file now 19 cases total): anchor boundary (today survives, tomorrow removed, `ends_on` = today), historical rows preserved, `count` cleared to NULL with `endsOn` set, the same anchor behavior on an event rule, cross-household 404, non-member 404, member-on-another's-rule 403, member-on-own-rule 204, ended rule still present in the list, and idempotent re-end. The three rejection cases additionally assert `ends_on` is still NULL afterwards — a rejected attempt must write nothing, not merely return the right status.

## Task Commits

1. **Task 1: 规则列表与详情端到端（推算下一次发生 → DTO → 控制器 → OpenAPI → 集成断言）** — `083141a` (feat, prior session)
2. **Task 2: 抽出共享的锚点结束事务体，并新增规则级「结束此重复」** — `856d38b` (feat, this session)

## Files Created/Modified

- `apps/api/src/modules/recurrence/recurrence-date.ts` — `nextOccurrenceFor` (Task 1)
- `apps/api/src/modules/recurrence/recurrence-date.test.ts` — 5 `nextOccurrenceFor` unit cases (Task 1)
- `apps/api/src/modules/recurrence/dto/recurrence.dto.ts` — `RecurrenceRuleListItemDto`, `RecurrenceRuleListResponseDto` (Task 1)
- `apps/api/src/modules/recurrence/recurrence.service.ts` — `toListItem`/`listRules`/`getRule` (Task 1); `databaseDate` helper, `endSeriesAt`, `endRule`, `deleteSeriesFromOccurrence` delegation (Task 2)
- `apps/api/src/modules/recurrence/recurrence.controller.ts` — `RecurrenceRulesController` with GET list + GET detail (Task 1); `POST :ruleId/end` (Task 2)
- `apps/api/src/modules/recurrence/recurrence.module.ts` — registered `RecurrenceRulesController` (Task 1)
- `apps/api/src/openapi/generate-openapi.ts` — two DTO interfaces, `listRecurrenceRules`/`getRecurrenceRule`, assertion block (Task 1); `endRecurrenceRule` + extended assertion (Task 2)
- `packages/api-client/openapi.json` — regenerated (3 new operations, 2 new schemas)
- `packages/api-client/src/generated/client.ts` — regenerated (3 new methods)
- `packages/api-client/src/generated/models.ts` — regenerated (2 new interfaces)
- `apps/api/test/recurrence/recurrence-rules-api.int.test.ts` — **new**; 9 cases in Task 1, 10 added in Task 2 (19 total)

## Decisions Made

See `key-decisions` in frontmatter. The two that materially changed what got written versus the plan's literal text are both about the end-anchor tests and are documented in full below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in the plan's test recipe] The end-anchor tests use a straddling weekly rule, not a daily rule**

- **Found during:** Task 2, action item (d), first test ("一条每日规则同时拥有「今天」与「明天」两条实例行时…")
- **Issue:** The plan's recipe cannot be constructed. `RECURRENCE_LOOKAHEAD_DAYS.daily` is `0` (D-11: a daily rule's row for today only appears after the rule's own local midnight), so the materializer never generates a daily rule's **tomorrow** row. A daily-rule fixture would have had nothing on the far side of the anchor, and the test would have "passed" while asserting nothing about the anchor at all — the worst kind of green.
- **Fix:** The fixture is a **weekly** rule whose `byWeekday` contains both today's and tomorrow's weekday. Weekly lookahead is 6 days, so the materializer generates exactly the today row and the tomorrow row — precisely the two rows the anchor sits between. The test now asserts the premise explicitly (`occurrenceDatesFor` equals `[today, tomorrow]`) *before* ending, so the fixture can never silently degenerate again. A shared `straddlingWeeklyRecurrence(today, startsOn)` helper carries the pattern (with the reason in a comment) across the anchor, history, count, event-rule, and idempotency cases.
- **Files modified:** `apps/api/test/recurrence/recurrence-rules-api.int.test.ts`
- **Verification:** Removing the `endSeriesAt` delete calls makes the anchor test fail on the surviving tomorrow row; changing the anchor from `addDays(..., 1)` to `addDays(..., 0)` makes it fail on the missing today row. The assertion is load-bearing in both directions.
- **Committed in:** `856d38b`

**2. [Rule 1 - Contradiction between two plan requirements] The "ended rule shows null nextOccurrenceDate" test uses a rule with no on-or-after-today occurrence**

- **Found during:** Task 2, action item (d), ninth test ("结束后该规则仍出现在 listRecurrenceRules 的响应中，且 nextOccurrenceDate 为 null")
- **Issue:** Two of the plan's own requirements collide on a rule that has a today occurrence. `nextOccurrenceFor` is specified and documented as returning the next occurrence **on or after** `from` (Task 1), and `endRule` deliberately **preserves** today's occurrence (Task 2's whole anchor rationale). So immediately after ending a rule that recurs today, `nextOccurrenceDate` is correctly `today`, not `null` — today's occurrence genuinely still exists and is genuinely the next one. Forcing `null` would require making `nextOccurrenceFor` strictly-after, which breaks Task 1's contract (a daily rule due today must show today).
- **Fix:** The test fixture is a weekly rule on **tomorrow's** weekday starting tomorrow, so nothing survives on or after today once it is ended. The test asserts `nextOccurrenceDate === tomorrow` *before* the end and `null` after — which is a strictly stronger assertion than the plan's, because it proves the end actually removed the future rather than merely observing a null that a badly-configured fixture might have produced anyway. The rule's continued presence in the list (the D-14 contract the bullet exists to protect: "ended" is not "removed from the list") is asserted directly, along with `total === 1`.
- **Files modified:** `apps/api/test/recurrence/recurrence-rules-api.int.test.ts`
- **Verification:** `pnpm --filter api test:integration` — the case passes; deleting the `endSeriesAt` call makes the post-end `nextOccurrenceDate` revert to `tomorrow` and the case fails.
- **Committed in:** `856d38b`

**3. [Rule 3 - Reuse cleanup] `endSeriesAt` builds its `endsOn` through the file's existing helpers**

- **Found during:** Task 2, reviewing the prior session's uncommitted draft
- **Issue:** The draft (following the plan's literal text) inlined `parseIsoDate(anchor.toISOString().slice(0, 10))` and `new Date(`${formatIsoDate(...)}T00:00:00.000Z`)` — but `calendarDate()` already existed in the file as exactly the former, and the draft had just introduced `databaseDate()` as exactly the latter. Two idioms for one conversion in one file is how the next edit picks the wrong one.
- **Fix:** `endsOn: databaseDate(addDays(calendarDate(anchor), -1))`. Identical value, and comments added explaining why the series ends the day *before* the anchor and why `count` must be cleared.
- **Files modified:** `apps/api/src/modules/recurrence/recurrence.service.ts`
- **Verification:** `pnpm typecheck` clean; the pre-existing `/series` suite (which exercises this exact code path through `deleteSeriesFromOccurrence`) passes unchanged.
- **Committed in:** `856d38b`

---

**Total deviations:** 3 auto-fixed (2 plan-recipe corrections found by refusing to write a vacuous test, 1 reuse cleanup)
**Impact on plan:** None on the delivered behavior — every acceptance criterion is met as written. Both test deviations produce assertions strictly stronger than the plan's literal recipe; the third is cosmetic.

## Issues Encountered

- **Two pre-existing, out-of-scope integration failures** in this worktree: `test/security/asvs-v5-l1.test.ts` (`expect(denylist).not.toContain('\r')`) and its downstream `test/auth/password-reset.int.test.ts` case. Confirmed to be a **worktree checkout artifact, not a code defect**: `git ls-files --eol` shows the SecLists denylist fixture as `i/lf w/crlf` in this worktree but `i/lf w/lf` in the main checkout, and running the same test file in the main checkout passes 4/4. Already logged against 07-09 in `deferred-items.md`; not fixed, per the executor's scope-boundary rule, and no new entry added since it is the same item. Neither file is touched by this plan.
- `pnpm openapi:check` diffs the regenerated client against **HEAD**, so it necessarily fails while the regenerated client is still uncommitted. It was therefore run after the Task 2 commit, where it passes. (Same ordering as Task 1.)

## Verification Results

- `pnpm openapi:check` — **PASS** (`generated OpenAPI client matches the committed 'packages/api-client' tree`), run post-commit
- `cd apps/api && pnpm typecheck` — **PASS**, no errors
- `pnpm --filter api test:quick` — **PASS**, 34/34 (2 files)
- `pnpm --filter api test:integration` — 257 passed, 2 failed; the 2 failures are the pre-existing CRLF-fixture cases described above. **All 5 recurrence integration files pass 59/59**, including the pre-existing `/series` suite (zero regression) and the 19 cases in this plan's new file.
- `git status --porcelain apps/api/prisma/migrations` — empty (no new migration)
- `git diff --stat apps/api/src/modules/recurrence/recurrence-scheduler.ts` — empty (scheduler untouched)
- `grep -c "endSeriesAt" recurrence.service.ts` — **3** (1 definition + 2 call sites), as the acceptance criterion requires

## Next Phase Readiness

- The server side of the rule sub-resource is complete: list, detail, and end are all available with stable operationIds and generated client methods, ready for the client-side recurrence management surface in the remaining phase plans (07-13 / 07-14 / 07-15).
- Series-ending now has exactly one implementation (`endSeriesAt`). Any future change to what "end a series" means — including a decision to move the anchor from tomorrow to today — is a one-site edit that both the `/series` path and the rule-level path inherit automatically. Note the reversibility caveat from the plan: ending permanently deletes generated rows from the anchor forward, and those rows cannot be restored by a code change alone.
- Zero Prisma migrations, zero new dependencies, zero breaking contract changes — the three new operations are purely additive.

## Self-Check: PASSED

- FOUND: `apps/api/test/recurrence/recurrence-rules-api.int.test.ts`
- FOUND: commit `083141a` (Task 1)
- FOUND: commit `856d38b` (Task 2)

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-13*
