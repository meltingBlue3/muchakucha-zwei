---
phase: 07-recurring-events-tasks
plan: 13
subsystem: api
tags: [recurrence, rules, split, openapi, atomicity, authorization, timezone]

# Dependency graph
requires:
  - phase: 07-recurring-events-tasks (07-12)
    provides: RecurrenceRulesController, the databaseDate/calendarDate helpers, nextOccurrenceFor, and the tomorrow-in-the-rule's-timezone anchor this plan reuses verbatim
  - phase: 07-recurring-events-tasks (CR-01)
    provides: the rule-level template_* columns that make a rule-level edit strictly more correct than the occurrence-level one
provides:
  - "PUT /households/:householdId/recurrence-rules/:ruleId — edit a recurrence without first selecting an occurrence; one atomic split anchored on tomorrow in the rule's own timezone, returns the successor rule id"
  - "RecurrenceService.updateRuleFromAnchor(actorId, householdId, ruleId, input) — the rule-level sibling of updateSeriesFromOccurrence"
  - "UpdateRecurrenceRuleDto — single-field request body; a rule-level edit cannot express instance-level intent"
  - "packages/api-client: updateRecurrenceRule"
affects: [07-14, 07-15 (any client-side rule detail/edit screen), any future change to split semantics — the rule-level and occurrence-level paths are now two deliberate siblings, not one shared body]

# Actuals (#2632)
# chars/4 over the realized diff (git diff 39956ca..HEAD, added lines).
actuals:
  tokens: 12900
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A rule-level edit reads its successor template from the rule's template_* columns, never from an instance row. An occurrence-level edit has 'the one you selected'; a rule-level edit does not, and instances are independently renameable (D-02/D-07) — so any instance-derived template leaks one occurrence's edit into every occurrence the successor will ever generate."
    - "Every split writes a seed instance row for the successor inside the same transaction (D-17). The materializer derives a rule's kind and copies its assignee/label associations from the rule's earliest instance, so a successor with no seed is an untyped rule that can never generate anything — and under D-11's narrow lookahead the successor's first real occurrence is routinely outside the generation window."
    - "Splitting and ending are deliberately NOT collapsed into endSeriesAt. endSeriesAt writes endsOn as part of ending; a split has already written it and then hands the future to a successor rule. The delete in updateRuleFromAnchor carries a comment naming that difference so a later reader does not merge them."
    - "A no-DDL forced-failure vector does not exist for this transaction: every rule column the request influences is range-checked by RecurrenceDto before it reaches the database, and every template column the successor copies comes from a row that already satisfies its constraint. The atomicity test therefore adds a test-scoped NOT VALID CHECK on `tasks` and drops it in a finally."

key-files:
  created: []
  modified:
    - apps/api/src/modules/recurrence/dto/recurrence.dto.ts
    - apps/api/src/modules/recurrence/recurrence.service.ts
    - apps/api/src/modules/recurrence/recurrence.controller.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts
    - packages/api-client/src/generated/models.ts
    - apps/api/test/recurrence/recurrence-rules-api.int.test.ts
    - .planning/phases/07-recurring-events-tasks/deferred-items.md

key-decisions:
  - "The successor's startsOn is forced to the anchor and the body's required `startsOn` is deliberately ignored for that purpose. '此后所有' is defined by the anchor; honouring a client-supplied start would let a rule-level edit reach backwards into history. RecurrencePicker already force-syncs startsOn to the startDate prop it is given (07-RESEARCH-ADDENDUM §8), so a correct client sends the anchor anyway."
  - "The mutual-exclusivity check (endsOn + count) runs BEFORE the transaction opens, matching the plan's step ordering. A consequence worth recording: the existing /series suite's atomicity case uses that same 400 as its mid-transaction failure, so it is not reusable here — see Deviations."
  - "The walk that computes the successor's first occurrence is fed the RESOLVED endsOn/count (the values actually written to the rule) rather than the plan's literal `请求值 ?? null`. Identical results in every reachable case, but one source of truth instead of two expressions that could drift."
  - "@IsDefined() added alongside @ValidateNested() on the DTO's single field, so a body that omits `recurrence` fails as a 400 rather than dereferencing undefined in the service."

requirements-completed: [RECR-02]

