---
phase: 07-recurring-events-tasks
plan: 14
subsystem: client
tags: [recurrence, rules, ui, accessibility, timezone, expo-router]

# Dependency graph
requires:
  - phase: 07-recurring-events-tasks (07-12)
    provides: listRecurrenceRules / getRecurrenceRule / endRecurrenceRule and the RecurrenceRuleListItemDto shape (including the server-computed nextOccurrenceDate and the contract sort) this UI renders verbatim
  - phase: 07-recurring-events-tasks (07-13)
    provides: updateRecurrenceRule (PUT) and the tomorrow-in-the-rule's-timezone split anchor the detail screen's startDate must mirror
  - phase: 07-recurring-events-tasks (07-04/07-05)
    provides: RecurrencePicker, recurrenceInputFromResponse, formatRecurrenceSummary — reused unchanged
provides:
  - "app/(protected)/households/[id]/recurrence-rules — merged task+event rule list, rendered in server order, ended rules included"
  - "app/(protected)/households/[id]/recurrence-rules/[ruleId] — rule-level edit + 结束此重复, both behind two-step inline confirms"
  - "src/features/recurrence/recurrence-rule-row.tsx: formatRuleRow / RecurrenceRuleRow / nextDayIsoIn — the Jest-reachable formatting, row rendering, and split-anchor computation"
  - "src/features/recurrence/recurrence-kind-badge.tsx: RecurrenceKindBadge / recurrenceKindLabel — icon + text type badge"
  - "家庭首页第 7 张快捷卡片（周期规则）"
affects: [07-15, any later client surface that needs a rule-timezone calendar anchor (nextDayIsoIn is now the single source), any change to the recurrence summary wording (formatRuleRow extends it rather than forking it)]

# Actuals (#2632)
# chars/4 over the realized diff (git diff a4dadcdb..HEAD, added lines).
actuals:
  tokens: 11200
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Every rule-shaped response goes through recurrenceInputFromResponse before formatRecurrenceSummary. The formatter takes the REQUEST shape (absent = undefined) while the rule endpoints return the RESPONSE shape (absent = null), and `null !== undefined` means the raw object renders a literal '，到 null 为止' at the user. Proved by mutation, not assumed: feeding the raw rule in fails 5 assertions."
    - "Formatting and status judgement live in src/features/recurrence/ because client Jest's testMatch only covers src/**/__tests__/**. Screens under app/ are structurally untestable, so they stay thin fetch-and-arrange layers — the list screen contains zero formatting, zero sorting, and zero date computation."
    - "The 'first load only' spinner flag is a ref, not state. As state it changes the fetch callback's identity the instant the first load resolves, and useFocusEffect then fires a second pointless request on every arrival."
    - "A rule-level scope is decided by construction, so it is a permanently visible note plus one inline confirm — not a sheet. SeriesScopeSheet gains no fourth mode; a sheet whose only live option is preselected is noise, not consent."

key-files:
  created:
    - apps/client/src/features/recurrence/recurrence-kind-badge.tsx
    - apps/client/src/features/recurrence/recurrence-rule-row.tsx
    - apps/client/src/features/recurrence/__tests__/recurrence-rule-row-test.tsx
    - apps/client/app/(protected)/households/[id]/recurrence-rules/index.tsx
    - apps/client/app/(protected)/households/[id]/recurrence-rules/[ruleId]/index.tsx
  modified:
    - apps/client/app/(protected)/households/[id]/index.tsx
    - .planning/phases/07-recurring-events-tasks/deferred-items.md

