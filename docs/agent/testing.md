# Checks and Evidence

Read this playbook when selecting checks for a change, writing or repairing a test, or reporting what was verified. Running the one obvious closest test needs no playbook. Ports, databases, and services live in [environment.md](environment.md).

## Pick the smallest sufficient check

| Change | Run |
| --- | --- |
| Documentation or configuration only | The edited content, its links, and its commands. No build. |
| Client component, form, or feature logic | `pnpm --filter client test`, plus `pnpm --recursive typecheck` for type-level edits |
| Shared UI component or theme token | The client suite, plus the browser journeys of every screen that uses it — see [../design.md](../design.md) |
| API service or controller logic | The module's `test/<module>/*.int.test.ts`, and `src/**/*.test.ts` for pure helpers |
| DTO, endpoint, or response shape | The module's integration test plus `pnpm openapi:check` |
| Prisma schema or migration | `pnpm --filter api test:integration` — its setup applies migrations |
| Accessible name, role, focus, or keyboard behavior | The matching `e2e/**/accessibility.spec.ts`; see [web-accessibility.md](web-accessibility.md) |
| A user journey across client and server | The matching `e2e/` spec against the real API |

Widen one boundary at a time after a focused failure. A full sweep — every project, every browser spec — belongs to an explicit release check, not to an ordinary change.

## Commands

```sh
pnpm --recursive typecheck
pnpm test:quick                          # API unit + client Jest
pnpm --filter api test:integration       # requires the test database
pnpm test:e2e:web                        # real API and Web
pnpm exec playwright test -c playwright.ui.config.ts   # mocked API, no database
pnpm openapi:check
```

Filter Playwright by title with `-g`, not by `file:line`: a line filter silently matches nothing once the file shifts. A run started in the background takes an explicit `-c <config>` path; without it Playwright resolves a different config and reports "No tests found".

`playwright.ui.config.ts` intercepts every API request and covers only `account-experience.spec.ts` and `ux-regressions.spec.ts` at a 390×844 viewport. It is the fast check for pure UI regressions and proves nothing about server behavior.

Its default Metro server bundles a whole page per navigation and has timed out a full run before. When that happens, check the same code against a static build rather than relaxing the timeout or skipping the failing case:

```sh
pnpm --filter client exec expo export --platform web   # writes apps/client/dist
UI_BASE_URL=http://127.0.0.1:8085 pnpm exec playwright test -c playwright.ui.config.ts
```

`UI_BASE_URL` replaces the managed web server, so the address has to serve `apps/client/dist` with SPA route fallback.

## Writing API integration tests

The suites under `apps/api/test/` build the Nest application in-process and drive it through `inject()`. Existing files in `test/notes/` and `test/labels/` show the fixture set worth copying: a `request()` helper, an actor inserted through SQL with a signed token, a membership helper, and per-resource creation helpers.

Two settings matter at construction time. Pass `E2E_DISABLE_RATE_LIMITS: 'true'` with `NODE_ENV: 'test'` when a suite issues more than sixty requests, and assert on `json().error.code` rather than `json().code`. Integration files run without parallelism because they share one database.

## Evidence has to match the claim

- A permission claim reads the persisted result, not the HTTP status alone. "The member cannot edit" means the note is unchanged afterwards.
- A workflow claim follows the natural entry point through to the visible outcome, then re-reads through the API to confirm what was stored.
- A clearing or deletion claim checks the absent value explicitly: `body: null`, an empty label array, a 404 on re-fetch.
- A UI claim asserts a rendered property — role, accessible name, geometry, focus — not a screenshot alone.

Before writing an assertion, state the product invariant without DOM, wording, or fixture details, then ask what could pass while the user outcome is still wrong. Guard the invariant rather than the reported symptom.

## Reporting

Report which checks ran and what they showed. Separate the suites that passed from the areas left unverified, name any test that was skipped or filtered out, and state a remaining failure with its file, its line, and what it asserted. Passing counts are not an acceptance statement, and native behavior is not covered by any check in this repository.
