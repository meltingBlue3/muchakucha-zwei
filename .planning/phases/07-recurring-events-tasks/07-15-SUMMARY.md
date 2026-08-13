---
phase: 07-recurring-events-tasks
plan: 15
subsystem: verification
tags: [e2e, playwright, axe, accessibility, validation, recurrence]

# Dependency graph
requires:
  - phase: 07-recurring-events-tasks (07-10)
    provides: the recurring-only filter chips and the generation-window classifier this spec drives through the task list
  - phase: 07-recurring-events-tasks (07-14)
    provides: the rule list and rule detail screens, their accessible names, and the 结束此重复 two-step confirm this spec exercises
  - phase: 07-recurring-events-tasks (07-09/07-11/07-12/07-13)
    provides: the per-frequency lookahead, the recurring query param, and the three rule-level endpoints the journeys assert against
provides:
  - "e2e/events/recurrence-rules.spec.ts — the only automated coverage of the two app/** screens, which client Jest's testMatch cannot reach"
  - "scripts/check-required-tests.ps1 — 36 guarded contracts, including all six addendum test files"
  - "07-VALIDATION.md — the addendum's 18 verification rows, each backed by a real run on 2026-08-13"
affects: [any later change to the rule screens' accessible names or copy (this spec pins them), any change to endRule's anchor (a mutation-proved guard fails)]

# Actuals (#2632)
# chars/4 over the realized diff (git diff 06baaa3..HEAD, added lines).
actuals:
  tokens: 8700
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Expo Router keeps the pushed-from screen mounted, so the rule list and the rule detail are in the DOM simultaneously and share strings (`下一次 …`, `这个重复已经结束`). Every assertion is scoped to `getByRole('main', { name, exact: true })` for one screen. `exact: true` is load-bearing: accessible-name matching is substring by default, so `周期规则` would also match `周期规则详情`."
    - "The D-14 anchor assertion was proved load-bearing by mutation, not by observation: changing `endRule`'s anchor from `addDays(today, 1)` to `addDays(today, 0)` turns it red at exactly the intended line."
    - "A negative copy assertion (`getByText(/\\d+\\s*天/)` → count 0) is how D-19's 'never name a fixed number of days' is enforced at runtime rather than by code review."

key-files:
  created:
    - e2e/events/recurrence-rules.spec.ts
  modified:
    - apps/client/src/features/recurrence/recurrence-summary.tsx
    - scripts/check-required-tests.ps1
    - .planning/phases/07-recurring-events-tasks/07-VALIDATION.md
    - .planning/phases/07-recurring-events-tasks/deferred-items.md

key-decisions:
  - "Test 3 uses TWO rules rather than one, because the plan's two demands cannot both hold for a single rule. `endRule` sets `endsOn` to today, so a rule that occurs today still reports `nextOccurrenceDate = today` and its row correctly reads `下一次 {today}`, not `这个重复已经结束`. A daily-from-today task rule therefore proves 'today survives'; a weekly event rule starting tomorrow proves 'the ended rule stays listed and says so'. Using one rule would have forced a false assertion. See Deviations."
  - "`RecurrenceSummary` was changed from `color=\"teal\"` to `color=\"ink\"` even though this plan is otherwise source-free. The pairing 07-UI-SPEC.md line 254 mandates measures 4.24:1 at 12px, below the same document's own ≥4.5:1 contract at line 674 — the two cannot both hold, and the axe assertion this plan is required to add is what forces the choice."
  - "The full `pnpm test:e2e:web` result is recorded as 63/24/2 with the failures attributed, rather than reported as green. Every failure is outside `e2e/events/**` and every one is either the known auth cascade or the separately logged coral-on-coralSoft defect."

requirements-completed: []

duration: ~75min + device acceptance session 2026-08-13
completed: 2026-08-13
status: complete
---

# Phase 07 Plan 15: Addendum E2E Coverage & Validation Closure Summary

**The four addendum user paths are now reproducible end to end in a browser — including a mutation-proved guard that ending a recurrence must not take today's occurrence away — the six addendum test files can no longer be silently disabled, and the validation map's 18 addendum rows are green from real runs rather than from intent.**