key-decisions:
  - "The 404 detail copy is '这条周期规则不存在，或者你已经看不到它了。' rather than the spec's '…已经被移除了。'. Two of this plan's own gates grep the whole file for 删除/移除/清空 and require zero, which the spec's wording violates. The reworded copy also serves T-07-46 better: asserting a removal confirms the rule once existed, whereas a 404 may equally mean the ruleId belongs to another household. See Deviations."
  - "The picker is seeded from the fetched rule only while there is nothing to lose (`setRecurrence((current) => current ?? …)`). A focus refetch after a failed write must not overwrite the edits the user is still looking at — that would be the second time the same change was taken away from them."
  - "startDate is a useMemo'd anchor variable rather than an inline nextDayIsoIn(...) call. The task asked for both, and they are mutually exclusive; stability won, because an unstable startDate is exactly what the picker's startsOn-sync effect turns into a rewrite of the user's selection on every render."
  - "The save CTA is additionally disabled when the picker reports invalid or the value is null. 'Not repeating' is not a rule-level edit — it is what 结束此重复 exists for — and a null recurrence against a DTO whose single field is required is a guaranteed 400."

requirements-completed: [RECR-01, RECR-02]

coverage:
  - id: D1
    description: "The null trap (07-UI-SPEC.md line 81): a response-shaped rule with endsOn: null and count: null renders a summary containing no literal 'null', and gains the 永不结束 suffix."
    requirement: "RECR-01"
    verification:
      - kind: unit
        ref: "apps/client/src/features/recurrence/__tests__/recurrence-rule-row-test.tsx#never renders a literal null when both bounds are absent, and appends 永不结束"
        status: pass
      - kind: other
        ref: "Mutation probe: replacing `formatRecurrenceSummary(normalized, …)` with `formatRecurrenceSummary(rule, …)` fails 5 assertions with `Received string: 每周二、四、六重复，到 null 为止，永不结束` — the exact defect the spec warns about."
        status: pass
    human_judgment: false
  - id: D2
    description: "The 永不结束 suffix appears only when the rule has neither an end date nor a count; an existing bound is already spelled out inside the summary and the word must not appear."
    requirement: "RECR-01"
    verification:
      - kind: unit
        ref: "…#omits the 永不结束 suffix when the rule has an end date / #omits the 永不结束 suffix when the rule has a count"
        status: pass
    human_judgment: false
  - id: D3
    description: "The row's summary and the detail screen's 重复 block come from one source: formatRuleRow's summary is the shared formatRecurrenceSummary output plus (at most) the suffix, asserted by prefix."
    verification:
      - kind: unit
        ref: "…#derives its summary from the same source the detail block uses"
        status: pass
    human_judgment: false
  - id: D4
    description: "The next occurrence comes only from the server. When it is null the row says '这个重复已经结束' in words — never a blank, a null, or a placeholder dash — and opacity is therefore not the only signal."
    requirement: "RECR-01"
    verification:
      - kind: unit
        ref: "…#renders the server-computed next occurrence when one exists / #renders the ended copy — never a blank, a null, or a placeholder dash"
        status: pass
      - kind: unit
        ref: "…#says an ended rule has ended in words, not only through opacity (rendered)"
        status: pass
      - kind: other
        ref: "grep for any date arithmetic in the list screen: `formatRecurrenceSummary|recurrenceInputFromResponse|\\.sort(` — 0 matches"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-20 merged list: the type badge carries its semantics in text (任务 / 事件), both icon and label are inkMuted, and a rule whose kind cannot be derived degrades to no badge and a type-free accessible name rather than a guess."
    requirement: "RECR-01"
    verification:
      - kind: unit
        ref: "…#labels a task rule… / #labels an event rule… / #degrades to a type-free accessible name when the kind cannot be derived / #omits the badge entirely when the kind cannot be derived"
        status: pass
      - kind: unit
        ref: "…#carries its semantics in text, so colour is never the only cue"
        status: pass
    human_judgment: false
  - id: D6
    description: "nextDayIsoIn reads the calendar day in the RULE's timezone and adds a day without the device offset participating — the anchor the detail screen hands the picker, and the same anchor the server uses for both writes."
    requirement: "RECR-02"
    verification:
      - kind: unit
        ref: "…#reads the calendar day in the rule timezone, not the device one (Asia/Shanghai ahead of UTC, Pacific/Midway behind it) / #rolls over a month end / #rolls over a year end"
        status: pass
      - kind: other
        ref: "Mutation probe: hardcoding timeZone: 'UTC' fails with `Expected 2026-08-14, Received 2026-08-13` — the timezone argument is load-bearing, not decorative."
        status: pass
    human_judgment: false
  - id: D7
    description: "The long-title contract: the row title is capped at two lines while the accessible name keeps the whole string."
    verification:
      - kind: unit
        ref: "…#keeps the long title to two lines while the accessible name keeps it whole"
        status: pass
    human_judgment: false
  - id: D8
    description: "T-07-48 (confirm-before-write): the detail screen makes exactly three sessionApiClient calls — one read and two writes — and both writes sit inside confirm handlers; the triggers only toggle a confirm row's visibility."
    requirement: "RECR-02"
    verification:
      - kind: other
        ref: "grep -c 'sessionApiClient\\.' on the detail screen — 3; handleConfirmSave / handleConfirmEnd hold the two writes, onPress of 保存更改 and 结束此重复 are setSaveConfirmOpen(true) / setEndConfirmOpen(true)"
        status: pass
    human_judgment: false
  - id: D9
    description: "T-07-45 (end mistaken for delete): none of the four new/edited client files contains 删除, 移除, or 清空 anywhere — copy, accessible names, and error strings included."
    requirement: "RECR-02"
    verification:
      - kind: other
        ref: "grep -cE '删除|移除|清空' on both screens plus recurrence-rule-row.tsx and recurrence-kind-badge.tsx — 0, 0, 0, 0"
        status: pass
      - kind: other
        ref: "grep -rcE '删除|移除|清空' over app/(protected)/households/[id]/recurrence-rules/ — 0 for both files (plan-level verification)"
        status: pass
    human_judgment: false
  - id: D10
    description: "The picker receives the split anchor, never the rule's original startsOn — the documented way to avoid the component's startsOn-sync effect fighting the form."
    requirement: "RECR-02"
    verification:
      - kind: other
        ref: "startDate={anchor} where anchor = useMemo(() => nextDayIsoIn(rule.timezone), [rule]); the only two `startsOn` occurrences in the file are comments explaining why it is not used"
        status: pass
    human_judgment: false
  - id: D11
    description: "T-07-47 (no optimistic updates) and the failure contract: neither write path mutates local state on success — both return to the list, whose useFocusEffect re-reads authoritative state; on failure a Banner states plainly that nothing changed and every picker edit is retained."
    requirement: "RECR-02"
    verification:
      - kind: other
        ref: "handleConfirmSave / handleConfirmEnd call backToList() on success and setWriteError(...) on failure; neither touches setRule or setRecurrence in either branch"
        status: pass
    human_judgment: false
  - id: D12
    description: "T-07-44 (client copying the permission decision): no action is pre-hidden or pre-disabled on a permission basis; 403 is surfaced only after the server rejects, through the Banner."
    requirement: "RECR-02"
    verification:
      - kind: other
        ref: "The only disabled conditions are `ended`, `busy`, an open confirm row, and picker invalidity — none derived from role or createdBy (neither of which the rule DTO carries)"
        status: pass
    human_judgment: false
  - id: D13
    description: "Guard ordering matches labels/index.tsx item for item, so 'removed from the household' cannot degrade into 'page unavailable'."
    verification:
      - kind: other
        ref: "grep -n on both files: 登录已过期。 → AccessChangedPanel → 这个页面暂时无法访问。 at lines 68/121/135 (new) vs 66/169/183 (reference) — identical relative order"
        status: pass
    human_judgment: false
  - id: D14
    description: "Zero new dependencies and zero regression on the locked recurrence contracts."
    verification:
      - kind: other
        ref: "git diff --stat on apps/client/package.json, recurrence-picker.tsx, series-scope-sheet.tsx, recurrence-badge.tsx, event-card.tsx, task-card.tsx — all empty; grep -c SeriesScopeSheet on the detail screen — 0"
        status: pass
      - kind: other
        ref: "All three new icons resolve through the existing exact-subpath convention (lucide-react-native/icons/{repeat,list-todo,calendar}); grep -cE on the badge file — 2"
        status: pass
    human_judgment: false
  - id: D15
    description: "200% font / 320px-equivalent horizontal-scroll behaviour under a long title + long summary + long IANA timezone name."
    verification:
      - kind: manual
        ref: "Backstop per the plan's own `verification: backstop` marker — the row wraps the badge+title group (flexWrap + flexShrink) and gives the summary and 下一次 their own lines, but no automated viewport assertion exists in the client suite."
        status: deferred
    human_judgment: true

