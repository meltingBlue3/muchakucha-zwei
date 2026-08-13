---
phase: 07-recurring-events-tasks
plan: 08
subsystem: testing
tags: [playwright, e2e, accessibility, axe, recurrence, verification]
requires:
  - phase: 07-05
    provides: Recurrence picker with radiogroup/checkbox chip semantics
  - phase: 07-06
    provides: Recurrence badges, cancelled-state presentation, Today partitions
  - phase: 07-07
    provides: SeriesScopeSheet with focus trap, Escape close, and focus return
provides:
  - Web end-to-end coverage of the RECR-01 create journey and the RECR-02 scope/cancel journey
  - Event-side axe, keyboard, focus-trap, live-region, and 200%-zoom audit (closes the Phase 3 gap)
  - Required-test manifest coverage for all 7 phase-07 test files
affects: [07-15, accessibility-e2e, phase-gate]
tech-stack:
  added: []
  patterns: [lookahead-aware e2e fixtures, section-scoped Today-view assertions, explicit aria-checked on RN Web radios]
key-files:
  created:
    - e2e/events/recurrence.spec.ts
    - e2e/events/accessibility.spec.ts
  modified:
    - scripts/check-required-tests.ps1
    - apps/client/app/(protected)/households/[id]/events/index.tsx
    - apps/client/app/(protected)/households/[id]/tasks/index.tsx
    - .planning/phases/07-recurring-events-tasks/07-VALIDATION.md
    - .planning/phases/07-recurring-events-tasks/deferred-items.md
key-decisions:
  - "E2E assertions are written against visible copy and accessible names taken byte-for-byte from the UI-SPEC Copywriting Contract, never internal implementation details."
  - "The cancel journey asserts the 今日待办 section count before and after, so the exclusion cannot pass vacuously when siblings are absent for unrelated reasons."
  - "Recurring-filter radios now carry an explicit aria-checked prop; accessibilityState alone does not reach the Web DOM in react-native-web."
patterns-established:
  - "E2E fixtures must respect the per-frequency generation lookahead: pick the frequency whose window covers the occurrences the assertion needs, rather than assuming eager materialization."
requirements-completed: [RECR-01, RECR-02]
coverage:
  - id: D1
    description: "RECR-01 create journey: weekly rule built in the Web form, weekday chips pre-checked and extendable, count ending, summary copy, multiple occurrences with recurrence badges on the calendar, and a matching detail summary."
    requirement: RECR-01
    verification:
      - kind: e2e
        ref: "e2e/events/recurrence.spec.ts#creates a weekly event in the Web form and presents every generated occurrence"
        status: pass
    human_judgment: false
  - id: D2
    description: "RECR-02 scope journey: no list mutation before a scope is chosen, 仅此一次 disabled for a rule change, 此后所有 preserves earlier occurrences and rebuilds later ones under a new rule id."
    requirement: RECR-02
    verification:
      - kind: e2e
        ref: "e2e/events/recurrence.spec.ts#splits an event only after scope selection and cancels one task occurrence"
        status: pass
    human_judgment: false
  - id: D3
    description: "RECR-02 cancel journey: 删除这次重复？ defaults focus to 取消, 仅此一次 cancels exactly one occurrence, that occurrence shows 已取消 and leaves 今日待办, siblings stay pending."
    requirement: RECR-02
    verification:
      - kind: e2e
        ref: "e2e/events/recurrence.spec.ts#splits an event only after scope selection and cancels one task occurrence"
        status: pass
    human_judgment: false
  - id: D4
    description: "Event-side accessibility audit: zero serious/critical axe violations on the calendar, create, detail, and edit routes."
    requirement: RECR-01
    verification:
      - kind: e2e
        ref: "e2e/events/accessibility.spec.ts#has no serious axe violations on list, create, detail, and edit routes"
        status: pass
    human_judgment: false
  - id: D5
    description: "Keyboard contract: Tab order through the create form, radiogroup arrow navigation across frequency chips, 7 weekday checkboxes, SeriesScopeSheet focus trap plus Escape close plus focus return, and a polite live region for the empty-weekday guard."
    requirement: RECR-01
    verification:
      - kind: e2e
        ref: "e2e/events/accessibility.spec.ts (4 keyboard/focus/live-region tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "200% zoom at a narrow viewport produces no horizontal overflow and leaves every weekday chip visible and togglable."
    requirement: RECR-01
    verification:
      - kind: e2e
        ref: "e2e/events/accessibility.spec.ts#remains usable at 200% zoom without horizontal overflow or inert weekday chips"
        status: pass
    human_judgment: false
  - id: D7
    description: "Android real-device acceptance of month-end clamping (D-09), device timezone (D-10), touch targets, font scaling, scope sheet reachability, and reduced motion."
    requirement: RECR-01
    verification: []
    human_judgment: true
    rationale: "Task 3 checkpoint — requires a physical Android device and cannot be satisfied by any automated tier."
