# Local Environment

Read this playbook before starting a server, a database, or mail capture, before choosing a port, and before any command that writes to a database. [README.md](../../README.md) holds the full first-time setup; this file covers what a running session has to get right.

## Test services

`compose.yaml` provides the two services tests depend on:

```sh
docker compose up -d --wait postgres mailpit
```

- PostgreSQL 18.4 on `127.0.0.1:55432`, database, user, and password all derived from `muchakucha_test`.
- Mailpit on SMTP `127.0.0.1:11025` with its web UI on `http://127.0.0.1:18025`.

`.env.test.example` lists the matching variables. The root `.env.test` is never loaded automatically — export the variables in the command that needs them.

Integration tests resolve their database from `TEST_DATABASE_URL`, or build one from `TEST_POSTGRES_DB/USER/PASSWORD/PORT` with a default port of **5432**. Running against the compose container therefore requires `TEST_POSTGRES_PORT=55432`; leaving it unset points the suite at a local PostgreSQL that may be a different major version. Setup requires PostgreSQL 17 or newer and applies `prisma migrate deploy` itself. The E2E database reads `DATABASE_URL` and is migrated by hand.

## Database safety

`apps/api/test/reset-database.ts` truncates every public table. It accepts only a loopback host and a database name carrying a standalone `test` segment, and it refuses anything else. Point a suite at a disposable database rather than widening that guard, and never aim a test command at a database holding real data.

## Servers

```sh
pnpm dev                                                   # API and client together
pnpm --filter client exec expo start --web --port 8081     # Web only
```

The API `dev` script compiles and then runs; it does not watch files, so a source change needs a restart. Use the explicit Expo command above rather than the client's `web` script, whose port collides with the Mailpit UI.

## Do not reclaim a running server

Outside CI both Playwright configs set `reuseExistingServer`, so a run whose origins match an already-running dev server will drive that server — against the development database, without the rate-limit bypass, producing 429s and polluted data that read as product bugs.

When the human already has `pnpm dev` on 3000 and 8081, run browser checks on free ports instead:

```sh
PORT=3100 \
API_ORIGIN=http://127.0.0.1:3100 \
WEB_ORIGIN=http://127.0.0.1:8181 \
EMAIL_LINK_ORIGIN=http://127.0.0.1:8181 \
DATABASE_URL='postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test' \
pnpm exec playwright test -c playwright.config.ts
```

`playwright.config.ts` validates each origin as a bare scheme, host, and port — a trailing path or credential is rejected at startup.

The mocked config is pinned to port 8081 and cannot be relocated, so it runs against whichever Web server holds that port.

## Ownership of processes

Track what this task started and stop only that. Leave the human's dev servers, their editor, and their containers running, and say so at handoff when something was left up — a compose service still running is worth one line, not a silent shutdown.