duration: 30min
completed: 2026-08-13
status: complete
---

# Phase 7 Plan 14: Recurrence Rule Management UI Summary

**"Which recurrences did I set up" and "how do I make one stop" are now answerable: a merged task+event rule list reachable from the home screen, and a rule detail screen where changing the frequency or ending the whole recurrence are both single, confirm-first operations whose scope is decided by construction rather than by a sheet.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3
- **Files created:** 5; modified: 2
- **Commits:** 3

## Accomplishments

### Task 1 — `1178a16` (tracer, TDD)

- **`recurrence-kind-badge.tsx`** — `RecurrenceKindBadge` and the `recurrenceKindLabel` helper. Icon *and* text, both `inkMuted`: in a merged list, colour must never be the thing that tells a task rule from an event rule (D-20's accessibility floor). Both icons come through the existing exact-subpath import form the Jest `moduleNameMapper` depends on.
- **`recurrence-rule-row.tsx`** — three exports, all pure or presentational:
  - `formatRuleRow(rule, deviceTimeZone)` normalizes through `recurrenceInputFromResponse` **before** `formatRecurrenceSummary`. This is the whole point of the module: the formatter takes the request shape (absent bounds are `undefined`) while the rule endpoints return the response shape (absent bounds are `null`), and handing it the raw object renders a literal `，到 null 为止` at the user.
  - `nextDayIsoIn(timeZone, now)` — the split anchor, and now the single source of "tomorrow in a rule's own timezone" on the client. It reads the calendar day via `Intl.DateTimeFormat('en-CA', { timeZone })` and then adds one day through `Date.UTC`, so the device's offset never participates in either step.
  - `RecurrenceRuleRow` — a pressable card that renders only what `formatRuleRow` returned. It issues no requests and computes no dates.
- **19 Jest cases**, and both designated core regressions were **verified load-bearing by mutating the implementation** rather than merely observed green (see coverage D1 and D6).

### Task 2 — `35a4fbb`

- **The list screen.** A deliberately thin layer: it fetches, guards, and arranges. It contains no formatting, no status judgement, and **no client-side sort** — the server already orders unresolved-first by next occurrence and ended-last by title, and a second copy of that contract here is a copy that will drift.
- Guard branches copied from `labels/index.tsx` item for item and in the same order, because reordering them turns "you were removed from this household" into the far less useful "this page is unavailable".
- `useFocusEffect` refetches on every arrival, so returning from the detail screen after ending or editing a rule shows authoritative state immediately. The spinner is first-load-only, so that refetch never blanks the list on the way to the same list.
- **The 7th home card**, between 标签管理 and 家庭笔记. Geometry copied from the labels card with no new style object; `Repeat` in `teal` — the same icon `RecurrenceBadge` already uses, so the entry point and the per-item badge read as one concept, and teal because the home screen's coral budget is already spent on three cards.

### Task 3 — `c5ebf4a`

- **The detail screen.** Title (never truncated) → type badge + next-occurrence line → the 重复 block (summary, month-end clamp note, timezone note, all straight from `formatRuleRow`) → the picker → a permanently visible scope note → 保存更改 → 结束此重复.
- **`startDate` is the split anchor**, memoized. The picker contains an effect that force-syncs `value.startsOn` to whatever `startDate` it is handed; passing the rule's original start date would make it rewrite the user's selection on every render.
- **Both writes are confirm-first.** The triggers only toggle a confirm row's visibility; `updateRecurrenceRule` and `endRecurrenceRule` are reachable only from the confirm handlers. The screen makes exactly three `sessionApiClient` calls in total. While a write is in flight the confirm row stays open and the picker plus all four actions are disabled.
- **No `SeriesScopeSheet`, and no fourth mode added to it.** A rule-level edit can only mean "this and everything after", so the scope is stated permanently in place. The three published modes are untouched.
- **Failure keeps the user's work.** No optimistic updates anywhere: success returns to the list and lets it re-read the server, failure shows a `Banner` saying plainly that nothing changed while every picker edit stays on screen. 403 gets its own copy on both paths — but nothing is pre-hidden, because the client does not hold a copy of the permission decision (and the rule DTO deliberately carries no `createdBy`).
- **Ended rules stay readable.** Every write entry point is disabled with `accessibilityState={{ disabled: true }}` and an explanation; the summary and history remain visible rather than hidden or redirected away.

## Task Commits

1. **Task 1: 可测的规则行格式化与类型徽标** — `1178a16` (feat)
2. **Task 2: 周期规则列表屏与家庭首页入口卡片** — `35a4fbb` (feat)
3. **Task 3: 规则详情屏 —— 规则级编辑与结束此重复** — `c5ebf4a` (feat)

## Files Created/Modified

- `apps/client/src/features/recurrence/recurrence-kind-badge.tsx` — **new**; `RecurrenceKindBadge`, `recurrenceKindLabel`
- `apps/client/src/features/recurrence/recurrence-rule-row.tsx` — **new**; `formatRuleRow`, `FormattedRuleRow`, `RecurrenceRuleRow`, `nextDayIsoIn`
- `apps/client/src/features/recurrence/__tests__/recurrence-rule-row-test.tsx` — **new**; 19 cases
- `apps/client/app/(protected)/households/[id]/recurrence-rules/index.tsx` — **new**; list screen
- `apps/client/app/(protected)/households/[id]/recurrence-rules/[ruleId]/index.tsx` — **new**; detail screen
- `apps/client/app/(protected)/households/[id]/index.tsx` — `Repeat` import, `handleOpenRecurrenceRules`, the 7th card
- `.planning/phases/07-recurring-events-tasks/deferred-items.md` — one new deferred finding

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Plan contradicts itself] The 404 copy avoids the banned word 移除**

