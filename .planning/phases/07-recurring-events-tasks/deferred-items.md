# Deferred Items

## Out-of-scope Web E2E authentication regression

- **Found during:** 07-08 Task 1 full `pnpm test:e2e:web` gate
- **Observed:** `e2e/auth/account-actions.spec.ts` reaches `/profile` without a restored browser session and redirects to login. The first failure is followed by Playwright-managed API/Web server exits, producing connection-refused cascade failures in unrelated specs.
- **Scope decision:** Phase 7 focused suites are green (`events/recurrence`, `events/accessibility`, recurrence API integration, client recurrence tests, and OpenAPI drift). Authentication/session restoration belongs to the earlier auth phase and was not modified here.
- **Suggested follow-up:** Diagnose the cookie/session bootstrap used by API-request login helpers before treating the global Web suite as a Phase 7 regression.

## Out-of-scope pre-existing integration failures (07-09)

- **Found during:** 07-09 Task 1 full `pnpm --filter api test:integration` gate
- **Observed:** Two failures unrelated to any file this plan touches:
  1. `test/security/asvs-v5-l1.test.ts > runtime common-password data is the exact licensed deterministic top-3000 derivation` — `expect(denylist).not.toContain('\r')` fails, indicating the pinned SecLists denylist fixture was checked out with CRLF line endings on this Windows worktree instead of the pinned LF-only source.
  2. `test/auth/password-reset.int.test.ts > rejects a new password from the committed top-3000 fixture without consuming the token` — downstream of the same denylist fixture/CRLF issue (the reset flow's password-strength check reads the same corrupted fixture).
- **Scope decision:** Neither `apps/api/src/modules/recurrence/**` nor `apps/api/test/recurrence/**` (this plan's files) touch the SecLists denylist fixture or password-reset flow. `git status --short` confirms no files under `test/security/` or `test/auth/` were modified by this plan. Per the executor's scope-boundary rule, pre-existing failures in unrelated files are logged here, not fixed.
- **Suggested follow-up:** Verify the repo's `.gitattributes` forces LF for the SecLists denylist source file, or re-checkout with `git config core.autocrlf false` on Windows before running the ASVS security suite.
- **Recurred in:** 07-12 and 07-13, in fresh worktrees, with the same `git ls-files --eol` signature (`i/lf w/crlf`). No duplicate entry filed; it is the same item.

## `recurrence_rules_by_weekday_ck` does not reject an empty `by_weekday` on a weekly rule

- **Found during:** 07-13 Task 2, while looking for a production constraint that a successor rule INSERT could be made to violate
- **Observed:** the constraint reads `CHECK ("by_weekday" <@ ARRAY[0..6] AND ("freq" <> 'weekly' OR array_length("by_weekday", 1) >= 1))`. For an empty array `array_length('{}', 1)` is **NULL**, not `0`, so the second conjunct evaluates to NULL, the whole CHECK evaluates to NULL, and PostgreSQL admits the row. Verified directly against the test database. A weekly rule with `by_weekday = '{}'` is therefore accepted by the schema even though the constraint was clearly written to forbid it.
- **Impact today: none.** Every write path (`tasks.service`, `events.service`, and this plan's `updateRuleFromAnchor`) passes `recurrence.byWeekday ?? []`, and `walkOccurrences` treats an empty `byWeekday` on a weekly rule as "the weekday of `startsOn`" — sane, documented behaviour. The constraint is merely more permissive than it reads, not wrong in effect.
- **Scope decision:** tightening it (`coalesce(array_length(...), 0) >= 1`) requires a new Prisma migration, and this plan is explicitly a no-migration plan. It also affects the two create paths equally, so it is not a defect introduced here.
- **Suggested follow-up:** fold the `coalesce` fix into whichever later phase next touches `recurrence_rules` with a migration.

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

## `pnpm --filter api dev` cannot boot from a clean checkout (blocks `pnpm test:e2e:web`)

- **Found during:** 07-08 re-verification, first attempt to run `pnpm test:e2e:web` in a fresh worktree
- **Observed:** `apps/api`'s `dev` script is `tsc -p tsconfig.build.json && node dist/main.js`, which compiles TS but never copies `src/modules/auth/data/` into `dist/`. `password-policy.js` reads `dist/modules/auth/data/common-passwords-top-3000.txt` at import time, so the API exits with `ENOENT` before listening. Because Playwright launches the API through this exact script, `pnpm test:e2e:web` fails at webServer startup with no useful attribution. Only `openapi:generate` performs the `cpSync` of that data directory, so the suite happens to work on any machine where `openapi:generate` was run first — which hides the defect locally and would break a cold CI runner.
- **Workaround used:** ran the `cpSync` from `openapi:generate` manually once before the E2E run.
- **Scope decision:** `apps/api/package.json` is not in this plan's `files_modified`, and the fix (a shared `build` script, or a `prebuild`/`postbuild` copy step) affects every consumer of `dev`.
- **Suggested follow-up:** factor the data copy into a single `build` script that `dev`, `openapi:generate`, and any deploy path all call, so the compiled output is never missing its runtime assets.