> **Task 3 (Android real-device acceptance): Approved 2026-08-13.** User confirmed the device session — 周期筛选 single-select and touch targets, 200% font scroll, 周期规则 home card and merged rule list, rule detail edit (no write before inline confirm), 结束此重复 (today's occurrence survives, rule stays listed as ended), reduced-motion/forced-colors — with no issues reported. No per-step transcript was relayed; recorded as a checkpoint approval per the plan's resume-signal.

## Performance

- **Duration:** ~75 min + device acceptance session
- **Tasks:** 3 of 3
- **Files created:** 1; modified: 4
- **Commits:** 3

## Accomplishments

### Task 1 — `2035e4e` (fix) + `72241f7` (test)

`e2e/events/recurrence-rules.spec.ts`, 458 lines, four tests, no `.skip` / `.todo` / `test.fixme`:

1. **Generation timing (D-11/D-12/D-19).** A `daily`, `count: 5` rule anchored on today materializes **one** row, asserted both against the API and as exactly one task card on screen. Before the per-frequency lookahead this fixture would have produced five rows up front, so the `count: 5` is the point of it. The test also asserts the page contains **no** text matching `/\d+\s*天/` — the runtime form of D-19's ban on naming a fixed horizon.
2. **Recurring-only filter (D-15).** Asserts the container's role really is `radiogroup` (not two loose toggles), that selecting 仅看周期性 removes the one-off task and keeps the recurring one, that the filter button's count goes up by exactly one (read from its accessible name **and** asserted on the visible badge), and that 全部 restores both rows and the original count.
3. **Rule management and ending (D-14/D-16/D-20).** Home card → merged list. Both rows are checked for the type badge **as text**, the frequency summary, and the server-computed 下一次 date. On the detail screen: 结束此重复 is visible and **nothing has been written** — asserted twice against the live API, once before opening the confirm row and once after, so "the trigger only opens a confirm" is verified rather than assumed. After 确认结束 the rule is still in the list and says `这个重复已经结束` in words.
4. **Accessibility.** axe (`wcag2a`/`wcag2aa`/`wcag21aa`, no serious or critical) on **both** new screens — the coverage gap that exists because client Jest's `testMatch` cannot reach `app/**`. Plus: Tab from 结束此重复 lands on 确认结束 and then 取消 (the confirm actions really do follow the trigger in DOM order), and an ended rule's detail carries the state in words (`这个重复已经结束了。`) **and** `aria-disabled="true"` on both write entry points — never opacity alone.

**The D-14 anchor guard was proved, not assumed.** Mutating `endRule`'s anchor from `addDays(currentCalendarDateIn(tz), 1)` to `addDays(…, 0)` and re-running turns test 3 red at exactly the intended assertion:

```
Locator: getByRole('main', { name: '周期规则', exact: true }).getByText('下一次 2026-08-13', { exact: true })
Expected: visible ... element(s) not found
```

The mutation was reverted; `git diff` on `recurrence.service.ts` is empty.

### Task 2 — `c6c9af7`

- **`scripts/check-required-tests.ps1`**: `$requiredTests` 30 → **36**, adding exactly the six addendum files. Existing entries, `$forbiddenPattern`, and the self-test logic are untouched. Both `check-required-tests.ps1` and `-SelfTest` pass.
- **`07-VALIDATION.md`**: the 15 seeded ⬜ addendum rows are now ✅, each after the named command was actually run here; three rows were added (the mutation probe, the audit self-test, and the existing-spec regression), giving **18** addendum rows. A run-record table states what each command actually returned, including the two out-of-scope failures rather than hiding them. Wave 0 addendum checkboxes ticked; the Manual-Only section now explains why the Task 3 checkpoint is a gate and not a manual-only *test*; `nyquist_compliant` and `wave_0_complete` restored to `true`.
- **The 25 pre-existing verification rows are byte-identical.** `git diff … | grep "^-" | grep -c "| ✅ |"` → **0**.

## Task Commits

1. **`2035e4e`** `fix(07-15)` — recurrence summary meets the AA contrast floor
2. **`72241f7`** `test(07-15)` — the addendum web journeys and the two new screens
3. **`c6c9af7`** `docs(07-15)` — required-test manifest + validation map closure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing accessibility correctness] `RecurrenceSummary` failed the AA contrast floor, and the UI-SPEC is what mandated it**