coverage:
  - id: D1
    description: "The split anchors on tomorrow in the rule's own timezone: occurrences before the anchor survive untouched, occurrences from the anchor forward move to the successor, the old rule ends on today, and the successor starts tomorrow."
    requirement: "RECR-02"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#splits at tomorrow: history survives, the future moves to the successor"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#applies identically to an event rule and seeds it with the successor duration"
        status: pass
    human_judgment: false
  - id: D2
    description: "The successor's template comes from the old RULE's template_* columns, not from any instance row — the plan's core regression. The fixture renames EVERY instance to a distinct string first, so a template read off any instance whatsoever fails."
    requirement: "RECR-02"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#takes the successor template from the RULE, never from a renamed instance"
        status: pass
      - kind: other
        ref: "Mutation probe: changing templateTitle to read the rule's earliest instance makes the case fail with `expected 'Renamed 2026-08-06' to be 'Series template title'` — the assertion is load-bearing, not tautological."
        status: pass
    human_judgment: false
  - id: D3
    description: "D-17 seed-row invariant on the rule-level path: the successor carries exactly one instance row at its first occurrence from the anchor. The successor is DAILY (0-day lookahead), so the materializer contributes nothing and the row can only be the seed the split wrote."
    requirement: "RECR-02"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#writes a seed instance row at the successor's first occurrence from the anchor"
        status: pass
      - kind: other
        ref: "Mutation probe: returning from the transaction before the seed write makes the case fail with `expected [] to deeply equal [ '2026-08-14' ]`."
        status: pass
    human_judgment: false
  - id: D4
    description: "Assignees and labels are inherited from the rule's nearest instance, preferring the earliest at or after the anchor and falling back to the latest before it. Distinct labels on either side of the anchor pin WHICH instance was used, not merely that something was copied."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#inherits assignees and labels from the earliest instance at or after the anchor"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#falls back to the latest instance before the anchor when none is at or after it"
        status: pass
    human_judgment: false
  - id: D5
    description: "T-07-40 (atomicity, D-08): a failure anywhere in the split leaves no intermediate state — no half-ended old rule, no orphaned successor, no missing occurrence rows. Covered at two failure points, one of them the split's LAST write."
    requirement: "RECR-02"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#rejects a successor that can never occur and leaves the old rule byte-identical (fails at the first-occurrence computation, AFTER the old rule was date-bounded)"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#rolls the whole split back when its last write fails mid-transaction (fails at the seed INSERT, after the old rule was bounded, its rows deleted, and the successor created)"
        status: pass
    human_judgment: false
  - id: D6
    description: "T-07-43: a successor with no possible occurrence is rejected with 400 no_occurrence_in_range — the same code the two create paths use — rather than created as a dead rule."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#rejects a successor that can never occur and leaves the old rule byte-identical"
        status: pass
    human_judgment: false
  - id: D7
    description: "endsOn and count stay mutually exclusive across the split: an explicit pair is a 400 on recurrence.endsOn with the same shape as the /series path, and date-bounding the old rule clears its count in the same statement while the successor inherits the remaining occurrences."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#inherits the remaining count and clears the old rule's count atomically (count 10, 3 elapsed, successor gets 7, old rule NULL)"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#rejects endsOn and count together with 400 on recurrence.endsOn"
        status: pass
    human_judgment: false
  - id: D8
    description: "T-07-38 / T-07-39 (SAFE-01): ownership is decided before role. A ruleId from another household is 404 RECURRENCE_RULE_NOT_FOUND, a non-member is 404 HOUSEHOLD_NOT_FOUND, a member editing another's rule is 403 FORBIDDEN, and the same member editing their own rule is 200. Every rejection also asserts the old rule's endsOn is still NULL."
    requirement: "RECR-02"
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#returns 404 RECURRENCE_RULE_NOT_FOUND for a ruleId belonging to another household"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#returns 404 HOUSEHOLD_NOT_FOUND for a non-member before any rule lookup"
        status: pass
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#rejects a member editing another member's rule with 403, but allows their own"
        status: pass
    human_judgment: false
  - id: D9
    description: "T-07-41: the request body cannot smuggle instance-level fields. UpdateRecurrenceRuleDto declares exactly one property and the app's forbidNonWhitelisted pipe rejects anything else."
    verification:
      - kind: other
        ref: "UpdateRecurrenceRuleDto has a single `recurrence` field; main.ts ValidationPipe runs with whitelist + forbidNonWhitelisted + forbidUnknownValues"
        status: pass
    human_judgment: false
  - id: D10
    description: "Successor materialization begins only after the split transaction commits (locked Phase 7 decision) — materializeRule is called outside the $transaction callback."
    verification:
      - kind: other
        ref: "apps/api/src/modules/recurrence/recurrence.service.ts — `await this.materializer.materializeRule(newRuleId)` sits after the $transaction closes, mirroring updateSeriesFromOccurrence"
        status: pass
    human_judgment: false
  - id: D11
    description: "An edit supersedes rather than deletes: the old rule stays in the list with a null nextOccurrenceDate, sorted after its successor."
    verification:
      - kind: integration
        ref: "apps/api/test/recurrence/recurrence-rules-api.int.test.ts#lists the successor before the superseded rule after an edit"
        status: pass
    human_judgment: false
  - id: D12
    description: "The new operation has a stable operationId enforced by generate-openapi.ts's assertion block, and the generated client matches the committed tree with zero drift. No Prisma migration was added."
    verification:
      - kind: other
        ref: "pnpm openapi:check — PASS: generated OpenAPI client matches the committed 'packages/api-client' tree"
        status: pass
      - kind: other
        ref: "generate-openapi.ts throws 'OpenAPI recurrence rule operations or schemas are missing or unstable.' unless the PUT operationId is updateRecurrenceRule and UpdateRecurrenceRuleDto exists"
        status: pass
      - kind: other
        ref: "git status --porcelain apps/api/prisma/migrations — empty"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-08-13
