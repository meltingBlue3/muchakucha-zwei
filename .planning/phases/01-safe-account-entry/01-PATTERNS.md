# Phase 1: 安全账户入口 - Pattern Map

**Mapped:** 2026-08-01
**Repository state:** Greenfield; no application source exists
**Files/file groups classified:** 34
**Real code analogs found:** 0 / 34

## Greenfield Finding

A lightweight repository scan found only `.planning/`, `.git/`, and `AGENTS.md`. The expected source/workspace markers `apps/`, `packages/`, `src/`, `package.json`, `pnpm-workspace.yaml`, `compose.yaml`, and `prisma/` do not exist. Neither `.codex/skills/` nor `.agents/skills/` exists.

Therefore Phase 1 establishes the repository's first implementation conventions. There are no controllers, services, components, hooks, models, middleware, utilities, configs, or tests to copy. The old Muchakucha repositories are expressly excluded as implementation analogs: they are business references only, and their Vue, FastAPI, Kotlin, and MySQL code must not be reused (`01-CONTEXT.md:79-89`, `PROJECT.md`, `AGENTS.md`).

## Source-of-Truth Boundary

Until Phase 1 produces reviewed code, the planner must use these sources in this order:

1. `01-CONTEXT.md` for locked user decisions and phase boundaries (`01-CONTEXT.md:7-50`).
2. `01-UI-SPEC.md` for routes, primitives, tokens, interaction states, copy, responsive behavior, and accessibility (`01-UI-SPEC.md:27-42`, `155-215`, `253-284`).
3. `01-VALIDATION.md` for mandatory test files, commands, scenario coverage, and Wave 0 infrastructure (`01-VALIDATION.md:16-35`, `37-85`).
4. `01-RESEARCH.md` for the initial architecture, security invariants, project structure, API taxonomy, and code seeds (`01-RESEARCH.md:81-104`, `204-387`, `632-710`, `827-902`).
5. `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and the canonical architecture/research documents named in `01-CONTEXT.md:54-70` for global scope and stack constraints.
6. Generated OpenAPI output under `packages/api-client/` is downstream-only. Nest controller DTOs and the emitted OpenAPI document are authoritative; generated files are never hand-edited and never import Prisma types.
7. Prisma schema plus committed migration SQL are the persistence source of truth. They must not become client DTO contracts.

Research code blocks are implementation seeds, not evidence of an established repository convention. Plans should cite them as contract guidance, then make the first implementation internally consistent.

## File Classification

| New/Modified File or Group | Role | Data Flow | Closest Existing Analog | Match Quality |
|---|---|---|---|---|
| `package.json` | config | batch | None; `01-VALIDATION.md:63` | no analog |
| `pnpm-workspace.yaml` | config | batch | None; `01-VALIDATION.md:63` | no analog |
| `tsconfig.base.json`, `packages/config/**` | config | transform | None; research structure `01-RESEARCH.md:264-267` | no analog |
| `compose.yaml`, `.env.test.example` | config | event-driven | None; `01-VALIDATION.md:64` | no analog |
| `playwright.config.ts` | config | request-response | None; `01-VALIDATION.md:67` | no analog |
| `apps/api/src/main.ts`, `apps/api/src/app.module.ts` | config/provider | request-response | None; Nest/Fastify boundary `01-RESEARCH.md:220-227` | no analog |
| `apps/api/prisma.config.ts` | config | CRUD | None; Prisma 7 seed `01-RESEARCH.md:829-838` | no analog |
| `apps/api/prisma/schema.prisma` | model | CRUD | None; schema seed `01-RESEARCH.md:276-350` | no analog |
| `apps/api/prisma/migrations/**/migration.sql` | migration | batch | None; migration history contract | no analog |
| `apps/api/src/infrastructure/prisma/prisma.service.ts` | provider | CRUD | None; Prisma 7 seed `01-RESEARCH.md:829-838` | no analog |
| `apps/api/src/modules/auth/auth.module.ts` | config/provider | request-response | None; research structure `01-RESEARCH.md:258-263` | no analog |
| `apps/api/src/modules/auth/auth.controller.ts` | controller | request-response | None; endpoint table `01-RESEARCH.md:693-708` | no analog |
| `apps/api/src/modules/auth/dto/*.dto.ts` | model | transform | None; DTO/OpenAPI boundary | no analog |
| `apps/api/src/modules/auth/auth.service.ts` and focused auth use cases | service | CRUD | None; session/one-time-token transaction seeds | no analog |
| `apps/api/src/modules/auth/access-token.guard.ts` | middleware | request-response | None; architecture boundary `01-RESEARCH.md:220-227` | no analog |
| `apps/api/src/modules/auth/password-hasher.ts`, `opaque-token.ts` | utility/service | transform | None; security defaults `01-RESEARCH.md:718-729` | no analog |
| `apps/api/src/modules/users/users.controller.ts`, `users.service.ts`, DTOs | controller/service/model | CRUD | None; `/users/me` contract `01-RESEARCH.md:707-708` | no analog |
| `apps/api/src/infrastructure/mail/mail.port.ts` | provider | event-driven | None; MailPort seed `01-RESEARCH.md:679-691` | no analog |
| `apps/api/src/infrastructure/mail/smtp-mail.adapter.ts`, test capture adapter | service/provider | event-driven | None; MailPort seed `01-RESEARCH.md:679-691` | no analog |
| `apps/api/src/common/errors/**`, validation/rate-limit config | middleware/utility | request-response | None; error envelope `01-RESEARCH.md:710` | no analog |
| `packages/api-client/**` | generated service/model | request-response | None; generated-contract boundary | no analog |
| `apps/client/app/_layout.tsx`, auth/protected layouts | route/provider | event-driven | None; bootstrap/routing contract | no analog |
| `apps/client/app/(auth)/**` login/register/forgot/reset/status routes | route/component | request-response | None; UI route inventory `01-UI-SPEC.md:155-174` | no analog |
| `apps/client/app/auth/**` verify/reset link landing routes | route | request-response | None; safe-link contract `01-RESEARCH.md:669-677` | no analog |
| `apps/client/app/(protected)/profile.tsx` and household handoff | route/component | CRUD | None; UI inventory `01-UI-SPEC.md:172-174` | no analog |
| `apps/client/src/features/auth/session-bootstrap.ts(x)` | store/provider | event-driven | None; state-machine seed `01-RESEARCH.md:654-667` | no analog |
| `apps/client/src/features/auth/forms/**`, schemas/mutations | component/hook | request-response | None; form contract `01-UI-SPEC.md:175-200` | no analog |
| `apps/client/src/platform/session/session-transport.ts` | provider | request-response | None; interface seed `01-RESEARCH.md:636-650` | no analog |
| `apps/client/src/platform/session/session-transport.native.ts` | provider | file-I/O/request-response | None; SecureStore seed `01-RESEARCH.md:855-868` | no analog |
| `apps/client/src/platform/session/session-transport.web.ts` | provider | request-response | None; cookie/Web Lock seeds `01-RESEARCH.md:636-652`, `870-879` | no analog |
| `apps/client/src/api/**` generated-client wrapper and refresh mutex | service/utility | request-response | None; architecture structure `01-RESEARCH.md:249-253` | no analog |
| `apps/client/src/ui/theme.ts`, primitives listed by UI-SPEC | component/config | transform | None; `01-UI-SPEC.md:27-128` | no analog |
| API/client unit and integration tests named in Wave 0 | test | request-response/CRUD | None; exact inventory in `01-VALIDATION.md` | no analog |
| `apps/api/test/security/asvs-v5-l1.test.ts`, `docs/security/asvs-v5.0.0-l1.md` | test/documentation | batch | None; official ASVS v5.0.0 CSV mapping | no analog |
| `apps/api/src/modules/auth/data/common-passwords-*` | runtime policy data | transform | None; resolved Phase 1 common-password policy | no analog |
| `e2e/auth/*.spec.ts` | test | request-response | None; exact inventory in `01-VALIDATION.md` | no analog |

File names not explicitly fixed by the upstream documents (for example the exact split of auth use-case files or UI primitive files) remain planner discretion. Preserve the listed module boundaries even if the planner chooses a slightly different filename.

## Pattern Assignments

### Workspace, Runtime, and Test Configuration

**Applies to:** root workspace files, shared TypeScript config, Compose, API/client test config, Playwright config.

**Real analog:** None.

**Planning source:** `01-VALIDATION.md:16-35`, `61-74`.

Copy the contract, not a nonexistent repo pattern:

```text
pnpm workspace
├── apps/client       Expo universal client; Jest/jest-expo/RNTL
├── apps/api          NestJS/Fastify; Vitest/Nest testing/Supertest
└── packages          generated API client, shared config, test support

Integration services: PostgreSQL 18 + Mailpit
Web E2E/a11y: Playwright + @axe-core/playwright
```

Root scripts must expose the exact one-shot gates `pnpm test:quick`, `pnpm test`, `pnpm test:integration`, and `pnpm test:e2e:web`. Pin `packageManager`; do not commit `latest-10`. Config/env files must fail fast without committing secrets.

### Prisma Data Model and Infrastructure

**Applies to:** `schema.prisma`, migration SQL, `prisma.config.ts`, Prisma provider/repositories.

**Real analog:** None.

**Planning source:** `01-RESEARCH.md:270-350`, `829-838`.

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
export const prisma = new PrismaClient({ adapter });
```

The initial schema must model `User`, `AuthSession`, `RefreshToken`, `EmailVerificationToken`, and `PasswordResetToken`. Use real foreign keys, unique/check constraints, UTC `timestamptz`, hashed-token columns, retained refresh generations, and reviewed migrations. Prisma 7 uses `prisma.config.ts` plus `PrismaPg`; do not copy Prisma 6 datasource/bootstrap conventions.

### Auth Controller, DTO, and Error Boundary

**Applies to:** auth controller, DTOs, global validation, throttling, guards, error envelope.

**Real analog:** None.

**Planning source:** `01-RESEARCH.md:693-710`, architecture flow `204-238`.

Controllers expose named `/api/v1` use cases, not generic CRUD: registration, resend/complete verification, login, refresh, logout, request/complete reset. DTOs are whitelisted and OpenAPI-decorated. Apply this order at the boundary:

```text
DTO validation -> throttling -> access guard (where required) -> use case
```

Use the stable envelope:

```typescript
type ApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  retryAfterSeconds?: number;
  correlationId?: string;
};
```

Clients branch on `code`, never localized `message`. Enumeration-sensitive endpoints keep status/body shape and processing path consistent. Refresh response shape is selected from the accepted credential source, never a caller-supplied platform header.

### Refresh Rotation and One-Time Token Transactions

**Applies to:** refresh, verification, password-reset use cases and repositories.

**Real analog:** None.

**Planning source:** `01-RESEARCH.md:353-386`, `669-677`, `881-902`.

```typescript
const outcome = await prisma.$transaction(async (tx) => {
  const claimed = await tx.refreshToken.updateMany({
    where: { id: token.id, consumedAt: null },
    data: { consumedAt: now },
  });

  if (claimed.count !== 1) {
    await tx.authSession.update({
      where: { id: token.sessionId },
      data: { revokedAt: now, compromisedAt: now },
    });
    return { kind: 'replayed' } as const;
  }

  await tx.refreshToken.create({ data: nextGeneration });
  return { kind: 'rotated' } as const;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

Use conditional consume inside a serializable transaction. A known consumed refresh token commits session compromise/revocation before returning an error. Password reset consumes the reset token, updates the password hash, and revokes every user session in one transaction. Retry only bounded serialization conflicts, never domain replay outcomes.

### Mail Port and Adapter

**Applies to:** `mail.port.ts`, SMTP adapter, capture/fake adapter.

**Real analog:** None.

**Planning source:** `01-RESEARCH.md:679-691`.

```typescript
export interface MailPort {
  sendEmailVerification(message: VerificationMail): Promise<void>;
  sendPasswordReset(message: PasswordResetMail): Promise<void>;
  sendPasswordChangedNotice(message: PasswordChangedMail): Promise<void>;
}
```

Domain/use-case code imports the port, never Nodemailer or Mailpit. Commit user/token state before delivery. SMTP is infrastructure; tests use a capture adapter. Never log credential-bearing links or raw tokens.

### Platform-Split Session Transport

**Applies to:** session transport interface, native/web implementations, refresh mutex.

**Real analog:** None.

**Planning source:** `01-RESEARCH.md:636-667`, `855-879`.

```typescript
interface SessionTransport {
  restore(): Promise<RestoreResult>;
  refresh(): Promise<AccessSession>;
  acceptLogin(response: LoginResponse): Promise<AccessSession>;
  clear(): Promise<void>;
}
```

Native stores only long-lived refresh/pending proof material in `expo-secure-store`; access tokens stay in memory. Web has no JavaScript refresh-token or pending-proof getter: registration and verification API responses issue/clear HttpOnly cookies and the browser sends them with `credentials: 'include'`; secret JSON fields are absent. Native refresh is process-wide single-flight; Web uses a same-origin Web Lock with an in-tab fallback. Never use AsyncStorage or localStorage for refresh material.

### Bootstrap State and Router Ownership

**Applies to:** root layout, protected/auth layouts, bootstrap store/provider, offline/expired screens.

**Real analog:** None.

**Planning source:** `01-RESEARCH.md:654-667`; `01-CONTEXT.md:18-36`; `01-UI-SPEC.md:208-215`, `244-251`.

```typescript
type BootstrapState =
  | { kind: 'booting' }
  | { kind: 'authenticated'; accessToken: string; user: Me }
  | { kind: 'unauthenticated' }
  | { kind: 'offlineWaiting'; retainedCredential: true }
  | { kind: 'reauthRequired'; reason: 'expired' | 'revoked' | 'replayed' };
```

Hold the branded splash until fonts and session state resolve. Explicit protocol authentication rejection clears local state and routes to login; timeout, DNS/offline, and 5xx retain credentials and route to offline waiting. Preserve only safe internal intended routes. Phase 1 routes authenticated users to a clear household handoff boundary; Phase 2 owns household creation/joining.

### Safe Email-Link Landing

**Applies to:** verification and reset link routes plus completion mutations.

**Real analog:** None.

**Planning source:** `01-RESEARCH.md:669-677`; `01-UI-SPEC.md:208-215`.

An HTTPS GET only lands in the Expo route. Extract the token once, immediately replace the visible/history URL with a token-free route, then POST the mutation. Never render, log, analyze, or retain the token. Verification distinguishes success-auto-login, success-login-required, expired, already-used, and invalid. Password reset never auto-logs in.

### UI Theme, Primitives, Forms, and Screens

**Applies to:** theme, shared primitives, auth screens/forms, status panels, profile form.

**Real analog:** None.

**Planning source:** `01-UI-SPEC.md:27-145`, `155-206`, `217-284`.

Feature screens compose `Screen`, `Stack`, `Inline`, `Text`, `Heading`, `Button`, `IconButton`, `TextField`, `PasswordField`, `FormMessage`, `Banner`, `Spinner`, `BrandMark`, `AuthShell`, `LinkText`, and `StatusPanel`. All visual values come from the typed Restyle theme; raw color, spacing, radius, and font-size literals belong only in theme files. Use individually imported Lucide icons.

Forms use React Hook Form + Zod; validate on blur after interaction and on submit. Keep one primary action, stable button labels during loading, persistent labels, field-error associations, live announcements, 48×48 minimum targets, 200% text scaling, and WCAG 2.2 AA. The UI's 60-second resend countdown mirrors server eligibility and never replaces server throttling.

### OpenAPI-Generated Client Boundary

**Applies to:** API DTOs/OpenAPI emission, `packages/api-client/**`, client API wrapper.

**Real analog:** None.

**Planning source:** `01-RESEARCH.md:103-104`, `240-267`; `01-VALIDATION.md:73`.

Controller DTOs publish the contract. Generate and commit `packages/api-client`, then fail CI/test drift checks if regeneration changes it. Client feature code imports the generated client through a thin wrapper that owns access-token injection, credential mode, refresh serialization, and typed error mapping. Generated files must not import Prisma and must not be manually patched.

### Tests

**Applies to:** API integration, client session/component tests, Web E2E/a11y tests.

**Real analog:** None.

**Planning source:** `01-VALIDATION.md:37-94`.

Test filenames and scenario matrices are contractual. API integration tests cover registration, verification, login, refresh rotation/replay/concurrency, password reset, logout isolation, `/users/me`, the committed top-3000 common-password fixture, and the ASVS mapping audit. Client tests separately cover bootstrap, platform transports, raw-style rejection, measured contrast, primitive states, registration, verification, reset, and profile. Web E2E covers registration through Mailpit, link sanitization, login/reset, cookie attributes/no-secret-JSON, and an axe/responsive/focus/live-region/reduced-motion/forced-colors matrix at 320/390/768/1440. Use migrated disposable PostgreSQL state and deterministic reset helpers; do not mock away transaction/constraint behavior for SAFE-04.

## Shared Patterns

### Authentication and Authorization

- Access JWT contains minimal `sub` and `sid`; current profile comes from `/users/me`.
- One durable `AuthSession` represents one device login. Ordinary logout revokes only that session.
- Password reset revokes all sessions. Refresh replay revokes/marks compromised only the affected device session.
- Access guards protect `/users/me`; DTO whitelisting prevents mass assignment.

### Error and State Handling

- Server emits stable machine-readable codes in one envelope.
- Client distinguishes credential rejection from transport/server availability failure.
- Verification link outcomes are intentionally distinct because the caller possesses the token; registration/reset request responses remain enumeration-safe.
- Every page-level state uses icon, heading, explanation, and recovery action; color alone never carries meaning.

### Secret Handling and Logging

- Passwords use Argon2id; opaque verification/reset/refresh tokens use CSPRNG values and persist only SHA-256 hashes.
- Native refresh/pending proof uses SecureStore. Web refresh/pending proof uses scoped HttpOnly cookies. Access tokens remain in memory.
- Token query strings are sanitized before rendering/analytics; structured logging redacts credential-bearing URLs and secrets.

### Transactions and Integrity

- Conditional consume prevents double use.
- Rotation, verification completion/optional session creation, and reset/global revocation are atomic.
- Retain refresh generations long enough to detect replay.
- Database foreign keys, unique/check constraints, and `timestamptz` enforce invariants; application-only checks are insufficient.

### UI and Accessibility

- Typed Restyle tokens and owned primitives are the only styling boundary.
- Mobile-first 52px controls, 48px minimum touch targets, centered 440px Web auth card, no independent desktop shell.
- Warm coral/cream palette, teal only for success, no large household illustration, no heavy native shadows.
- Reduced motion, forced colors, keyboard flow, screen-reader announcements, and 200% text scaling are required behavior, not polish.

## No Analog Found

Every Phase 1 target is listed here because the repository has no application code. The planner must use the contracts and research seeds above rather than claim an existing implementation analog.

| Area | Reason |
|---|---|
| Workspace/config | No package or workspace files exist. |
| API/controllers/services/guards | No `apps/api` or server source exists. |
| Prisma/models/migrations | No schema, generated client, or migration history exists. |
| Client/routes/components/hooks/stores | No `apps/client` or React Native source exists. |
| Mail/session adapters | No infrastructure or platform adapter source exists. |
| Generated client | No OpenAPI output/package exists. |
| Tests | No test framework config or test source exists. |

## Metadata

**Analog search scope:** repository root excluding `.git`; explicit checks for `apps`, `packages`, `src`, workspace/config files, Prisma, and project skill directories.

**Files scanned outside planning:** 1 (`AGENTS.md`); zero source files.

**Pattern extraction date:** 2026-08-01

**Next convention milestone:** After the first vertical slice is implemented and reviewed, future pattern maps should prefer its real files over research snippets, while continuing to respect the locked contracts above.
