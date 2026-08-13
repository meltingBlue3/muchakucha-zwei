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

## Pre-existing `apps/client` typecheck error in `StatusPanel` (`primitives.tsx:510`)

- **Found during:** 07-14 Task 1, running `cd apps/client && pnpm typecheck`
- **Observed:** `src/ui/primitives.tsx(510,35): error TS2322` — `<Heading ref={headingRef} tabIndex={-1}>` passes `tabIndex` to `Heading`, whose props are `Omit<OwnedTextProps, 'ref'> & RefAttributes<unknown>` and do not include `tabIndex`. It is the **only** error the client typecheck reports.
- **Scope decision:** `apps/client/src/ui/primitives.tsx` is not in this plan's `files_modified` and `git status --short` confirms it is unmodified here. Adding new files under `src/features/recurrence/` and `app/` cannot influence the types `StatusPanel` resolves. Per the executor's scope-boundary rule this is logged, not fixed — `tabIndex` is a Web-only escape hatch that RN's `Text` typing does not model, and "fixing" it means either widening `OwnedTextProps` (a shared primitive's public surface) or dropping the keyboard-focus affordance `StatusPanel` relies on. Neither belongs in a recurrence-UI plan.
- **Suggested follow-up:** widen `OwnedTextProps` with the Web-only `tabIndex?: number` (the same escape hatch `recurrence-picker.tsx` already uses on a `View`), in whichever later plan next touches `src/ui/primitives.tsx`.
