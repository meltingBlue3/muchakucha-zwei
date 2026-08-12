# Deferred Items

## Out-of-scope Web E2E authentication regression

- **Found during:** 07-08 Task 1 full `pnpm test:e2e:web` gate
- **Observed:** `e2e/auth/account-actions.spec.ts` reaches `/profile` without a restored browser session and redirects to login. The first failure is followed by Playwright-managed API/Web server exits, producing connection-refused cascade failures in unrelated specs.
- **Scope decision:** Phase 7 focused suites are green (`events/recurrence`, `events/accessibility`, recurrence API integration, client recurrence tests, and OpenAPI drift). Authentication/session restoration belongs to the earlier auth phase and was not modified here.
- **Suggested follow-up:** Diagnose the cookie/session bootstrap used by API-request login helpers before treating the global Web suite as a Phase 7 regression.