- **Found during:** Task 3, writing the detail fetch's error branch
- **Issue:** Two of this plan's own gates — Task 3's acceptance criterion and the plan-level `<verification>` block — grep the **whole file** for `删除|移除|清空` and require **0**. But `07-UI-SPEC.md` line 628 mandates the 404 copy `这条周期规则不存在，或者已经被移除了。`, which contains `移除`. Both cannot hold. (The spec's own ban at line 644 is scoped to "本路径" — the 结束此重复 path — so the plan's file-wide grep is strictly stricter than the rule it enforces.)
- **Fix:** `这条周期规则不存在，或者你已经看不到它了。` This satisfies both gates, and is a genuine improvement rather than a compromise: a 404 from this endpoint means the id is unknown **or belongs to another household**, and "已经被移除了" asserts the rule once existed and was taken away — which is precisely the existence signal **T-07-46** exists to suppress. The replacement claims nothing about whether the rule ever existed, only what is true from the user's side.
- **Files modified:** `app/(protected)/households/[id]/recurrence-rules/[ruleId]/index.tsx`
- **Committed in:** `c5ebf4a`

**2. [Rule 1 — Bug] The list screen's first-load flag is a ref, not state**

- **Found during:** Task 2, wiring `useFocusEffect`
- **Issue:** The plan says to use `setLoading(true)` only for the first load. Holding that "have I loaded once" flag in `useState` puts it in `fetchRules`'s dependency array, so the callback's identity changes the instant the first load resolves — and `useFocusEffect` re-runs whenever its callback changes. Every arrival at the screen would therefore fire two requests instead of one.
- **Fix:** `const loadedOnce = useRef(false)`, keeping `fetchRules` dependent only on `householdId`. Same behaviour for the user (spinner on first load, stale list preserved on refetch), one request per arrival.
- **Files modified:** `app/(protected)/households/[id]/recurrence-rules/index.tsx` (and the same pattern in the detail screen)
- **Committed in:** `35a4fbb`, `c5ebf4a`

