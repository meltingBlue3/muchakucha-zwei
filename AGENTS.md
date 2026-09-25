# AGENTS.md

Muchakucha Zwei is a mobile-first family app for shared calendars, tasks, notes, and labels. Android and iOS are primary; Web is secondary. It is a fresh rebuild with no legacy code or data migration.

This file is the always-loaded entry point. Load a playbook when its row matches the request, and leave the rest unread.

## Layout

- `apps/client/` — Expo, React Native, Expo Router, Restyle. Routes live in `app/`; feature logic, shared UI, and platform adapters live in `src/`.
- `apps/api/` — NestJS + Fastify. Business modules live in `src/modules/`; Prisma schema and migrations live in `prisma/`.
- `packages/api-client/` — the generated OpenAPI contract and TypeScript client. Generated output only.
- `e2e/` — Playwright specs. `docs/` — design and agent playbooks. `scripts/` — contract-drift and test helpers.

## Start at the target

Open the file, route, endpoint, or error the request names, plus its direct dependencies and one existing implementation of the same kind. A clear target needs no repository survey, no reconstruction of past progress from git history, and no reading of `test-results/`.

## Choose one row

| Operation | Read first |
| --- | --- |
| Answer, explain, trace, or diagnose a named target | Nothing; inspect the target and its direct dependency |
| Documentation or configuration-only edit | Nothing; check the edited content, its links, and its commands |
| Screen layout, visual style, shared UI component, or theme token | [docs/design.md](docs/design.md) |
| Client routing, data loading, session, draft state, or platform adapter | [docs/agent/client.md](docs/agent/client.md) |
| Accessible name, role, focus order, or keyboard behavior on Web | [docs/agent/web-accessibility.md](docs/agent/web-accessibility.md) |
| Endpoint, DTO, error code, permission rule, Prisma schema, or migration | [docs/agent/api.md](docs/agent/api.md) |
| Choosing which checks to run, writing or repairing a test, reporting evidence | [docs/agent/testing.md](docs/agent/testing.md) |
| Starting a server, database, or mail capture; port selection; anything that writes to a database | [docs/agent/environment.md](docs/agent/environment.md) |
| Ownership or entry point of a module is unclear | [docs/agent/context.md](docs/agent/context.md) |
| Deploying, the production server, TLS certificate, or reverse proxy | [README.md](README.md) — 生产部署 |

A request spanning several rows reads only those rows. Links inside a playbook follow the same rule: take one when its own trigger matches.

## Every branch

- Match the surrounding code: existing patterns, strict TypeScript, no new dependency without a stated reason.
- Preserve unrelated working-tree changes. Review only the files this task touched.
- Commands and versions live in `package.json` and [README.md](README.md). Read them there instead of trusting a remembered command.
- Report the result, the checks actually run, and anything left unverified. State a skipped step rather than implying it.

## Standing safety

- Integration tests and E2E truncate their database. Keep them on a disposable loopback database whose name carries a standalone `test` segment; `apps/api/test/reset-database.ts` enforces this, and that guard stays as strict as it is.
- The human may already be running `pnpm dev` on ports 3000 and 8081. Start your own services on free ports, and stop only processes this task started.
- Product data, `.env` files, and deployment targets stay untouched unless the current request names the exact change. A live server at `47.117.148.16` serves real family data and holds its secrets outside the repository, in `/etc/muchakucha/api.env`; it is not a scratch host.