- **Found during:** Task 1, the first axe run against the rule detail screen.
- **Issue:** `RecurrenceSummary` renders `color="teal"` (`#277A72`) on `tealSoft` (`#DCEEEA`) at `variant="caption"` (12px) — measured **4.24:1**, against the ≥4.5:1 required for normal text. axe reports it as a **serious** `color-contrast` violation, which blocked this plan's own acceptance criterion ("no serious/critical violations on either new screen"). 07-UI-SPEC.md line 254 explicitly prescribes this pairing, while line 674 of the same document requires ≥4.5:1 — the spec contradicts itself, exactly as 07-14 found for the 404 copy.
- **Why it had never been caught:** the summary block only renders when the picker's value is non-null. Every screen `e2e/events/accessibility.spec.ts` axe-checks reaches the picker in its default 不重复 state, so the block was never in the tree when axe ran. The rule detail screen is the first surface that renders the picker already seeded from a fetched rule.
- **Fix:** `color="ink"` — **12.2:1**, and the pairing `src/ui/__tests__/contrast-test.ts:50` already guarantees for `tealSoft`. No token changed, no other component touched; the teal information block is visually intact, only its text is legible. Chosen over darkening the accent because that would have meant a new palette token (a design decision, Rule 4) rather than conforming to a contract that already exists.
- **Files modified:** `apps/client/src/features/recurrence/recurrence-summary.tsx`. **Commit:** `2035e4e`.
- **Residual, logged not fixed:** the UI-SPEC line still prescribes the failing pairing — recorded in `deferred-items.md` so a later plan reading the spec does not reintroduce it.

**2. [Rule 3 — Blocking] Strict-mode violations from Expo Router keeping both screens mounted**

- **Found during:** Task 1, first run of tests 3 and 4.
- **Issue:** pushing from the rule list to the rule detail leaves the list in the DOM, so `下一次 2026-08-14` resolved to two elements and Playwright's strict mode failed the test. The same collision applies to `这个重复已经结束`, which both an ended list row and an ended detail screen render.
- **Fix:** two region helpers (`ruleListScreen` / `ruleDetailScreen`) built on `getByRole('main', { name, exact: true })`, and every row locator and text assertion scoped to one of them. `exact: true` is required, not stylistic: accessible-name matching is substring-based by default, so `周期规则` would also have matched `周期规则详情` and reintroduced the ambiguity.
- **Files modified:** `e2e/events/recurrence-rules.spec.ts`. **Commit:** `72241f7`.

### Plan instructions that could not hold as written

**3. Test 3 uses two rules, because the plan's two requirements are mutually exclusive for one**

The plan's test 3 asks to end a rule and then assert both "该规则仍在列表中且显示已结束文案" and "今天那一条任务仍然存在". For a **single** rule these cannot both be true. `endRule` anchors on tomorrow and therefore sets `endsOn = today`; `nextOccurrenceFor` walks **from** today inclusively, so a rule that occurs today still reports `nextOccurrenceDate = today`, and `formatRuleRow` correctly shows `下一次 {today}` rather than the ended copy. The server's own integration test (`recurrence-rules-api.int.test.ts:667`) makes the same point in its fixture comment: it deliberately uses a rule whose occurrences fall strictly after today so that the next occurrence "genuinely becomes null".

Resolution: a **daily task rule anchored today** carries the "today survives" half (and, being still-live, shows `下一次 {today}` — which is itself the visible consequence of the tomorrow anchor), and a **weekly event rule starting tomorrow** carries the "stays listed, marked ended" half. This also strengthens the test: it makes the list genuinely merged (one 任务 rule, one 事件 rule) and lets the D-20 type-badge assertions be real rather than single-typed.

### Acceptance criteria met in substance rather than literal form

- **"在 `07-VALIDATION.md` 的表格末尾追加新行 … 在追加的第一行之前插入一行小标题式的注释行"** — both the addendum comment marker and the 15 ⬜ rows were **already present**, seeded by `/gsd-plan-phase`. The work was therefore to flip them from ⬜ to ✅ against real runs and to add the three rows the plan's own table did not anticipate (mutation probe, audit self-test, existing-spec regression). The end state matches the criterion ("新增验证行数 ≥ 15，且每一行的 Status 列均为 ✅" → 18 rows, all ✅) and the 25 pre-existing rows are provably untouched.
- **`pwsh`** is not on PATH on this machine; the identical script was run through `powershell -NoProfile -File`. Both the audit and `-SelfTest` pass, and the manifest count went 30 → 36 (exactly +6, as the criterion requires).
- **`pnpm test:e2e:web -- <file>`** does not forward the file filter (the same pnpm arg-forwarding quirk 07-10 hit with Jest); it silently runs the whole suite. Focused runs used `npx playwright test <file>`, and the full suite was run separately and recorded in full.

## Issues Encountered