metrics:
  duration: 2 sessions (initial 2026-08-12; re-verification 2026-08-13)
  completed: 2026-08-13
actuals:
  tokens: 61000
  tasks: 2
  commits: 4
status: awaiting-human-verification
---

# Phase 7 Plan 8: Web Journeys and Event Accessibility Audit Summary

**Two Playwright journeys now walk RECR-01 and RECR-02 end to end in a browser, and the event side finally has the axe/keyboard/focus audit Phase 3 never got — which immediately caught a critical ARIA regression shipped by a later plan.**

## Performance

- **Duration:** initial implementation 2026-08-12; full re-verification 2026-08-13
- **Tasks:** 2 of 3 complete (Task 3 is a blocking human checkpoint)
- **Files created:** 2 · **Files modified:** 5

## Accomplishments

- `e2e/events/recurrence.spec.ts` — two journeys: (A) build a weekly rule in the real Web form, confirm the weekday chip pre-selection, count ending, and summary copy, then verify every generated occurrence renders on the calendar with a recurrence badge and a matching detail summary; (B) edit a mid-series occurrence, assert **zero list mutation before a scope is chosen** and that `仅此一次` is disabled for a rule change, choose `此后所有`, then verify the first two occurrences are byte-identical while later ones are rebuilt under a new rule id — and finally cancel a single task occurrence and confirm it shows `已取消`, leaves `今日待办`, and leaves its siblings pending.
- `e2e/events/accessibility.spec.ts` — five tests covering axe on four event routes, Tab order and radiogroup arrow navigation, the empty-weekday polite live region, `SeriesScopeSheet` focus trap / Escape / focus return, and 200% zoom without horizontal overflow.
- `scripts/check-required-tests.ps1` — all 7 phase-07 test files added to `$requiredTests`, so the existing `$forbiddenPattern` now rejects `.skip` / `.todo` / `IMPLEMENTATION_MISSING` in any of them.
- Fixed two regressions that later plans had introduced into rows this plan had already signed off (see Deviations).

## Task Commits

1. **Task 1: Web recurring journeys** — `187189a` (test)
2. **Task 2: Event accessibility audit + required-test manifest + VALIDATION map** — `b60312e` (test)
3. **Deviation 1: aria-checked on recurring filter radios** — `bd6a887` (fix)
4. **Deviation 2: realign cancel journey with the rolling lookahead** — `62440c2` (test)

## Verification Results (re-run 2026-08-13 on the post-wave-4 tree)

| Gate | Result |
|------|--------|
| `playwright test e2e/events/recurrence.spec.ts e2e/events/accessibility.spec.ts` | **7 passed** |
| `pwsh -File scripts/check-required-tests.ps1` | **PASS** — 30 contracts, no forbidden markers |
| `cd apps/client && pnpm typecheck` | **clean** |
| `cd apps/client && pnpm test` | **22 suites, 213 passed, 2 pre-existing skips** |
| `pnpm test:e2e:web` (full) | **39 passed, 27 failed, 19 did not run** — all 14 event-domain specs green; every failure is the documented out-of-scope auth cascade (see below) |

Acceptance greps: `此后所有` / `仅此一次` / `已取消` all present in `recurrence.spec.ts`; `axe` and `Escape` both present in `accessibility.spec.ts`; no skip markers in either file; all 7 required-test paths present in the manifest.

### On the full-suite result

`pnpm test:e2e:web` is **not** green, and this is the pre-existing regression already recorded in `deferred-items.md` under "Out-of-scope Web E2E authentication regression". The first failures are in `auth/account-actions`, `auth/password-reset`, and `auth/verify-email`; the Playwright worker then dies (`worker process exited unexpectedly (code=3221225794)`) and 27 downstream tests fail at **0 ms** with no assertion of their own, plus 19 never run. Every one of this phase's 14 event specs passed before the cascade. Nothing in this plan touches auth, session bootstrap, or Mailpit. This is reported rather than papered over — the plan's own gate says a red assertion must show red.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical accessibility defect] Recurring-filter radios never emitted `aria-checked`**

