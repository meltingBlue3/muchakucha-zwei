# API Implementation

Read this playbook when changing an endpoint, DTO, error code, permission rule, Prisma schema, or migration. It covers the contracts a server change must keep; test selection lives in [testing.md](testing.md).

## Request and response contracts

`/api/v1` stays backward compatible. New behavior arrives as a new field, a new endpoint, or an optional parameter; existing clients keep working without a coordinated release.

`apps/api/src/main.ts` fixes the shapes every module inherits:

- Errors are `{ error: { code, message, details?, retryAfterSeconds? }, requestId }`. Reading `body.code` finds nothing — the code sits at `body.error.code`, in tests as well as in client code.
- A service raises a typed failure by passing a structured body: `throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Note not found.' })`. Without that body the filter falls back to a generic code derived from the status.
- `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`, and `transform`. Failures become `400 VALIDATION_FAILED` with `details` listing each field and its constraint names.
- `/api/v1/auth/*` accepts only `POST` and `OPTIONS`; anything else is rejected with `405 METHOD_NOT_ALLOWED` before routing.
- Logs redact authorization headers, cookies, URLs, and any `password`, `token`, `refreshToken`, or `pendingProof` field. New sensitive fields join that redaction list in the same change.

Every DTO property carries a `class-validator` decorator, and array properties validate their element type with `{ each: true }`. An undecorated property is not merely unvalidated: a value of the wrong shape reaches the service and surfaces as a 500 instead of a 400.

## Rate limits

A global throttler allows 60 requests per minute per client. Authentication routes tighten this per route with `@Throttle`, down to 5 per hour for password reset and similar flows.

The limiter is bypassed only when `NODE_ENV=test` and `E2E_DISABLE_RATE_LIMITS=true`. A test suite that issues many requests sets both in the app environment; one that does not will start seeing `429 RATE_LIMITED` partway through and fail in a way that looks like a logic bug.

## Permissions

Authorization is a server property. Client guards and hidden buttons are convenience, never the boundary.

Every household-scoped handler resolves the caller's membership first. A caller who is not a member receives `404 HOUSEHOLD_NOT_FOUND`, and a resource belonging to another household receives that resource's own not-found code — existence is not disclosed to a non-member. A member who is authenticated and in scope but lacks the role for an action receives `403 FORBIDDEN`. Follow `src/modules/notes/notes.service.ts` for the ordering of these checks.

`src/modules/households/household-policy.ts` holds the governance decisions as pure functions — role change, removal, ownership transfer, owner leave — so services and integration tests share one source. Extend those functions rather than re-deciding a rule inside a service, and keep the staleness, cross-household, and foreign-key checks in the service where the database is available.

## Schema and data

- Schema changes ship with a migration in `apps/api/prisma/migrations/`. Integration setup runs `prisma migrate deploy`, so an uncommitted schema edit fails the suite rather than silently drifting.
- Preserve database constraints and transactions. A rule the database can enforce is enforced there as well as in the service.
- Time points are `timestamptz` in UTC. Calendar dates and recurrence time zones are distinct concepts and stay distinct in the schema, the DTO, and the client.
- Prisma models stay inside the API. Controllers return DTOs; `src/generated/prisma/` is generated output.
- Refresh, verification, and reset credentials are stored as hashes only — `RefreshToken.tokenHash`, `EmailVerificationToken.tokenHash`, `PasswordResetToken.tokenHash`. A new credential follows the same rule: the plaintext leaves in the response and is never persisted or logged.

## Regenerating the contract

Update the DTOs and templates in `apps/api/src/openapi/generate-openapi.ts`, then:

```sh
pnpm openapi:generate   # rewrites packages/api-client
pnpm openapi:check      # regenerates and fails on any diff against HEAD
```

`packages/api-client/` is generated in full, including `openapi.json` and `src/generated/`. Editing it by hand produces a change that the next generation silently discards, and `openapi:check` compares against `HEAD`, so a regenerated client is committed together with the server change.
