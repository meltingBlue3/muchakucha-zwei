# AGENTS.md

Muchakucha Zwei is a mobile-first family app for shared calendars, tasks, notes, and labels. Android and iOS are primary; Web is secondary. This is a fresh rebuild with no legacy code or data migration.

## Layout

- `apps/client/`: Expo, React Native, Expo Router, and Restyle. Routes live in `app/`; feature logic, shared UI, and platform adapters live in `src/`.
- `apps/api/`: NestJS + Fastify. Business modules live in `src/modules/`; Prisma schema and migrations live in `prisma/`.
- `packages/api-client/`: generated OpenAPI contract and TypeScript client.

## Workflow

- Follow existing code patterns and strict TypeScript settings. Use `package.json` and `pnpm-lock.yaml` for versions and scripts.
- Preserve unrelated changes. Report what changed, checks performed, and anything unverified.

## Commands

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter api prisma:generate
pnpm dev
pnpm --recursive typecheck
pnpm test:quick
pnpm test:integration
pnpm test:e2e:web
pnpm openapi:generate
```

For Web, use `pnpm --filter client exec expo start --web --port 8081`; the current `web` script conflicts with the test mailbox port.

## Implementation

- Reuse `apps/client/src/ui/` components and theme tokens. Keep platform differences in native/Web adapters.
- Keep `/api/v1` backward compatible. Update DTOs and templates in `apps/api/src/openapi/generate-openapi.ts`, then regenerate; do not hand-edit generated output or expose Prisma models to clients.
- Enforce household membership and resource ownership on the server. Preserve database constraints and transactions; add migrations for schema changes.
- Keep access tokens in memory. Store rotating refresh tokens in native SecureStore or Web HttpOnly cookies, with hashes only on the server.
- Store time points as UTC `timestamptz`; keep calendar dates and recurrence time zones distinct.

## Validation

Run checks relevant to the change: Vitest for API, Jest for client, and Playwright for Web. Add regression coverage for behavior fixes; documentation-only edits need a diff check.

Before database or browser tests, read `.env.test.example`, `apps/api/test/reset-database.ts`, and `playwright.config.ts`. Integration tests clear the database: use a disposable local test database and explicitly configure test variables. Root `.env.test` is not loaded automatically.