status: complete
---

# Phase 7 Plan 13: Rule-Level Recurrence Editing Summary

**A recurrence can now be edited from the rule itself — no occurrence to select first — as a single atomic split anchored on tomorrow in the rule's own timezone, with the successor's template taken from the rule rather than from any renameable instance.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2
- **Files modified:** 9 (0 created)
- **Commits:** 2

## Accomplishments

### Task 1 (`235bd8d`)

- **`UpdateRecurrenceRuleDto`** — one field, `recurrence: RecurrenceDto`. The single-field shape is the mitigation for T-07-41: a rule-level edit has no "the occurrence you selected", so it must not be able to express instance-level intent (title, status, assigneeIds), and `forbidNonWhitelisted` rejects anything else outright.
- **`RecurrenceService.updateRuleFromAnchor`** — the rule-level sibling of `updateSeriesFromOccurrence`, written section-for-section against it with three substitutions:
  1. the anchor is `addDays(currentCalendarDateIn(rule.timezone), 1)` — tomorrow in the **rule's own** timezone, the same anchor `endRule` uses — instead of a selected occurrence's date;
  2. the successor's `template_*` fields come from the **old rule's** `template_*` columns, which is the payoff of CR-01 and the reason this path is strictly more correct than the occurrence-level one;
  3. assignees and labels still come from the rule's nearest instance (earliest at or after the anchor, else latest before it), the documented Path B fallback — the rule carries no assignee/label template columns.
- The whole split — old-rule date-bound + count clear, successor creation, future-row delete, seed-row write — lives in **one** `$transaction`. `materializeRule` runs strictly after it commits, per the locked Phase 7 decision.
- **The seed instance row (D-17)** is written inside the transaction at the successor's first occurrence from the anchor. Without it the successor is a rule the materializer cannot type (kind is derived from which instance relation has rows), cannot copy assignees or labels from, and — under D-11's per-frequency lookahead — may not generate anything for weeks.
- **`no_occurrence_in_range`** rather than a dead rule: if the successor's bounds admit no occurrence at all, the whole request is rejected with the same 400 code the two create paths use, and the transaction restores the old rule's bounds exactly.
- The delete of the old rule's future rows deliberately does **not** call `endSeriesAt`, with a comment saying why: `endSeriesAt` also writes `endsOn`, which the split has already set, and ending is not splitting. The comment exists so a later reader does not "clean up" the apparent duplication.
- `PUT /households/:householdId/recurrence-rules/:ruleId` → `@ApiOperation({ operationId: 'updateRecurrenceRule' })` + `@ApiOkResponse({ type: SeriesMutationResponseDto })` (response schema reused, none added), both path params through the module-level `uuidParam`. `generate-openapi.ts` gained the `UpdateRecurrenceRuleDto` interface, the `updateRecurrenceRule` client method, and an extended assertion covering both the new operationId and the new schema. The regenerated diff is exactly one path object, one schema, one client method, and one model interface — nothing hand-edited.

