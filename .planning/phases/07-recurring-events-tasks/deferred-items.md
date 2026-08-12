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
