---
phase: 07
slug: recurring-events-tasks
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
# D-01..D-10 (plans 07-01..07-08) remain fully validated — every ✅ row below was a real green run
# on 2026-08-12. The D-11..D-20 addendum (plans 07-09..07-15) was executed and its rows were flipped
# to ✅ by 07-15 Task 2 on 2026-08-13, each after the named command was actually run; both flags are
# therefore restored. The two known out-of-scope failures (legacy auth Web E2E cascade; SecLists
# CRLF on Windows) are logged in deferred-items.md and are not part of this phase's map.
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-12
updated: 2026-08-13
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (API)** | Vitest 4.1.10, two named projects: `unit` and `integration` |
| **Config file (API)** | `apps/api/vitest.config.ts` |
| **Framework (client)** | Jest 30.4.2 + `jest-expo` 57.0.3 + `@testing-library/react-native` 14.0.1 |
| **Config file (client)** | `apps/client/jest.config.js` (glob uses `-test` suffix, not `.test.`) |
| **E2E** | Playwright 1.62.1, `playwright.config.ts` at repo root, specs under `e2e/<domain>/*.spec.ts` |
| **Quick run command** | `pnpm --filter api test:quick` (unit project only — no DB) |
| **Full suite command** | `pnpm test` (all workspaces) + `pnpm --filter api test:integration` + `cd apps/client && pnpm test` + `pnpm test:e2e:web` |
| **Estimated runtime** | Quick: <5s (pure date module, no DB). Full: several minutes (integration project is `fileParallelism: false`). |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter api test:quick` + `pnpm --filter api typecheck` + `cd apps/client && pnpm typecheck`
- **After every plan wave:** `pnpm --filter api test:integration` + `cd apps/client && pnpm test` + `pnpm openapi:check`
- **Before `/gsd-verify-work`:** `pnpm test` + `pnpm test:integration` + `pnpm test:e2e:web` + `pnpm openapi:check` all green
- **Max feedback latency:** ~5s (unit tier — the pure `recurrence-date.ts` module is deliberately zero-infrastructure so date-math regressions surface immediately)

---

## Per-Task Verification Map

Populated by `/gsd-plan-phase 7` (2026-08-12) and verified by 07-08 Task 2. Each row names the plan + task that owns it; ✅ records a focused green run on 2026-08-12.

**Re-verified 2026-08-13** (07-08 SUMMARY run, on the post-wave-4 tree that includes 07-09…07-13). The two e2e rows were re-run and are green again, but only after fixing two regressions that the addendum plans introduced into already-✅ rows — see the 07-08 SUMMARY deviations:

1. `e2e/events/accessibility.spec.ts` went **red**: 07-10's recurring-filter chips emitted `role="radio"` with no `aria-checked` (critical `aria-required-attr`). Fixed in `bd6a887`.
2. `e2e/events/recurrence.spec.ts` went **red**: 07-09's per-frequency lookahead (D-11/D-12) means a daily `count: 4` rule no longer materializes four rows up front. 07-09 repaired the equivalent assumption in `recurrence-rules.int.test.ts` but did not re-run the e2e tier. Spec realigned in `62440c2`.

Both are recorded here because a ✅ row is only meaningful as of the last run — the addendum waves changed behavior under rows that were signed off earlier, and neither regression was caught until this tier was actually re-executed.

| Requirement | Behavior | Test Type | Automated Command | File (Wave 0) | Owner | Status |
|-------------|----------|-----------|--------------------|---------------|-------|--------|
| RECR-01 | Daily walk, `interval`, ISO parse/format round-trip | unit | `pnpm --filter api test:quick` | `apps/api/src/modules/recurrence/recurrence-date.test.ts` | 07-01 T2 | ✅ |
| RECR-01 | Weekly-with-selected-weekdays walk; `interval` respected | unit | `pnpm --filter api test:quick` | same file | 07-02 T1 | ✅ |
| RECR-01 | Month-end clamping across leap/non-leap years (D-09) | unit | `pnpm --filter api test:quick` | same file | 07-02 T1 | ✅ |
| RECR-01 | Local wall-time → UTC across DST spring-forward/fall-back (D-10) | unit | `pnpm --filter api test:quick` | same file | 07-02 T1 | ✅ |
| RECR-01 | `endsOn` XOR `count` termination (D-06) | unit | `pnpm --filter api test:quick` | same file | 07-02 T1 | ✅ |
| RECR-01 | `POST .../tasks` with `recurrence` creates rule + N instances (nested DTO not stripped) | integration | `pnpm --filter api test:integration` | `apps/api/test/recurrence/recurrence-rules.int.test.ts` | 07-01 T2 | ✅ |
| RECR-01 | `POST .../tasks` with `recurrence` copies `TaskAssignee`/`TaskLabel` per instance | integration | `pnpm --filter api test:integration` | same file | 07-01 T2 | ✅ |
| RECR-01 | D-06 mutual exclusion rejected with `VALIDATION_FAILED` (DTO + DB CHECK) | integration | `pnpm --filter api test:integration` | same file | 07-01 T2 | ✅ |
| RECR-01 | Non-member gets `404 HOUSEHOLD_NOT_FOUND` on every recurrence route (SAFE-01) | integration | `pnpm --filter api test:integration` | same file | 07-01 T2 / 07-03 T3 / 07-04 T3 | ✅ |
| RECR-01 | `POST /households/:id/events` with `recurrence` creates rule + N instances; duration constant | integration | `pnpm --filter api test:integration` | same file | 07-03 T3 | ✅ |
| RECR-01 | Cancelled event excluded from `list()` but resolvable via `getById`; list carries `materializedThrough` | integration | `pnpm --filter api test:integration` | same file | 07-03 T3 | ✅ |
| RECR-01 | Invalid IANA timezone → 400 (not 500); `count` over cap → 400 | integration | `pnpm --filter api test:integration` | same file | 07-03 T3 | ✅ |
| RECR-01 | Materializer run twice creates zero extra rows (D-03 idempotency) | integration | `pnpm --filter api test:integration` | `apps/api/test/recurrence/materializer.int.test.ts` | 07-02 T2 | ✅ |
| RECR-01 | Watermark advances; second run within horizon is a no-op; per-run row cap enforced | integration | `pnpm --filter api test:integration` | same file | 07-02 T2 | ✅ |
| RECR-02 | "仅此一次" edit doesn't affect siblings; cancelled date not regenerated | integration | `pnpm --filter api test:integration` | `recurrence-rules.int.test.ts` | 07-04 T3 | ✅ |
| RECR-02 | `PUT` task with `status: 'cancelled'` returns 200 (enum fan-out) | integration | `pnpm --filter api test:integration` | same file | 07-04 T3 | ✅ |
| RECR-02 | "此后所有" split: old `endsOn`=date−1, new rule created, future replaced, past untouched | integration | `pnpm --filter api test:integration` | same file | 07-04 T3 | ✅ |
| RECR-02 | Split is atomic — forced mid-split failure leaves old rule unmodified (D-08) | integration | `pnpm --filter api test:integration` | same file | 07-04 T3 | ✅ |
| RECR-02 | Cross-household `/series` call → 404 (not 403); MEMBER over another's item → 403 | integration | `pnpm --filter api test:integration` | same file | 07-04 T3 | ✅ |
| RECR-01 | Recurrence summary formatting: 4 freqs × 3 end conditions, clamp note, tz note | client unit | `cd apps/client && pnpm test` | `apps/client/src/features/recurrence/__tests__/recurrence-summary-test.tsx` | 07-05 T1 | ✅ |
| RECR-01 | Recurrence picker: default 不重复, weekday never empty, end-condition mutual exclusion, a11y roles | client unit | `cd apps/client && pnpm test` | `apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx` | 07-05 T2 | ✅ |
| RECR-02 | Cancelled task excluded from Today's 今日待办 and from overdue; status cycle is a no-op | client unit | `cd apps/client && pnpm test` | `apps/client/src/features/tasks/__tests__/task-status-test.tsx` | 07-06 T3 | ✅ |
| RECR-02 | Scope dialog: zero writes before choice, exactly 仅此一次/此后所有, per-mode focus, failure keeps it open | client unit | `cd apps/client && pnpm test` | `.../__tests__/series-scope-dialog-test.tsx` | 07-07 T1 | ✅ |
| RECR-01/02 | E2E web: create recurring event, verify instances on calendar, split series, cancel one occurrence | e2e | `pnpm test:e2e:web` | `e2e/events/recurrence.spec.ts` | 07-08 T1 | ✅ |
| RECR-01/02 | Event-side axe + keyboard + scope-sheet focus trap / Esc (closes the Phase 3 gap) | e2e | `pnpm test:e2e:web` | `e2e/events/accessibility.spec.ts` | 07-08 T2 | ✅ |
| — (regression) | OpenAPI hand-maintained client (`packages/api-client`) matches committed tree after recurrence fields added | contract | `pnpm openapi:check` | n/a — existing check | 07-03 T2 / 07-04 T3 | ✅ |
| — (regression) | Required-test manifest covers all 7 new test files and rejects skip markers | script | `pwsh -File scripts/check-required-tests.ps1` | `scripts/check-required-tests.ps1` | 07-08 T2 | ✅ |
<!-- Addendum (D-11 … D-20), planned 2026-08-13 by /gsd-plan-phase 07. Rows below were seeded ⬜ and
     flipped to ✅ by 07-15 Task 2 on 2026-08-13, each after the named command was actually run in
     this worktree. The 25 rows above are the D-01..D-10 record and must not be edited. -->
| RECR-01 | `currentCalendarDateIn` across UTC+14 / UTC−11 / a DST transition day (D-11, D-10) | unit | `pnpm --filter api test:quick` | `apps/api/src/modules/recurrence/recurrence-date.test.ts` | 07-09 T1 | ✅ |
| RECR-01 | Daily rule materializes on its own timezone's calendar day; weekly 6-day lookahead is inclusive (D-11) | integration | `pnpm --filter api test:integration` | `apps/api/test/recurrence/lookahead.int.test.ts` | 07-09 T1 | ✅ |
| RECR-01 | Watermark is forward-only; every pre-existing future instance survives the horizon change (D-13) | integration | `pnpm --filter api test:integration` | same file | 07-09 T2 | ✅ |
| RECR-01 | Rules whose `endsOn` has passed leave the scan set and stop poisoning the household `_min` watermark (D-18 / IN-04) | integration | `pnpm --filter api test:integration` | same file | 07-09 T2 | ✅ |
| RECR-01 | Create is one standard generation pass: daily yields today only, weekly outside the window yields the seed row only (D-12, D-17) | integration | `pnpm --filter api test:integration` | same file | 07-09 T3 | ✅ |
| RECR-01 | `?recurring=true` / `=false` / absent on both task and event lists; non-member still gets 404 (D-15, SAFE-01) | integration | `pnpm --filter api test:integration` | `apps/api/test/recurrence/recurring-filter.int.test.ts` | 07-11 T1 / T2 | ✅ |
| RECR-01 | Client recurring-only predicate + generation-window three-state classifier, suppression rules, zero-day-count copy (D-15, D-19) | client unit | `cd apps/client && pnpm test` | `apps/client/src/features/recurrence/__tests__/recurring-filter-test.tsx` | 07-10 T1 | ✅ |
| RECR-01 | `nextOccurrenceFor` with count exhausted / `endsOn` past / a yearly rule 300 days out (D-16) | unit | `pnpm --filter api test:quick` | `apps/api/src/modules/recurrence/recurrence-date.test.ts` | 07-12 T1 | ✅ |
| RECR-01 | Rule list: a weekly rule with no materialized future rows still reports `nextOccurrenceDate`; `kind` derivation; ordering; no `createdBy` in the response (D-16, D-20) | integration | `pnpm --filter api test:integration` | `apps/api/test/recurrence/recurrence-rules-api.int.test.ts` | 07-12 T1 | ✅ |
| RECR-02 | End-this-recurrence: anchor is tomorrow, today survives, `count` cleared, cross-household 404 / MEMBER 403 / idempotent (D-14) | integration | `pnpm --filter api test:integration` | same file | 07-12 T2 | ✅ |
| RECR-02 | Rule-scoped edit: atomicity, successor template from `template_*`, seed-row invariant, inheritance, permission matrix (D-16, D-08, D-17) | integration | `pnpm --filter api test:integration` | same file | 07-13 T2 | ✅ |
| RECR-01 | Rule-row formatting: null normalization, never-ends suffix, ended row, accessibility label, split-anchor computation (D-16) | client unit | `cd apps/client && pnpm test` | `apps/client/src/features/recurrence/__tests__/recurrence-rule-row-test.tsx` | 07-14 T1 | ✅ |
| RECR-01/02 | E2E web: generation timing, recurring-only filter, rule list + detail + end, axe on both new screens (D-11…D-20) | e2e | `pnpm test:e2e:web` | `e2e/events/recurrence-rules.spec.ts` | 07-15 T1 | ✅ |
| RECR-02 | D-14 anchor is load-bearing, not incidental: mutating `endRule`'s anchor from tomorrow to today turns the E2E "today survives" assertion red | e2e (mutation) | `pnpm test:e2e:web` | `e2e/events/recurrence-rules.spec.ts` | 07-15 T1 | ✅ |
| — (regression) | Hand-maintained OpenAPI client matches the committed tree after the new endpoints and query param | contract | `pnpm openapi:check` | n/a — existing check | 07-11 / 07-12 / 07-13 | ✅ |
| — (regression) | Required-test manifest covers the 6 addendum test files and rejects skip markers | script | `pwsh -File scripts/check-required-tests.ps1` | `scripts/check-required-tests.ps1` | 07-15 T2 | ✅ |
| — (regression) | The audit's own guard still works: absent path rejected, `.skip`/`.todo`/`IMPLEMENTATION_MISSING` rejected | script | `pwsh -File scripts/check-required-tests.ps1 -SelfTest` | `scripts/check-required-tests.ps1` | 07-15 T2 | ✅ |
| — (regression) | Existing recurrence + event-a11y E2E specs stay green alongside the new one | e2e | `pnpm test:e2e:web` | `e2e/events/recurrence.spec.ts`, `e2e/events/accessibility.spec.ts` | 07-15 T1 | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. The 25 ✅ rows above the addendum marker are the D-01..D-10 record from 2026-08-12; the 18 addendum rows were run on 2026-08-13 during 07-15 Task 2. The unrelated legacy auth Web E2E regression, and the two SecLists-CRLF integration failures (`test/security/asvs-v5-l1.test.ts`, `test/auth/password-reset.int.test.ts`), remain outside this phase's verification map — both are logged in `deferred-items.md`.*

**07-15 Task 2 run record (2026-08-13, worktree `agent-a12707ad9ce1bf5ff`):**

| Command | Result |
|---------|--------|
| `pnpm --filter api test:quick` | 2 files / 34 tests passed |
| `pnpm --filter api test:integration` (recurrence scope) | 5 files / 73 tests passed |
| `pnpm --filter api test:integration` (full) | 17/19 files passed; the 2 failures are the pre-existing SecLists CRLF item (`git ls-files --eol` still reports `i/lf w/crlf`), untouched by this phase |
| `cd apps/client && pnpm test` | 23 suites / 232 passed, 2 skipped (both pre-existing, in `invitation-lifecycle-test.tsx`) |
| `pnpm openapi:check` | PASS — generated client matches the committed tree |
| `pwsh -File scripts/check-required-tests.ps1` | PASS — 36 contracts (30 → 36, exactly the 6 addendum files) |
| `pwsh -File scripts/check-required-tests.ps1 -SelfTest` | PASS |
| `npx playwright test e2e/events` | 18/18 passed (new spec + `recurrence.spec.ts` + `accessibility.spec.ts` + `calendar-api.spec.ts`) |
| `pnpm test:e2e:web` (full) | see "Known out-of-scope E2E cascade" in `deferred-items.md`; all Phase 7 specs green |

---

## Wave 0 Requirements

- [x] `apps/api/src/modules/recurrence/recurrence-date.test.ts` — pure date-math unit tests (D-05, D-06, D-09, D-10); **highest priority, zero infrastructure cost**
- [x] `apps/api/test/recurrence/recurrence-rules.int.test.ts` — rule CRUD + instance generation + split-series (RECR-01, RECR-02)
- [x] `apps/api/test/recurrence/materializer.int.test.ts` — idempotency + watermark advancement (D-03)
- [x] `apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx` — RECR-01 UI
- [x] `apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx` — RECR-02 UI
- [x] `apps/client/src/features/tasks/__tests__/task-status-test.tsx` — `cancelled` status fan-out (today-view exclusion, status-cycle guard)
- [x] `e2e/events/recurrence.spec.ts` — RECR-01/02 end-to-end web journey
- Framework install: **none needed** — Vitest, Jest, Playwright already installed/configured
- Fixture helpers (`insertActor`, `createHousehold`, `addMemberViaDb`, `taskApi`): **copy into new test files**, following the existing per-file duplication convention (`apps/api/test/tasks/tasks.int.test.ts:33-99`) — do not refactor to shared fixtures in this phase, that would inflate blast radius
- Optional: extend `scripts/check-required-tests.ps1`'s `$requiredTests` array with the new Wave 0 paths above

### Addendum Wave 0 (D-11 … D-20, planned 2026-08-13)

- [x] `apps/api/test/recurrence/lookahead.int.test.ts` — per-frequency lookahead, per-rule timezone, watermark monotonicity, ended-rule scan exit, create-time pass (07-09)
- [x] `apps/api/test/recurrence/recurring-filter.int.test.ts` — `recurring` query param three-state on both list endpoints (07-11)
- [x] `apps/api/test/recurrence/recurrence-rules-api.int.test.ts` — rule list/detail, end-this-recurrence, rule-scoped edit (07-12, 07-13)
- [x] `apps/client/src/features/recurrence/__tests__/recurring-filter-test.tsx` — client filter predicate + generation-window classifier (07-10)
- [x] `apps/client/src/features/recurrence/__tests__/recurrence-rule-row-test.tsx` — rule-row formatting + split-anchor computation (07-14)
- [x] `e2e/events/recurrence-rules.spec.ts` — addendum web journeys + axe on the two new screens (07-15)
- All six are in `scripts/check-required-tests.ps1`'s `$requiredTests` as of 07-15 Task 2, so a later `.skip` / `.todo` / `IMPLEMENTATION_MISSING` on any of them fails the audit rather than silently reducing coverage
- Framework install: **none needed**; no new dependency is introduced anywhere in the addendum
- Fixture helpers: keep copying `withDatabase` / `insertActor` / `createHousehold` / `createRecurringTask` per file, following the existing convention — do not refactor to a shared module
- ⚠ Screens under `apps/client/app/**` are unreachable by the client Jest `testMatch`; all addendum formatting and state-classification logic therefore lives under `apps/client/src/features/recurrence/`, and the two new screens are covered by Playwright instead

---

## Manual-Only Verifications

*None identified — all phase behaviors (including D-09 month-end clamping and D-10 DST handling) have automated coverage via the unit date-math suite. Android real-device acceptance for the recurrence UI follows the same pattern as Phases 2-4 and is tracked as a phase-gate checkpoint, not a manual-only *test*.*

*Addendum: the same holds. Two 07-UI-SPEC.md rows are marked 🧪 backstop (long-text overflow on a rule row; the 5th filter group at 320px + 200% font) — they are visual-regression items confirmed at the 07-15 Task 3 real-device checkpoint, not manual-only tests.*

*07-15 Task 3 is a `checkpoint:human-verify` gate, not a manual-only **test**: everything it looks at (recurring-only filter, merged rule list with text type badges, both two-step inline confirms, the tomorrow anchor) already has automated coverage in the rows above. What the device adds is the physical dimension the Web tier cannot reach — real touch-target size, the system font scaled to 200%, `减少动态效果`, and `forced-colors` — which is exactly what the two 🧪 backstop rows need. It therefore does not belong in this section, and no addendum behavior is verified **only** by a human.*

---

## Validation Sign-Off

### D-01 … D-10 (plans 07-01 … 07-08) — complete

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (7 files above)
- [x] No watch-mode flags
- [x] Feedback latency < 5s (quick tier)

**Approval:** automated validation complete; Android real-device acceptance remains at the 07-08 Task 3 checkpoint.

### D-11 … D-20 (plans 07-09 … 07-15) — complete

- [x] Every addendum task has an `<automated>` verify command
- [x] Sampling continuity: no 3 consecutive addendum tasks without automated verify
- [x] Addendum Wave 0 names all 6 new test files, each owned by a specific plan/task
- [x] No watch-mode flags
- [x] Feedback latency < 5s (quick tier — `recurrence-date.test.ts` stays zero-infrastructure)
- [x] All ⬜ rows above flipped to ✅ by real runs (07-15 Task 2, 2026-08-13 — see the run record table)
- [x] `nyquist_compliant: true` and `wave_0_complete: true` restored in frontmatter (07-15 Task 2)

**Approval:** automated validation complete for the addendum. Android real-device acceptance remains open at the 07-15 Task 3 checkpoint, which is where the two 🧪 backstop rows are confirmed.