### Task 2 (`eb62406`)

14 new integration cases (file now 33 total, all passing):

- **anchor & history** on a task rule and again on an event rule — yesterday and today untouched, everything from tomorrow forward moved, old rule `ends_on` = today, successor `starts_on` = tomorrow; the event case additionally asserts the seed event's span equals the successor's `duration_minutes`;
- **template source** — every instance renamed to a distinct string first, then the successor's `template_title` and its seed row's title must both still be the series title;
- **seed row** — the successor is daily (0-day lookahead), so `occurrenceDatesFor` returning exactly `[tomorrow]` proves the split wrote it;
- **inheritance** — 2 assignees plus *distinct* labels on either side of the anchor, so the assertion pins which instance was the source; a second case removes every at-or-after-anchor row to exercise the fallback branch;
- **count** — `count: 10` with 3 elapsed yields a successor `count` of 7 and an old rule `count` of NULL; and the explicit `endsOn` + `count` pair is a 400 on `recurrence.endsOn`;
- **atomicity, twice** — one failure at the first-occurrence computation and one at the split's very last write, both asserting the old rule's bounds, its full row list, and the household's rule count are unchanged;
- **authorization** — cross-household 404, non-member 404, member-on-another's-rule 403 and member-on-own-rule 200, each rejection also asserting nothing was written;
- **list linkage** — the superseded rule stays listed with a null `nextOccurrenceDate`, sorted after its successor.

Both designated core regressions were **verified load-bearing by mutating the implementation** (see coverage D2/D3), not merely observed green.

## Task Commits

1. **Task 1: `updateRuleFromAnchor` 与 PUT 路由** — `235bd8d` (feat)
2. **Task 2: 规则级编辑的集成回归** — `eb62406` (test)

## Files Created/Modified

- `apps/api/src/modules/recurrence/dto/recurrence.dto.ts` — `UpdateRecurrenceRuleDto`, `IsDefined` import
- `apps/api/src/modules/recurrence/recurrence.service.ts` — `updateRuleFromAnchor`, `localTime` helper, `localDateTimeToInstant` import
- `apps/api/src/modules/recurrence/recurrence.controller.ts` — `PUT :ruleId` on `RecurrenceRulesController`
- `apps/api/src/openapi/generate-openapi.ts` — `UpdateRecurrenceRuleDto` interface, `updateRecurrenceRule` client method, extended assertion
- `packages/api-client/openapi.json` / `src/generated/client.ts` / `src/generated/models.ts` — regenerated
- `apps/api/test/recurrence/recurrence-rules-api.int.test.ts` — 14 new cases, `recurrenceRulesApi` extended to PUT-with-payload, five new DB read helpers
- `.planning/phases/07-recurring-events-tasks/deferred-items.md` — one new deferred finding (below)

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing input validation] `@IsDefined()` added alongside `@ValidateNested()` on the DTO's single field**

- **Found during:** Task 1(a), writing the DTO
- **Issue:** The plan says to copy `UpdateSeriesDto`'s optional `recurrence` field and drop `@IsOptional()`. But if a body omits `recurrence` entirely and validation lets it through, the service's very first statement (`recurrence.endsOn !== undefined`) dereferences `undefined` and the client gets a 500 for what is plainly a malformed request.
- **Fix:** `@IsDefined() @ValidateNested() @Type(() => RecurrenceDto)`, with a comment saying it is not redundant. No effect on the OpenAPI schema (`@ApiProperty` already marks the field required).
- **Files modified:** `apps/api/src/modules/recurrence/dto/recurrence.dto.ts`
- **Committed in:** `235bd8d`

**2. [Rule 1 - Plan test recipe cannot be constructed] The anchor fixtures use a straddling weekly rule, not a daily rule**

