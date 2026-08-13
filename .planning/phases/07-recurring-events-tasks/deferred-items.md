# Deferred Items

## Code review findings deliberately not fixed (07-REVIEW.md)

All 4 critical findings (CR-01..CR-04) and 7 of 14 warnings (WR-02, WR-03,
WR-05, WR-06, WR-07, WR-10, WR-13, WR-14 — and the short-term half of
WR-12) were fixed this session. The remainder is deferred, with reasons:

- **WR-01** (recurrence silently ignored on the plain update DTOs) — NOT a
  safe drop-in fix. The client's own 仅此一次 save path
  (`edit.tsx`'s `handleSeriesSelect`, both tasks and events) currently
  sends the full form payload — including `recurrence` — through the
  plain `updateTask`/`updateEvent` endpoint, relying on exactly the
  silent-ignore behavior WR-01 flags. Rejecting `recurrence` there
  outright would break every 仅此一次 save on a recurring item. A correct
  fix needs a coordinated client change (strip `recurrence` before that
  specific call, which is always safe there since `seriesScopeModeFor`
  already guarantees `this_only` is only offered when recurrence did not
  change) landed together with the server-side rejection. Real fix, not
  attempted here for lack of time to verify the coordinated change
  against both edit screens.
- **WR-04** (split/end paths skip the materializer's advisory lock) —
  correctness fix requires an interleaved integration test (a tick's
  materialization racing a user's split/end inside the same window) to
  prove the race and then prove the fix; that test infrastructure doesn't
  exist yet and building it responsibly is bigger than a one-session add.
- **WR-08** (nested validation errors don't reach the client's per-field
  mapping) — real fix, touches the global `main.ts` exception filter
  shared by every endpoint in the API, not just recurrence. Wanted a
  dedicated review pass across all consumers of `validationDetails`
  rather than a recurrence-scoped session touching it in passing.
- **WR-09** (a series split's seed occurrence can land on a date the new
  pattern never produces) — same shape as WR-12/CR-fixed issues but
  requires mirroring `updateRuleFromAnchor`'s `no_occurrence_in_range`
  rejection into `updateSeriesFromOccurrence`, which changes that
  endpoint's error surface; wanted its own regression test for the
  count-bounded case specifically, not bundled into this session's batch.
- **WR-11** (weekly `by_weekday` CHECK is a no-op for an empty array) —
  needs a migration; every plan in this phase was deliberately
  no-migration. Fold into whichever later phase next touches
  `recurrence_rules` with one.
- **WR-12** (remainder — the generated API client has no structural link
  to the introspected OpenAPI document) — the short-term half (real
  response DTOs instead of `Object as any`) is fixed; the actual
  generator rework (deriving `models.ts`/`client.ts` from the document
  instead of hand-written string literals) is a cross-cutting
  infrastructure change, not a recurrence-phase fix.
- **IN-01, IN-02, IN-03, IN-05, IN-06** — pure code-quality/dedup info
  items with no user-visible effect; left for a dedicated cleanup pass.

## Out-of-scope Web E2E authentication regression

- **Found during:** 07-08 Task 1 full `pnpm test:e2e:web` gate
- **Observed:** `e2e/auth/account-actions.spec.ts` reaches `/profile` without a restored browser session and redirects to login. The first failure is followed by Playwright-managed API/Web server exits, producing connection-refused cascade failures in unrelated specs.
- **Scope decision:** Phase 7 focused suites are green (`events/recurrence`, `events/accessibility`, recurrence API integration, client recurrence tests, and OpenAPI drift). Authentication/session restoration belongs to the earlier auth phase and was not modified here.
- **Suggested follow-up:** Diagnose the cookie/session bootstrap used by API-request login helpers before treating the global Web suite as a Phase 7 regression.
- **Recurred in:** 07-15 Task 2, unchanged. Full `pnpm test:e2e:web`: **63 passed, 24 failed, 2 did not run**. Every failure is in `e2e/auth/**`, `e2e/households/**`, or `e2e/tasks/**`, and all but one are the same cascade signature (`locator.fill: Test timeout … waiting for getByLabel('邮箱')` — the login page never loads because the Playwright-managed servers exited after the first auth failure). The one genuine non-cascade failure is the separate `coral`-on-`coralSoft` contrast item logged below. **All 43 `e2e/events/**` tests pass**, including the four new addendum journeys.

## Out-of-scope pre-existing integration failures (07-09)

- **Found during:** 07-09 Task 1 full `pnpm --filter api test:integration` gate
- **Observed:** Two failures unrelated to any file this plan touches:
  1. `test/security/asvs-v5-l1.test.ts > runtime common-password data is the exact licensed deterministic top-3000 derivation` — `expect(denylist).not.toContain('\r')` fails, indicating the pinned SecLists denylist fixture was checked out with CRLF line endings on this Windows worktree instead of the pinned LF-only source.
  2. `test/auth/password-reset.int.test.ts > rejects a new password from the committed top-3000 fixture without consuming the token` — downstream of the same denylist fixture/CRLF issue (the reset flow's password-strength check reads the same corrupted fixture).
- **Scope decision:** Neither `apps/api/src/modules/recurrence/**` nor `apps/api/test/recurrence/**` (this plan's files) touch the SecLists denylist fixture or password-reset flow. `git status --short` confirms no files under `test/security/` or `test/auth/` were modified by this plan. Per the executor's scope-boundary rule, pre-existing failures in unrelated files are logged here, not fixed.
- **Suggested follow-up:** Verify the repo's `.gitattributes` forces LF for the SecLists denylist source file, or re-checkout with `git config core.autocrlf false` on Windows before running the ASVS security suite.
- **Recurred in:** 07-12, 07-13, and 07-15, in fresh worktrees, with the same `git ls-files --eol` signature (`i/lf w/crlf`). No duplicate entry filed; it is the same item. In 07-15 the full integration run was 17/19 files green with exactly these two failures; the recurrence scope (`vitest run --project integration test/recurrence`) was 5/5 files and 73/73 tests green.

## `recurrence_rules_by_weekday_ck` does not reject an empty `by_weekday` on a weekly rule

- **Found during:** 07-13 Task 2, while looking for a production constraint that a successor rule INSERT could be made to violate
- **Observed:** the constraint reads `CHECK ("by_weekday" <@ ARRAY[0..6] AND ("freq" <> 'weekly' OR array_length("by_weekday", 1) >= 1))`. For an empty array `array_length('{}', 1)` is **NULL**, not `0`, so the second conjunct evaluates to NULL, the whole CHECK evaluates to NULL, and PostgreSQL admits the row. Verified directly against the test database. A weekly rule with `by_weekday = '{}'` is therefore accepted by the schema even though the constraint was clearly written to forbid it.
- **Impact today: none.** Every write path (`tasks.service`, `events.service`, and this plan's `updateRuleFromAnchor`) passes `recurrence.byWeekday ?? []`, and `walkOccurrences` treats an empty `byWeekday` on a weekly rule as "the weekday of `startsOn`" — sane, documented behaviour. The constraint is merely more permissive than it reads, not wrong in effect.
- **Scope decision:** tightening it (`coalesce(array_length(...), 0) >= 1`) requires a new Prisma migration, and this plan is explicitly a no-migration plan. It also affects the two create paths equally, so it is not a defect introduced here.
- **Suggested follow-up:** fold the `coalesce` fix into whichever later phase next touches `recurrence_rules` with a migration.

## Pre-existing `apps/client` typecheck error in `StatusPanel` (`primitives.tsx:510`)

- **Found during:** 07-14 Task 1, running `cd apps/client && pnpm typecheck`
- **Observed:** `src/ui/primitives.tsx(510,35): error TS2322` — `<Heading ref={headingRef} tabIndex={-1}>` passes `tabIndex` to `Heading`, whose props are `Omit<OwnedTextProps, 'ref'> & RefAttributes<unknown>` and do not include `tabIndex`. It is the **only** error the client typecheck reports.
- **Scope decision:** `apps/client/src/ui/primitives.tsx` is not in this plan's `files_modified` and `git status --short` confirms it is unmodified here. Adding new files under `src/features/recurrence/` and `app/` cannot influence the types `StatusPanel` resolves. Per the executor's scope-boundary rule this is logged, not fixed — `tabIndex` is a Web-only escape hatch that RN's `Text` typing does not model, and "fixing" it means either widening `OwnedTextProps` (a shared primitive's public surface) or dropping the keyboard-focus affordance `StatusPanel` relies on. Neither belongs in a recurrence-UI plan.
- **Suggested follow-up:** widen `OwnedTextProps` with the Web-only `tabIndex?: number` (the same escape hatch `recurrence-picker.tsx` already uses on a `View`), in whichever later plan next touches `src/ui/primitives.tsx`.

## `role="radio"` without `aria-checked` on the label / priority / assignee filter chips

- **Found during:** 07-08 re-verification, while fixing the same defect on the recurring-filter chips (see SUMMARY deviation 1)
- **Observed:** the recurring-filter chips were emitting `role="radio"` with no `aria-checked`, a **critical** axe violation (`aria-required-attr`, WCAG 4.1.2). The root cause is that `accessibilityState={{ selected }}` maps to `aria-selected` on react-native-web, and even `accessibilityState={{ checked }}` does not emit `aria-checked` — only an explicit `aria-checked` prop does (this is why `RecurrencePicker` sets both). The **same latent defect** exists on every other filter chip that pairs `accessibilityRole="radio"` with `accessibilityState={{ selected: ... }}`:
  - `events/index.tsx` — label filter (2 sites)
  - `tasks/index.tsx` — status, priority, assignee, and label filters (6 sites)
  - `labels/index.tsx` — colour swatches (2 sites)
  - `src/ui/household-components.tsx` — household switcher (1 site)
- **Why it did not fail the audit:** all of these rows render conditionally (e.g. `availableLabels.length > 0`), and the a11y fixture household has no labels/members, so axe never reached them. The recurring-filter row is the only one rendered unconditionally, which is why it was the one caught.
- **Scope decision:** these chips belong to Phases 3/4, not to this plan's files. Per the executor scope boundary, only the recurring-filter chips (which blocked this plan's own gate) were fixed. Fixing the rest is a mechanical repeat of the same one-line change.
- **Suggested follow-up:** sweep all `accessibilityRole="radio"`/`"checkbox"` call sites and add the explicit `aria-checked` prop; consider extracting a `FilterChip` primitive so the correct semantics cannot be forgotten. Extend the a11y fixtures to seed at least one label and one extra member so the audit actually reaches these rows.

## `07-UI-SPEC.md` line 254 mandates a colour pairing that fails the spec's own AA contract

- **Found during:** 07-15 Task 1, first axe run against the new rule detail screen
- **Observed:** line 254 specifies the recurrence summary block as `backgroundColor="tealSoft"` with text `color="teal"`. Measured, `#277A72` on `#DCEEEA` is **4.24:1**, and the summary renders at `variant="caption"` (12px), so the same document's Accessibility Contract (line 674, "普通文字对比 ≥4.5:1") is violated by its own component spec. axe reports it as a **serious** `color-contrast` violation.
- **Why it had not been caught:** `RecurrenceSummary` only renders when the picker's value is non-null. Every screen the existing `e2e/events/accessibility.spec.ts` axe-checks reaches the picker in its default `不重复` state (or before the edit form's fetch has seeded it), so the block was never in the tree when axe ran. The new rule **detail** screen is the first surface that renders the picker already seeded from a fetched rule, which is why the violation surfaced here.
- **Action taken (not deferred):** the component was changed to `color="ink"` (12.2:1) — the pairing `src/ui/__tests__/contrast-test.ts:50` already guarantees for `tealSoft`. See the 07-15 SUMMARY deviation.
- **Still deferred:** `07-UI-SPEC.md` line 254 itself still prescribes the failing pairing, so a future plan reading the spec would reintroduce it. The spec line should be corrected to `color="ink"`, and the AA contract should win explicitly wherever the two sections disagree.
- **Suggested follow-up:** extend `contrast-test.ts` with a positive assertion for every foreground/background pair a component actually uses (rather than only the pairs the palette intended), so an off-contract pairing fails at the unit tier instead of waiting for an axe run to happen to reach it.

## `coral` on `coralSoft` fails AA on the household home cards (`进入 ›`)

- **Found during:** 07-15 Task 2, full `pnpm test:e2e:web` run
- **Observed:** `e2e/households/accessibility.spec.ts:136` ("has no axe violations on household roster and settings pages") reports a **real, non-cascade** serious `color-contrast` violation: `#B94736` on `#F7DDD5` is **4.04:1** at 12px. The violating node is the `进入 ›` caption inside the `打开今日视图` card — exactly one node, i.e. only the cards whose background is `coralSoft`.
- **Same class as the `RecurrenceSummary` finding above** — an accent colour used as *text* on its own soft tint, which the palette never guaranteed. `contrast-test.ts` asserts `surface` on `coral` (white on the fill) and `ink` on the soft tints; it does not assert `coral` on `coralSoft`, and that pairing does not pass.
- **Scope decision:** `apps/client/app/(protected)/households/[id]/index.tsx` is not in this plan's `files_modified`; the pairing is a Phase 2/3 decision at 7 `进入 ›` call sites, and the failure predates this phase's addendum (it is present in the full-suite run taken *before* any change in this plan). The 7th card added by 07-14 (周期规则) is **not** among the violating nodes. It also does not block this plan's own gate — the two new screens' axe assertions pass. Per the scope-boundary rule it is logged, not fixed.
- **Suggested follow-up:** fold it into the same sweep as the `RecurrenceSummary` fix — decide once whether accent-on-soft-tint is ever legal for text, then apply `ink` (or a darkened accent token) at all 7 call sites and add the pairing to `contrast-test.ts`.

## `pnpm --filter api dev` cannot boot from a clean checkout (blocks `pnpm test:e2e:web`)

- **Found during:** 07-08 re-verification, first attempt to run `pnpm test:e2e:web` in a fresh worktree
- **Observed:** `apps/api`'s `dev` script is `tsc -p tsconfig.build.json && node dist/main.js`, which compiles TS but never copies `src/modules/auth/data/` into `dist/`. `password-policy.js` reads `dist/modules/auth/data/common-passwords-top-3000.txt` at import time, so the API exits with `ENOENT` before listening. Because Playwright launches the API through this exact script, `pnpm test:e2e:web` fails at webServer startup with no useful attribution. Only `openapi:generate` performs the `cpSync` of that data directory, so the suite happens to work on any machine where `openapi:generate` was run first — which hides the defect locally and would break a cold CI runner.
- **Workaround used:** ran the `cpSync` from `openapi:generate` manually once before the E2E run.
- **Scope decision:** `apps/api/package.json` is not in this plan's `files_modified`, and the fix (a shared `build` script, or a `prebuild`/`postbuild` copy step) affects every consumer of `dev`.
- **Suggested follow-up:** factor the data copy into a single `build` script that `dev`, `openapi:generate`, and any deploy path all call, so the compiled output is never missing its runtime assets.