**3. [Rule 2 — Missing validation] The save CTA is also disabled for an invalid or null recurrence**

- **Found during:** Task 3, wiring the picker
- **Issue:** The picker offers 不重复, which sets its value to `null`. `UpdateRecurrenceRuleDto` has exactly one field and it is required (`@IsDefined()`, added in 07-13), so submitting `null` is a guaranteed 400 — and the user's actual intent in that case is 结束此重复, which is a different button on the same screen. The picker's own `onValidityChange` was likewise unused, so an out-of-range count could be submitted.
- **Fix:** `disabled={ended || busy || saveConfirmOpen || recurrence === null || !pickerValid}`, with `onValidityChange` wired through a `useCallback`. No copy added — the picker already explains its own validation errors in place.
- **Files modified:** `app/(protected)/households/[id]/recurrence-rules/[ruleId]/index.tsx`
- **Committed in:** `c5ebf4a`

**4. [Rule 3 — Blocking] The worktree had no `node_modules`**

- **Found during:** Task 1, before the first test run
- **Issue:** identical to what 07-13 reported — a fresh worktree checkout carries no installed dependencies.
- **Fix:** `pnpm install --frozen-lockfile`. This restores the committed lockfile and is not a package install in the sense the executor's supply-chain rule guards; no dependency was added, and the lockfile is unchanged.
- **Committed in:** n/a (no file change)