- **Full `pnpm test:e2e:web`: 63 passed, 24 failed, 2 did not run.** All 43 `e2e/events/**` tests pass, including the four new ones. Of the 24 failures, 23 carry the known cascade signature (`locator.fill … waiting for getByLabel('邮箱')` — the login page never loads because the Playwright-managed servers exited after the first auth failure), which is the pre-existing item logged by 07-08. The 24th is genuine and unrelated: see below.
- **`coral` on `coralSoft` fails AA on the household home cards.** `e2e/households/accessibility.spec.ts:136` reports a real serious `color-contrast` violation — `#B94736` on `#F7DDD5` is 4.04:1 — on the `进入 ›` caption of the `打开今日视图` card. Exactly one node; the 周期规则 card added by 07-14 is **not** among them, and the failure is present in the full-suite run taken *before* any change in this plan. Same class as deviation 1 but in a Phase 2/3 file this plan does not touch, and it does not block this plan's gate. Logged in `deferred-items.md`, not fixed.
- **`pnpm --filter api test:integration`: 17/19 files green.** The two failures are the pre-existing SecLists CRLF item (`git ls-files --eol` still reports `i/lf w/crlf` for the denylist fixture). The recurrence scope alone is 5/5 files, 73/73 tests. Logged as a recurrence on the existing entry rather than a new one.
- **Environment:** the worktree had no `node_modules` (`pnpm install --frozen-lockfile`, lockfile unchanged), and the API's `dist/modules/auth/data/` copy had to be run once by hand — the known `apps/api dev` boot defect from 07-08, worked around exactly as that entry prescribes rather than re-diagnosed.

## Verification Results

| Command | Result |
|---------|--------|
| `npx playwright test e2e/events/recurrence-rules.spec.ts` | **4/4 passed** |
| `npx playwright test e2e/events` | **18/18 passed** — new spec + `recurrence.spec.ts` + `accessibility.spec.ts` + `calendar-api.spec.ts`, zero regression |
| Mutation probe (anchor tomorrow → today) | **test 3 fails** at the intended assertion; reverted, `git diff` on `recurrence.service.ts` empty |
| `pnpm --filter api test:quick` | 2 files / 34 tests passed |
| `pnpm --filter api test:integration` (recurrence) | 5 files / 73 tests passed |
| `cd apps/client && pnpm test` | 23 suites / 232 passed, 2 skipped (both pre-existing) |
| `cd apps/client && npx tsc --noEmit` | **0 errors** (the `primitives.tsx:510` error 07-14 logged is no longer present on this base) |
| `pnpm openapi:check` | PASS |
| `powershell -File scripts/check-required-tests.ps1` | PASS — 36 contracts |
| `powershell -File scripts/check-required-tests.ps1 -SelfTest` | PASS |
| Pre-existing validation rows untouched | `git diff … \| grep "^-" \| grep -c "\| ✅ \|"` → **0** |

## Known Stubs

None. No placeholder copy, no hardcoded empty collection, and no disabled or skipped test was introduced. The new spec contains no `.skip`, `.todo`, or `test.fixme`, and all six addendum test files are now guarded against acquiring one.

## Threat Flags

None. This plan added no network surface, no auth path, and no schema change. T-07-49 is satisfied by construction — the spec copies `e2e/events/recurrence.spec.ts`'s `DATABASE_URL` constant and default verbatim rather than introducing a second source. T-07-50 is satisfied by the run-record table: every ✅ corresponds to a command actually executed here. T-07-51 is satisfied and self-verified by `-SelfTest`. T-07-SC: no dependency was added; `pnpm install --frozen-lockfile` restored the committed lockfile unchanged.

## Next Phase Readiness

- **Blocked on Task 3**, the Android real-device checkpoint. It is the only place the two 🧪 backstop items (long template title on a rule row; the 5th filter group at 320px + 200% font) and the physical dimensions the Web tier cannot reach — real touch-target size, system font scaling, `减少动态效果`, `forced-colors` — get confirmed.
- Two contrast items are open in `deferred-items.md` and want one decision, not two fixes: whether an accent colour is ever legal as *text* on its own soft tint. Answering it once covers the 7 `进入 ›` call sites and prevents the UI-SPEC from reintroducing the pairing this plan had to correct.
- The addendum's automated tier is otherwise closed: 18 green validation rows, 36 guarded test contracts, and the only coverage that exists for the two `app/**` screens.

## Self-Check: PASSED

- FOUND: `e2e/events/recurrence-rules.spec.ts`
- FOUND: `.planning/phases/07-recurring-events-tasks/07-15-SUMMARY.md`
- FOUND commit `2035e4e` (Task 1 — contrast fix)
- FOUND commit `72241f7` (Task 1 — E2E spec)
- FOUND commit `c6c9af7` (Task 2 — manifest + validation map)

---
*Phase: 07-recurring-events-tasks*
*Status: complete — all 3 tasks done, Android real-device acceptance approved 2026-08-13*