- **Found during:** Task 2, the "锚点与历史" case ("一条每日任务规则同时有昨天、今天、明天三条实例")
- **Issue:** identical to the one 07-12 documented — `RECURRENCE_LOOKAHEAD_DAYS.daily` is `0` (D-11), so the materializer never generates a daily rule's **tomorrow** row. A daily fixture has nothing on the far side of the anchor, and the test would pass while asserting nothing about the anchor at all.
- **Fix:** a `weeklyAcross(days, startsOn)` helper builds a weekly rule whose `byWeekday` covers the weekdays of the days the case needs, so the materializer generates exactly those rows. Each case asserts its premise (the rows really do straddle the anchor) *before* acting, so the fixture cannot silently degenerate. The helper carries the reason in a comment.
- **Files modified:** `apps/api/test/recurrence/recurrence-rules-api.int.test.ts`
- **Committed in:** `eb62406`

**3. [Rule 1 - Plan's suggested failure vector does not exist] The forced mid-transaction failure uses a test-scoped `NOT VALID` CHECK constraint**

- **Found during:** Task 2, the "强制中途失败" case ("例如让后继规则的创建违反数据库约束")
- **Issue:** two problems with the plan's recipe. First, it says to copy the existing `/series` suite's atomicity construction — but that case uses the `endsOn` + `count` 400, and in `updateRuleFromAnchor` that check runs **before** the transaction opens (the plan's own step 2), so it is not a mid-transaction failure here. Second, no production constraint on `recurrence_rules` is reachable: every column the request influences (`freq`, `interval`, `byWeekday` membership, `count`, `startTimeLocal`, `durationMinutes`) is already range-checked by `RecurrenceDto` before it reaches the database, and every `template_*` column the successor copies comes from a row that necessarily already satisfies its constraint. The most promising candidate, `recurrence_rules_by_weekday_ck`, turned out not to fire either — see the deferred item below.
- **Fix:** the case adds `CHECK (title <> 'SPLIT_SEED_MUST_FAIL') NOT VALID` on `tasks` after the fixture exists, and drops it in a `finally`. `NOT VALID` grandfathers the rows the fixture already wrote, so the **seed INSERT is the only statement that trips it** — which is the split's *last* write, making this a strictly stronger rollback assertion than one that fails at the successor's creation: it proves the old rule's new `endsOn`, its cleared `count`, its deleted future rows, and the successor rule itself are all undone. The `finally` is unconditional because `resetDatabase` truncates rows and never touches DDL, so a leaked constraint would poison every later test in the run.
- **Files modified:** `apps/api/test/recurrence/recurrence-rules-api.int.test.ts`
- **Verification:** the case passes; the second atomicity case (`no_occurrence_in_range`) independently covers a failure at an earlier point in the same transaction.
- **Committed in:** `eb62406`

**4. [Rule 1 - Same contradiction 07-12 documented] The list-linkage fixture uses a rule with no on-or-after-today occurrence**

- **Found during:** Task 2, the "列表联动" case
- **Issue:** `nextOccurrenceFor` is specified as returning the next occurrence **on or after** `from`, and the split deliberately **preserves** today's occurrence. A superseded rule that still recurs today therefore correctly reports `nextOccurrenceDate = today`, not `null`.
- **Fix:** the fixture is a weekly rule on tomorrow's weekday starting tomorrow, so once superseded nothing of it survives on or after today and the null is genuine rather than accidental. The successor's `nextOccurrenceDate` is asserted to be exactly tomorrow (not merely non-null), and the ordering assertion is by index.
- **Files modified:** `apps/api/test/recurrence/recurrence-rules-api.int.test.ts`
- **Committed in:** `eb62406`

**5. [Rule 3 - Single source of truth] The first-occurrence walk is fed the resolved successor bounds**

- **Found during:** Task 1(b), step 9
- **Issue:** the plan's literal text passes `endsOn: 请求值 ?? null, count: 请求值 ?? null` to `nextOccurrenceFor`, while step 10 writes a *differently computed* `count` to the rule (the inherited remainder when neither bound is given). Two expressions for one concept is how the next edit makes them disagree.
- **Fix:** `successorEndsOn` and `successorCount` are computed once and used both for the walk and for the `create`. Results are identical in every reachable case (a resolved `count` is either the request's value, a positive remainder, or null — none of which changes whether a first occurrence exists), so this is a clarity change, not a behaviour change.
- **Files modified:** `apps/api/src/modules/recurrence/recurrence.service.ts`
- **Committed in:** `235bd8d`

---

**Total deviations:** 5 auto-fixed (1 validation hardening, 3 plan-recipe corrections found by refusing to write a vacuous or unconstructable test, 1 reuse cleanup)
**Impact on plan:** none on delivered behaviour — every acceptance criterion in both tasks is met as written. All three test deviations produce assertions at least as strong as the plan's literal recipe.

## Issues Encountered

- **The worktree had no `node_modules`.** Restored with `pnpm install --frozen-lockfile` plus `prisma generate` — restoring a committed lockfile, not adding any dependency. No lockfile change resulted.
- **`recurrence_rules_by_weekday_ck` does not reject an empty `by_weekday` on a weekly rule.** `array_length('{}', 1)` is `NULL`, not `0`, so the constraint's second conjunct evaluates to NULL and PostgreSQL admits the row. Verified directly against the test database. **No impact today** — all three write paths pass `byWeekday ?? []` and `walkOccurrences` treats an empty `byWeekday` on a weekly rule as "the weekday of `startsOn`", which is sane and documented. Tightening it needs a migration, and this is a no-migration plan, so it is logged in `deferred-items.md` for whichever later phase next touches `recurrence_rules`.
- **The same two pre-existing, out-of-scope integration failures** as 07-09 and 07-12: `test/security/asvs-v5-l1.test.ts` and its downstream `test/auth/password-reset.int.test.ts` case. Re-confirmed as a Windows worktree checkout artifact, not a code defect — `git ls-files --eol` shows the SecLists denylist fixture as `i/lf w/crlf` here. Neither file is touched by this plan; no duplicate deferred entry was filed, only a "recurred in 07-13" note on the existing one.
- **`pnpm openapi:check` diffs the regenerated client against HEAD**, so it necessarily fails while the regenerated client is uncommitted. Run after the Task 1 commit, where it passes — same ordering as 07-11 and 07-12.

## Verification Results

- `pnpm openapi:check` — **PASS** (`generated OpenAPI client matches the committed 'packages/api-client' tree`), run post-commit
- `cd apps/api && pnpm typecheck` — **PASS**, no errors
- `pnpm --filter api test:integration` — 271 passed, 2 failed; the 2 failures are the pre-existing CRLF-fixture cases above. **All 5 recurrence integration files pass 73/73**, including the 33 cases in this file (19 pre-existing from 07-12, zero regression) and the pre-existing `/series` suite
- `powershell -File scripts/check-required-tests.ps1` — **PASS**, all 30 required test contracts exist without forbidden markers
- `git status --porcelain apps/api/prisma/migrations` — empty (no new migration)
- `grep -c "updateRuleFromAnchor" recurrence.service.ts` — **1**; `grep -c "updateRecurrenceRule" recurrence.controller.ts` — **1**
- `templateTitle` inside `updateRuleFromAnchor` is assigned from `rule.templateTitle`; no instance `title` is read anywhere in the method
- `this.materializer.materializeRule(` appears after the `$transaction` closes, not inside the callback
- `grep -cE "\.skip|\.todo|IMPLEMENTATION_MISSING"` on the test file — **0**

## Next Phase Readiness

- The rule sub-resource is now feature-complete on the server: list, detail, edit, and end, all with stable operationIds and generated client methods. A rule detail screen can be built without ever resolving an occurrenceId — the gap that motivated this plan.
- Splitting a series now has **two** deliberate implementations (`updateSeriesFromOccurrence` for the occurrence-level path, `updateRuleFromAnchor` for the rule-level one) rather than one shared body. That is intentional and commented: they differ in anchor, template source, and inheritance strategy. Anyone tempted to unify them should read the delete-site comment in `updateRuleFromAnchor` first.
- Reversibility caveat carried over from ending: a split permanently deletes the old rule's generated rows from the anchor forward. Those rows cannot be restored by a code change alone.
- Zero Prisma migrations, zero new dependencies, one purely additive contract change.

## Self-Check: PASSED

- FOUND: `apps/api/src/modules/recurrence/recurrence.service.ts`
- FOUND: `apps/api/src/modules/recurrence/dto/recurrence.dto.ts`
- FOUND: `apps/api/test/recurrence/recurrence-rules-api.int.test.ts`
- FOUND: commit `235bd8d` (Task 1)
- FOUND: commit `eb62406` (Task 2)

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-13*
</content>