### Acceptance criteria whose literal form was unsatisfiable

Both are met in intent and verified by a corrected command; neither changed what was built.

- **`grep -c "useFocusEffect" … 为 1`** counts *lines*, and any correct usage needs an import line plus a call line — `labels/index.tsx`, the file the criterion points at as the model, itself scores 2. Verified instead as **exactly one call site**: `grep -c 'useFocusEffect(' ` → **1**.
- **"`startDate=` 的取值表达式包含 `nextDayIsoIn`"** contradicts the same task's explicit instruction to `useMemo` the anchor "避免每次渲染重新计算导致的抖动". Stability won, because an unstable `startDate` is exactly what the picker's sync effect converts into a rewrite of the user's selection. `startDate={anchor}` with `anchor = useMemo(() => nextDayIsoIn(rule.timezone), [rule])`; the file's only two `startsOn` occurrences are comments explaining why it is not used.

### Tracer feedback gate

Task 1 is a `type="tracer"` task, and the gate ran as the automated one: the plan declares `autonomous: true` and contains no checkpoint tasks, and Task 1's output is a pure formatting module with no user-observable surface until Task 2 renders it — a human-verify checkpoint there would have asked the user to confirm a passing Jest suite. The tracer's `<verify>` was re-run after its commit (19/19 green) and its two core assertions were additionally proved load-bearing by mutation before any expansion task began.

---

**Total deviations:** 4 auto-fixed (1 plan self-contradiction resolved in favour of the threat model, 1 refetch-loop bug, 1 validation hardening, 1 environment restore) + 2 acceptance criteria met in intent rather than literal form.
**Impact on plan:** none on delivered behaviour. Every `must_haves` truth and every artifact in the plan is present.

## Issues Encountered