- **Found during:** Task 2 re-verification — this plan's own axe audit went red on the calendar route.
- **Issue:** the recurring-filter chips added by 07-10 render `accessibilityRole="radio"` with `accessibilityState={{ selected: ... }}`. On react-native-web `selected` maps to `aria-selected`, so the chips shipped as `role="radio"` with **no `aria-checked`** — axe `aria-required-attr`, impact **critical**, WCAG 4.1.2. A screen reader could not tell which filter was active. Notably `accessibilityState={{ checked }}` alone is *also* insufficient; only an explicit `aria-checked` prop reaches the DOM, which is why `RecurrencePicker` sets both.
- **Fix:** set `accessibilityState={{ checked }}` (native) **and** `aria-checked={...}` (Web) on both call sites, matching the working `RecurrencePicker` pattern.
- **Files modified:** `apps/client/app/(protected)/households/[id]/events/index.tsx`, `apps/client/app/(protected)/households/[id]/tasks/index.tsx`
- **Verification:** the axe test now passes; client typecheck and the full client suite stay green.
- **Committed in:** `bd6a887`

**2. [Rule 1 - Stale assertion after a behavior change] Cancel journey assumed eager materialization**

- **Found during:** Task 1 re-verification — `expect(taskOccurrences).toHaveLength(4)` received 1.
- **Issue:** the journey created a **daily** `count: 4` task and expected all four rows immediately. 07-09 replaced the flat 90-day horizon with a per-frequency lookahead (D-11/D-12) where **daily = 0 days**, so a daily rule now materializes only today. 07-09 explicitly repaired the same assumption in `recurrence-rules.int.test.ts` (10 tests) but did not re-run the e2e tier, so this spec silently went red and stayed red across four subsequent waves.
- **Fix:** anchored the fixture on a **weekly** rule (6-day lookahead) with four consecutive weekdays starting today, so all four occurrences materialize, exactly one is due today, and the siblings stay in the future — keeping them out of both the overdue and `今日待办` sections. Also anchored the rule to the browser's IANA timezone so the materializer's "today" and the Today view's "today" cannot disagree across a UTC boundary.
- **Assertion strengthened, not weakened:** the journey now asserts `今日待办 (1)` **before** the cancel and that the section is gone **after**, so the exclusion is a real before/after difference instead of a possibly-vacuous absence; it also asserts the untouched siblings are still listed. The plan's wording ("不出现在今日视图的今日待办分区") is matched more precisely than the original whole-page check.
- **Files modified:** `e2e/events/recurrence.spec.ts`
- **Verification:** both journeys pass.
- **Committed in:** `62440c2`

---

**Total deviations:** 2 auto-fixed. Neither changed a dependency, endpoint, schema, or architecture. Both were regressions introduced by later plans into rows this plan had previously signed off green — which is itself the finding: a ✅ row is only true as of its last actual run.

## Issues Encountered

- **`pnpm --filter api dev` cannot boot from a clean checkout.** The script compiles with `tsc` but never copies `src/modules/auth/data/` into `dist/`, so `password-policy.js` throws `ENOENT` at import and Playwright's webServer dies before any test runs. Worked around by running the `cpSync` from `openapi:generate` once. Logged to `deferred-items.md` — it would break a cold CI runner.
- **Exporting `NODE_ENV=test` globally breaks the Expo web server** (`@react-native/dev-middleware` demands a mocked tool launcher). Playwright's config already scopes `NODE_ENV: 'test'` to the API process only; the shell must not set it.

## Known Stubs

None. Neither spec contains `.skip`, `.todo`, `IMPLEMENTATION_MISSING`, or a tautological assertion, and both are in the required-test manifest, which mechanically rejects those markers.

## Threat Flags

None. This plan added no endpoint, dependency, or credential. Per T-07-19 the e2e fixtures generate random emails and reuse the existing test-only password constant; per T-07-SC the dependency manifest and lockfile are unchanged.

## User Setup Required

**Task 3 requires a physical Android device** — see the checkpoint below. It can be merged into the single real-device session that `02-13`, `03-04`, and `04-04` are all waiting on.

## Next Phase Readiness

- 07-15 Task 2 owns the final re-run that flips the D-11…D-20 ⬜ rows. It should budget for the two failure modes found here: the missing `dist` data copy, and the fact that addendum behavior changes can silently invalidate earlier ✅ rows.
- The out-of-scope auth E2E cascade still blocks a truly green `pnpm test:e2e:web` and should be scheduled before any ship gate depends on that command.

## Self-Check: PASSED

- `e2e/events/recurrence.spec.ts` and `e2e/events/accessibility.spec.ts` exist on disk.
- All four commits (`187189a`, `b60312e`, `bd6a887`, `62440c2`) are present in git history.
- The 7 focused e2e tests, the required-test audit, client typecheck, and the client suite were all re-run green on 2026-08-13; results are transcribed above, not assumed.
- `nyquist_compliant` / `wave_0_complete` in `07-VALIDATION.md` were deliberately **left false** — they belong to the D-11…D-20 addendum owned by 07-15, and flipping them here would be a false sign-off.

---
*Phase: 07-recurring-events-tasks*
*Status: Tasks 1-2 complete; Task 3 awaiting Android real-device verification*