- **Pre-existing `apps/client` typecheck error**, logged in `deferred-items.md`: `src/ui/primitives.tsx(510,35)` — `StatusPanel` passes `tabIndex` to `Heading`, whose props do not model that Web-only escape hatch. It is the **only** error the client typecheck reports, the file is not in this plan's `files_modified`, and `git status --short` confirms it is unmodified here. Adding files under `src/features/recurrence/` and `app/` cannot influence the types `StatusPanel` resolves. Not fixed, per the scope-boundary rule.
- **Two pre-existing skipped tests** in `src/features/households/__tests__/invitation-lifecycle-test.tsx` (`ConfirmationPage` rendering and busy-state cases). Unrelated to recurrence and untouched here; noted so the suite's `2 skipped` line is not mistaken for something this plan introduced.

## Verification Results

- `cd apps/client && npx jest --runInBand` — **PASS**, 23/23 suites, 232 passed / 2 skipped (both pre-existing, above). The new file contributes 19 passing cases.
- `cd apps/client && npx tsc --noEmit` — one error, the pre-existing `primitives.tsx` one described above. **Zero** errors in any file this plan created or modified.
- `git diff --stat apps/client/package.json` — **empty** (zero new dependencies)
- `git diff --stat` on `recurrence-picker.tsx`, `series-scope-sheet.tsx`, `recurrence-badge.tsx`, `event-card.tsx`, `task-card.tsx` — **all empty** (zero regression on published contracts)
- `grep -rcE "删除|移除|清空" "app/(protected)/households/[id]/recurrence-rules/"` — **0** for both files; the same grep over `recurrence-rule-row.tsx` and `recurrence-kind-badge.tsx` — **0**
- `grep -c "sessionApiClient\."` on the detail screen — **3** (one read, two writes)
- `grep -c 'accessibilityLiveRegion="polite"'` on the detail screen — **2**
- `grep -c "SeriesScopeSheet"` on the detail screen — **0**
- `grep -c "recurrenceInputFromResponse"` on `recurrence-rule-row.tsx` — **3**; no call passes a raw `rule` to `formatRecurrenceSummary`
- `grep -cE "lucide-react-native/icons/(list-todo|calendar)"` on the badge — **2**
- `<Pressable` count on the home screen — **6 → 7** (exactly one card added)
- Guard ordering vs `labels/index.tsx` — identical relative order, confirmed by `grep -n` on both files

## Known Stubs

None. Every screen renders live data from the rule sub-resource, and no placeholder copy or hardcoded empty collection was introduced.

## Next Phase Readiness

- The rule management surface is complete end to end: home card → merged list → detail → edit or end → back to a list that re-reads authoritative state.
- `nextDayIsoIn` is now the client's single source for "tomorrow in a given IANA timezone" and mirrors the anchor both server write paths use. Any future change to that anchor is a two-site change (server `recurrence.service.ts`, client `recurrence-rule-row.tsx`) and the two are named after each other in comments.
- **One backstop remains open (coverage D15):** the 200% font / 320px-equivalent no-horizontal-scroll requirement for both new screens has no automated assertion. The layout was built for it (badge+title wrap, summary and 下一次 on their own lines, title capped at two lines with the full string kept in the accessible name), but it is unverified by machine and is the natural candidate for the phase's UAT or a `/gsd-ui-review` pass.
- Zero new dependencies, zero changes to published recurrence components, zero Prisma migrations.

## Self-Check: PASSED

- FOUND: `apps/client/src/features/recurrence/recurrence-kind-badge.tsx`
- FOUND: `apps/client/src/features/recurrence/recurrence-rule-row.tsx`
- FOUND: `apps/client/src/features/recurrence/__tests__/recurrence-rule-row-test.tsx`
- FOUND: `apps/client/app/(protected)/households/[id]/recurrence-rules/index.tsx`
- FOUND: `apps/client/app/(protected)/households/[id]/recurrence-rules/[ruleId]/index.tsx`
- FOUND: commit `1178a16` (Task 1)
- FOUND: commit `35a4fbb` (Task 2)
- FOUND: commit `c5ebf4a` (Task 3)

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-13*
